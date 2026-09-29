/**
 * ==========================================================================
 * Greentage — API du formulaire « Commander ou nous écrire »
 * Cloudflare Worker (offre gratuite : 100 000 requêtes par jour).
 *
 * Le site (GitHub Pages) reste 100 % statique : il envoie la demande ici,
 * et c’est ici seulement que se trouvent les clés secrètes (jamais dans le site).
 *
 * Variables (wrangler.toml ou tableau de bord Cloudflare) :
 *   ALLOWED_ORIGIN   origine autorisée, ex. https://michprk.github.io ou https://greentage.be
 *   SHOP_EMAIL       boîte qui reçoit les demandes, ex. info.greentage@gmail.com
 *   FROM_EMAIL       expéditeur vérifié chez Resend, ex. Greentage <site@greentage.be>
 * Secret (npx wrangler secret put RESEND_API_KEY) :
 *   RESEND_API_KEY   clé de l’API Resend (envoi des e-mails)
 * Liaison KV facultative :
 *   RATE_LIMIT       limite à 5 demandes par tranche de 10 minutes et par adresse IP
 * ==========================================================================
 */

const TOPICS = { bouquet: 'Un bouquet', plante: 'Une plante ou un conseil', cadeau: 'Un cadeau', vintage: 'Une pièce vintage', autre: 'Autre chose' };
const BUDGETS = { '': 'À définir', 'moins-30': 'Moins de 30 €', '30-50': '30 à 50 €', '50-80': '50 à 80 €', 'plus-80': 'Plus de 80 €' };
const EMAIL_RE = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)*\.[a-z]{2,}$/i;
const PHONE_RE = /^\+?[0-9 ()./-]{8,20}$/;
const MAX_BODY = 8 * 1024;

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin') || '';
    const allowed = (env.ALLOWED_ORIGIN || '').split(',').map((s) => s.trim()).filter(Boolean);
    const cors = allowed.includes(origin) ? origin : allowed[0] || 'null';

    if (request.method === 'OPTIONS') return reply(204, null, cors);
    if (url.pathname !== '/contact') return reply(404, { ok: false, error: 'Adresse inconnue.' }, cors);
    if (request.method !== 'POST') return reply(405, { ok: false, error: 'Méthode non autorisée.' }, cors);
    if (!allowed.includes(origin)) return reply(403, { ok: false, error: 'Origine non autorisée.' }, cors);

    const type = request.headers.get('Content-Type') || '';
    if (!type.includes('application/json')) return reply(415, { ok: false, error: 'Format non pris en charge.' }, cors);
    const raw = await request.text();
    if (raw.length > MAX_BODY) return reply(413, { ok: false, error: 'Demande trop volumineuse.' }, cors);

    let data;
    try { data = JSON.parse(raw); } catch { return reply(400, { ok: false, error: 'Demande illisible.' }, cors); }

    // Anti-spam 1 : champ piège rempli → on répond « OK » sans rien envoyer
    if (data.website) return reply(200, { ok: true }, cors);
    // Anti-spam 2 : envoi trop rapide pour un humain
    if (!(Number(data.elapsed) >= 3000)) return reply(400, { ok: false, error: 'Envoi trop rapide. Réessayez dans quelques secondes.' }, cors);

    // Anti-spam 3 : limite par adresse IP (si la liaison KV est configurée)
    if (env.RATE_LIMIT) {
      const ip = request.headers.get('CF-Connecting-IP') || 'inconnue';
      const key = 'rl:' + (await sha256(ip + (env.RATE_SALT || 'greentage')));
      const count = Number(await env.RATE_LIMIT.get(key)) || 0;
      if (count >= 5) return reply(429, { ok: false, error: 'Trop de demandes. Réessayez dans quelques minutes.' }, cors);
      ctx.waitUntil(env.RATE_LIMIT.put(key, String(count + 1), { expirationTtl: 600 }));
    }

    // Validation (la même que dans le navigateur : on ne fait jamais confiance au client)
    const clean = (v, max) => String(v ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, max);
    const f = {
      name: clean(data.name, 80),
      email: clean(data.email, 120),
      phone: clean(data.phone, 24),
      topic: TOPICS[data.topic] ? data.topic : 'autre',
      date: /^\d{4}-\d{2}-\d{2}$/.test(data.date || '') ? data.date : '',
      budget: Object.prototype.hasOwnProperty.call(BUDGETS, data.budget || '') ? (data.budget || '') : '',
      message: clean(data.message, 1500),
    };
    const fields = {};
    if (f.name.length < 2) fields.name = 'Indiquez votre nom.';
    if (!EMAIL_RE.test(f.email)) fields.email = 'Cette adresse e-mail ne semble pas valide.';
    if (f.phone && !PHONE_RE.test(f.phone)) fields.phone = 'Ce numéro ne semble pas valide.';
    if (f.message.length < 10) fields.message = 'Écrivez-nous quelques mots (10 caractères minimum).';
    if ((f.message.match(/https?:\/\/|www\./gi) || []).length > 1) fields.message = 'Un seul lien maximum dans le message.';
    if (data.consent !== true) fields.consent = 'Le consentement est nécessaire pour traiter votre demande.';
    if (Object.keys(fields).length) return reply(400, { ok: false, error: 'Merci de corriger les champs indiqués.', fields }, cors);

    // Envoi de l’e-mail à la boutique (texte brut : aucun risque d’injection HTML)
    const lines = [
      'Nouvelle demande depuis le site Greentage',
      '',
      'Nom : ' + f.name,
      'E-mail : ' + f.email,
      'Téléphone : ' + (f.phone || '—'),
      'Demande : ' + TOPICS[f.topic],
      'Pour le : ' + (f.date ? f.date.split('-').reverse().join('/') : '—'),
      'Budget : ' + BUDGETS[f.budget],
      '',
      f.message,
      '',
      '— Envoyé le ' + new Date().toLocaleString('fr-BE', { timeZone: 'Europe/Brussels' }),
    ];
    if (!env.RESEND_API_KEY || !env.SHOP_EMAIL || !env.FROM_EMAIL) return reply(500, { ok: false, error: 'Service momentanément indisponible.' }, cors);
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + env.RESEND_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: env.FROM_EMAIL,
        to: [env.SHOP_EMAIL],
        reply_to: f.email,
        subject: 'Demande via le site — ' + TOPICS[f.topic] + ' — ' + f.name,
        text: lines.join('\n'),
      }),
    });
    if (!res.ok) return reply(502, { ok: false, error: 'Envoi impossible pour le moment. Réessayez un peu plus tard.' }, cors);
    return reply(200, { ok: true }, cors);
  },
};

function reply(status, body, origin) {
  const headers = new Headers({
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Accept',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
    'Cache-Control': 'no-store',
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
  });
  if (body === null) return new Response(null, { status, headers });
  headers.set('Content-Type', 'application/json; charset=utf-8');
  return new Response(JSON.stringify(body), { status, headers });
}

async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
