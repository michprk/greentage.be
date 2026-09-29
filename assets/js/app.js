/* ==========================================================================
   Greentage — interactions et animations
   Aucune dépendance, aucune requête vers un service tiers sans accord.
   Tout mouvement est coupé si le visiteur a demandé « réduire les animations ».
   ========================================================================== */
(() => {
  'use strict';

  const d = document;
  const html = d.documentElement;
  const $ = (s, r = d) => r.querySelector(s);
  const $$ = (s, r = d) => Array.from(r.querySelectorAll(s));
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const easeOut = (t) => 1 - Math.pow(1 - t, 3);
  const easeBack = (t) => { const c = 1.6; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };

  // boot.js a posé « js » ; s’il l’a retiré (script trop lent), on reste en mode statique
  const animated = html.classList.contains('js');
  const reduced = html.classList.contains('reduced') || !animated;
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)').matches;
  const desktop = matchMedia('(min-width: 1024px)');

  /* ------------------------------------------------------------------------
     Moteur : une seule boucle requestAnimationFrame, réveillée au défilement
     ------------------------------------------------------------------------ */
  const view = { y: scrollY, vh: innerHeight, vw: innerWidth, vel: 0, dt: 16.7, docH: 0 };
  const tasks = new Set();
  const resizers = new Set();
  let rafId = 0;
  let lastY = scrollY;
  let lastT = 0;

  function frame(t) {
    rafId = 0;
    view.dt = lastT ? Math.min(t - lastT, 64) : 16.7;
    lastT = t;
    view.y = scrollY;
    view.vel = lerp(view.vel, view.y - lastY, 0.25);
    lastY = view.y;
    let again = Math.abs(view.vel) > 0.05;
    tasks.forEach((fn) => { if (fn(t) === true) again = true; });
    if (again) wake(); else lastT = 0;
  }
  function wake() { if (!rafId) rafId = requestAnimationFrame(frame); }
  function measureDoc() { view.docH = html.scrollHeight; }

  addEventListener('scroll', wake, { passive: true });
  let resizeTimer = 0;
  addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      view.vh = innerHeight; view.vw = innerWidth;
      resizers.forEach((fn) => fn());
      measureDoc(); wake();
    }, 120);
  }, { passive: true });
  if ('ResizeObserver' in window) {
    let roTimer = 0;
    new ResizeObserver(() => {
      clearTimeout(roTimer);
      roTimer = setTimeout(() => { resizers.forEach((fn) => fn()); measureDoc(); wake(); }, 150);
    }).observe(d.body);
  }

  const onScreen = (el, cb, margin = '0px') => {
    const io = new IntersectionObserver((entries) => entries.forEach((e) => cb(e.isIntersecting, e)), { rootMargin: margin });
    io.observe(el);
    return io;
  };

  /* ------------------------------------------------------------------------
     1. Consentement cookies (RGPD / APD) + Google Analytics 4 en Consent Mode v2
        Rien n’est chargé chez Google tant que le visiteur n’a pas accepté.
     ------------------------------------------------------------------------ */
  const Consent = (() => {
    const KEY = 'gt_consent';
    const MAX_AGE = 182 * 24 * 3600 * 1000; // choix redemandé après 6 mois
    const GA_ID = html.dataset.ga || '';
    const DEBUG = /[?&]debug_analytics\b/.test(location.search);
    let state = null;
    let gaLoaded = false;

    window.dataLayer = window.dataLayer || [];
    function gtag() { window.dataLayer.push(arguments); }
    gtag('consent', 'default', {
      ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied',
      analytics_storage: 'denied', functionality_storage: 'granted', security_storage: 'granted',
    });

    function load() {
      try {
        const s = JSON.parse(localStorage.getItem(KEY) || 'null');
        if (s && Date.now() - s.ts < MAX_AGE) return s;
      } catch (e) { /* stockage indisponible (navigation privée) */ }
      return null;
    }
    function save(analytics) {
      state = { v: 1, analytics: !!analytics, ts: Date.now() };
      try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* ignore */ }
      apply();
    }
    function apply() {
      const ok = !!(state && state.analytics);
      gtag('consent', 'update', { analytics_storage: ok ? 'granted' : 'denied' });
      if (ok && GA_ID && !gaLoaded) {
        gaLoaded = true;
        const s = d.createElement('script');
        s.async = true;
        s.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(GA_ID);
        d.head.append(s);
        gtag('js', new Date());
        gtag('config', GA_ID, {
          cookie_expires: 34128000, // 13 mois maximum (recommandation APD / CNIL)
          allow_google_signals: false,
          allow_ad_personalization_signals: false,
        });
      }
      if (!ok) {
        // Retrait du consentement : on efface les cookies Google déjà posés
        d.cookie.split(';').map((c) => c.split('=')[0].trim()).filter((n) => /^_ga/.test(n)).forEach((n) => {
          const host = location.hostname.split('.').slice(-2).join('.');
          d.cookie = n + '=; Max-Age=0; path=/';
          d.cookie = n + '=; Max-Age=0; path=/; domain=.' + host;
        });
      }
    }
    function track(name, params = {}) {
      if (DEBUG) console.info('[analytics]', name, params, state && state.analytics ? '(envoyé)' : '(bloqué : pas de consentement)');
      if (state && state.analytics && GA_ID) gtag('event', name, params);
    }
    function init() {
      const box = $('[data-cookie]');
      state = load();
      if (state) apply();
      if (!box) return;
      const main = $('[data-cookie-main]', box);
      const prefs = $('[data-cookie-prefs]', box);
      const sw = $('[data-consent-analytics]', box);
      const custom = $('[data-consent="customize"]', box);
      let returnFocus = null;

      const open = (withPrefs = false) => {
        returnFocus = d.activeElement;
        box.hidden = false;
        main.hidden = withPrefs;
        prefs.hidden = !withPrefs;
        if (custom) custom.setAttribute('aria-expanded', String(withPrefs));
        // Signal « Global Privacy Control » : la mesure d’audience reste décochée par défaut
        sw.checked = state ? !!state.analytics : false;
        requestAnimationFrame(() => requestAnimationFrame(() => box.classList.add('is-visible')));
      };
      const close = () => {
        box.classList.remove('is-visible');
        setTimeout(() => { box.hidden = true; }, reduced ? 0 : 450);
        if (returnFocus && returnFocus !== d.body && d.contains(returnFocus)) returnFocus.focus({ preventScroll: true });
      };

      box.addEventListener('click', (e) => {
        const b = e.target.closest('[data-consent]');
        if (!b) return;
        const action = b.dataset.consent;
        if (action === 'accept') { save(true); close(); }
        else if (action === 'refuse') { save(false); close(); }
        else if (action === 'save') { save(sw.checked); close(); }
        else if (action === 'customize') { main.hidden = true; prefs.hidden = false; custom.setAttribute('aria-expanded', 'true'); sw.focus(); return; }
        track('consent_update', { analytics: !!(state && state.analytics) });
      });
      box.addEventListener('keydown', (e) => { if (e.key === 'Escape' && state) close(); });
      $$('[data-cookie-settings]').forEach((b) => b.addEventListener('click', () => { open(true); setTimeout(() => sw.focus(), 60); }));

      if (!state) setTimeout(() => open(false), html.classList.contains('intro') ? 2600 : 900);
    }
    return { init, track };
  })();

  /* ------------------------------------------------------------------------
     2. Ouverture (première visite) : on bloque le défilement le temps du rideau
     ------------------------------------------------------------------------ */
  function initIntro() {
    // Attention : <html> porte aussi la classe « intro », d’où ce sélecteur précis
    const el = $('div.loader');
    if (!el || !html.classList.contains('intro')) { if (el) el.remove(); return; }
    try { sessionStorage.setItem('gt_intro', '1'); } catch (e) { /* ignore */ }
    const body = d.body;
    body.style.overflow = 'hidden';
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      html.classList.remove('intro');
      body.style.overflow = '';
      el.remove();
      wake();
    };
    el.addEventListener('animationend', (e) => { if (e.animationName === 'intro-out') finish(); });
    setTimeout(finish, 3800); // filet de sécurité
  }

  /* ------------------------------------------------------------------------
     3. Découpage des titres en mots (apparition mot par mot)
     ------------------------------------------------------------------------ */
  function splitWords(el, onWord) {
    let i = 0;
    const walk = (node) => {
      Array.from(node.childNodes).forEach((child) => {
        if (child.nodeType === 3) {
          // on ne coupe que sur les vrais espaces : les espaces insécables restent collés
          const parts = child.textContent.split(/([ \t\n\r]+)/);
          const frag = d.createDocumentFragment();
          parts.forEach((p) => {
            if (!p) return;
            if (/^[ \t\n\r]+$/.test(p)) { frag.append(' '); return; }
            const w = d.createElement('span');
            w.className = 'w';
            const inner = d.createElement('span');
            inner.textContent = p;
            w.append(inner);
            w.style.setProperty('--i', i++);
            if (onWord) onWord(w);
            frag.append(w);
          });
          child.replaceWith(frag);
        } else if (child.nodeType === 1 && child.tagName !== 'BR' && !child.classList.contains('pill')) {
          walk(child);
        } else if (child.nodeType === 1 && child.classList.contains('pill') && onWord) {
          onWord(child);
        }
      });
    };
    walk(el);
    return i;
  }

  /* ------------------------------------------------------------------------
     4. Apparitions au défilement
     ------------------------------------------------------------------------ */
  function initReveals() {
    $$('[data-split]').forEach((el) => { splitWords(el); el.classList.add('split'); });
    // décalage en cascade pour les éléments voisins
    const groups = new Map();
    $$('.reveal, .act-card').forEach((el) => {
      const p = el.parentElement;
      if (!groups.has(p)) groups.set(p, []);
      groups.get(p).push(el);
    });
    groups.forEach((list) => { if (list.length > 1) list.forEach((el, i) => el.style.setProperty('--d', (i * 0.09).toFixed(2) + 's')); });

    const targets = $$('.reveal, .split:not(.hero__title), .tile, .act-card');
    // Mouvements réduits : les éléments apparaissent quand même, en simple fondu (voir le CSS)
    if (!animated || !('IntersectionObserver' in window)) { targets.forEach((el) => el.classList.add('is-in')); return; }
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        e.target.classList.add('is-in');
        io.unobserve(e.target);
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.1 });
    targets.forEach((el) => io.observe(el));
  }

  /* ------------------------------------------------------------------------
     5. Navigation : givrée sur la photo, pleine ensuite ; se cache en descendant
     ------------------------------------------------------------------------ */
  function initNav() {
    const nav = $('[data-nav]');
    if (!nav) return;
    const hero = $('[data-hero]');
    const ring = $('[data-progress]', nav);
    const LEN = 116.24;
    let heroH = hero ? hero.offsetHeight : 0;
    let anchorY = scrollY;
    let hidden = false;
    let solid = null;
    let lastP = -1;
    resizers.add(() => { heroH = hero ? hero.offsetHeight : 0; });

    tasks.add(() => {
      const y = view.y;
      const s = !hero || y > heroH - 80;
      if (s !== solid) { solid = s; nav.classList.toggle('is-solid', s); }
      const dy = y - anchorY;
      if (Math.abs(dy) > 8) {
        const h = dy > 0 && y > 320 && !html.classList.contains('menu-open') && !nav.contains(d.activeElement);
        if (h !== hidden) { hidden = h; nav.classList.toggle('is-hidden', h); }
        anchorY = y;
      }
      const max = Math.max(1, view.docH - view.vh);
      const p = clamp(y / max, 0, 1);
      if (ring && Math.abs(p - lastP) > 0.0005) { ring.style.strokeDashoffset = (LEN * (1 - p)).toFixed(2); lastP = p; }
    });
    nav.addEventListener('focusin', () => { hidden = false; nav.classList.remove('is-hidden'); });

    // Lien actif selon la section visible
    const links = $$('[data-spy]', nav);
    if (links.length && 'IntersectionObserver' in window) {
      const io = new IntersectionObserver((entries) => {
        entries.forEach((e) => {
          const a = links.find((l) => l.dataset.spy === e.target.id);
          if (!a) return;
          if (e.isIntersecting) { links.forEach((l) => { l.classList.remove('is-current'); l.removeAttribute('aria-current'); }); a.classList.add('is-current'); a.setAttribute('aria-current', 'true'); }
          else a.classList.remove('is-current');
        });
      }, { rootMargin: '-45% 0px -50% 0px' });
      links.forEach((a) => { const s = d.getElementById(a.dataset.spy); if (s) io.observe(s); });
    }
  }

  /* ------------------------------------------------------------------------
     6. Menu mobile (plein écran, focus piégé, Échap pour fermer)
     ------------------------------------------------------------------------ */
  function initMenu() {
    const menu = $('[data-menu]');
    const openBtn = $('[data-menu-open]');
    if (!menu || !openBtn) return;
    const closeBtn = $('[data-menu-close]', menu);
    let lastFocus = null;
    let closeTimer = 0;

    const focusables = () => $$('a[href], button:not([disabled])', menu).filter((el) => el.offsetParent !== null);
    const open = () => {
      clearTimeout(closeTimer);
      lastFocus = d.activeElement;
      menu.hidden = false;
      html.classList.add('menu-open');
      openBtn.setAttribute('aria-expanded', 'true');
      requestAnimationFrame(() => requestAnimationFrame(() => menu.classList.add('is-open')));
      setTimeout(() => closeBtn.focus(), 60);
    };
    const close = (restore = true) => {
      menu.classList.remove('is-open');
      html.classList.remove('menu-open');
      openBtn.setAttribute('aria-expanded', 'false');
      closeTimer = setTimeout(() => { menu.hidden = true; }, reduced ? 0 : 800);
      if (restore) (lastFocus && lastFocus !== d.body && d.contains(lastFocus) ? lastFocus : openBtn).focus();
    };
    openBtn.addEventListener('click', open);
    closeBtn.addEventListener('click', () => close());
    menu.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { close(); return; }
      if (e.key !== 'Tab') return;
      const f = focusables();
      if (!f.length) return;
      const first = f[0];
      const last = f[f.length - 1];
      if (e.shiftKey && d.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && d.activeElement === last) { e.preventDefault(); first.focus(); }
    });
    $$('.menu__links a', menu).forEach((a) => a.addEventListener('click', () => close(false)));
    desktop.addEventListener('change', (e) => { if (e.matches && !menu.hidden) close(false); });
  }

  /* ------------------------------------------------------------------------
     7. Ouverture de page : parallaxe de la photo
     ------------------------------------------------------------------------ */
  function initHero() {
    const hero = $('[data-hero]');
    if (!hero) return;
    const title = $('.hero__title', hero);
    const show = () => { hero.classList.add('is-in'); if (title) title.classList.add('is-in'); };
    requestAnimationFrame(show);
    setTimeout(show, 120); // filet de sécurité (onglet ouvert en arrière-plan)
    if (reduced) return;
    const media = $('[data-hero-media]', hero);
    const card = $('[data-hero-card]', hero);
    let h = hero.offsetHeight;
    let cur = 0;
    resizers.add(() => { h = hero.offsetHeight; });
    tasks.add(() => {
      if (view.y > h * 1.3 && cur > h) return false;
      const target = Math.min(view.y, h * 1.3);
      cur = lerp(cur, target, 0.14);
      if (Math.abs(target - cur) < 0.1) cur = target;
      media.style.translate = '0 ' + (cur * 0.34).toFixed(1) + 'px';
      card.style.translate = '0 ' + (cur * -0.1).toFixed(1) + 'px';
      return cur !== target;
    });
  }

  /* ------------------------------------------------------------------------
     8. Pétales et feuilles qui dérivent sur la photo d’ouverture
     ------------------------------------------------------------------------ */
  function initPetals() {
    const c = $('[data-petals]');
    if (!c || reduced || (navigator.connection && navigator.connection.saveData)) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    const DPR = Math.min(devicePixelRatio || 1, 1.5);
    const COLORS = ['#e8618c', '#f07aa0', '#f6d8c8', '#9cc2a8', '#f2c14e'];
    const rand = (a, b) => a + Math.random() * (b - a);
    let w = 0;
    let h = 0;
    let visible = true;
    const count = () => (innerWidth < 700 ? 9 : 16);
    const make = (initial) => ({
      x: rand(-0.1, 1.15) * w, y: initial ? rand(-0.2, 1) * h : rand(-140, -20),
      s: rand(6, 14), vx: rand(-0.45, -0.12), vy: rand(0.3, 0.8),
      r: rand(0, 6.28), vr: rand(-0.02, 0.02), f: rand(0, 6.28), vf: rand(0.015, 0.045),
      c: COLORS[(Math.random() * COLORS.length) | 0], a: rand(0.55, 0.92), ph: rand(0, 6.28),
    });
    let petals = [];
    const size = () => {
      w = c.clientWidth; h = c.clientHeight;
      c.width = Math.round(w * DPR); c.height = Math.round(h * DPR);
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      petals = Array.from({ length: count() }, () => make(true));
    };
    size();
    resizers.add(size);
    onScreen(c, (v) => { visible = v; if (v) wake(); });
    d.addEventListener('visibilitychange', () => { if (!d.hidden) wake(); });

    tasks.add((t) => {
      if (!visible || d.hidden) return false;
      const k = view.dt / 16.7;
      ctx.clearRect(0, 0, w, h);
      for (const p of petals) {
        p.vx += Math.sin(t * 0.0006 + p.ph) * 0.004 * k;
        p.x += (p.vx - view.vel * 0.02) * k;
        p.y += (p.vy + Math.abs(view.vel) * 0.04) * k;
        p.r += p.vr * k;
        p.f += p.vf * k;
        if (p.y > h + 30 || p.x < -40) Object.assign(p, make(false));
        const s = p.s;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.r);
        ctx.scale(1, Math.cos(p.f));
        ctx.globalAlpha = p.a;
        ctx.fillStyle = p.c;
        ctx.beginPath();
        ctx.moveTo(0, -s);
        ctx.bezierCurveTo(s * 0.95, -s * 0.9, s * 0.85, s * 0.55, 0, s);
        ctx.bezierCurveTo(-s * 0.85, s * 0.55, -s * 0.95, -s * 0.9, 0, -s);
        ctx.fill();
        ctx.restore();
      }
      return true;
    });
  }

  /* ------------------------------------------------------------------------
     9. Bandeau défilant (sa vitesse et son sens suivent le défilement)
     ------------------------------------------------------------------------ */
  function initMarquee() {
    const m = $('[data-marquee]');
    if (!m) return;
    const track = $('.marquee__track', m);
    const group = $('.marquee__group', m);
    let gw = group.offsetWidth;
    const fill = () => {
      gw = group.offsetWidth;
      const need = Math.ceil((innerWidth * 2) / Math.max(gw, 1)) + 1;
      while (track.children.length < need) track.append(group.cloneNode(true));
    };
    fill();
    resizers.add(fill);
    if (reduced) return;
    let x = 0;
    let dir = -1;
    let visible = false;
    onScreen(m, (v) => { visible = v; if (v) wake(); }, '100px');
    tasks.add(() => {
      if (!visible) return false;
      const v = view.vel;
      if (Math.abs(v) > 0.8) dir = v > 0 ? -1 : 1;
      const speed = (0.55 + Math.min(Math.abs(v) * 0.3, 16)) * (view.dt / 16.7);
      x = (x + dir * speed) % gw;
      if (x > 0) x -= gw;
      track.style.transform = 'translate3d(' + x.toFixed(2) + 'px,0,0)';
      return true;
    });
  }

  /* ------------------------------------------------------------------------
     10. Manifeste : les mots s’allument au fil de la lecture
     ------------------------------------------------------------------------ */
  function initManifesto() {
    const el = $('[data-words]');
    if (!el) return;
    const items = [];
    splitWords(el, (node) => items.push(node));
    if (!animated) { items.forEach((it) => it.classList.add('is-on')); return; }
    let visible = false;
    let lastN = -1;
    onScreen(el, (v) => { visible = v; if (v) wake(); }, '200px');
    tasks.add(() => {
      if (!visible) return false;
      const r = el.getBoundingClientRect();
      const start = view.vh * 0.88;
      const end = view.vh * 0.55;
      const p = clamp((start - r.top) / (start - end + r.height), 0, 1);
      const n = Math.round(p * items.length);
      if (n !== lastN) {
        items.forEach((it, i) => it.classList.toggle('is-on', i < n));
        lastN = n;
      }
    });
  }

  /* ------------------------------------------------------------------------
     11. Chiffres « odomètre »
     ------------------------------------------------------------------------ */
  function initCounters() {
    $$('[data-count]').forEach((el) => {
      const target = el.dataset.count;
      const from = el.dataset.from;
      const sr = d.createElement('span');
      sr.className = 'sr-only';
      sr.textContent = target;
      const odo = d.createElement('span');
      odo.className = 'odo';
      odo.setAttribute('aria-hidden', 'true');
      const cols = target.split('').map((digit, i) => {
        if (!/\d/.test(digit)) {
          // caractère fixe (« / », espace…) : pas de rouleau
          const s = d.createElement('span');
          s.className = 'odo__static';
          s.textContent = digit;
          odo.append(s);
          return null;
        }
        const col = d.createElement('span');
        col.className = 'odo__col';
        for (let n = 0; n < 20; n++) { const s = d.createElement('span'); s.textContent = n % 10; col.append(s); }
        const to = +digit;
        const start = from != null ? 10 + (+from) : 0;
        const end = from != null ? to : 10 + to;
        col.style.setProperty('--d', (i * 0.14).toFixed(2) + 's');
        col.style.transform = 'translateY(-' + (reduced ? end : start) + 'em)';
        col.dataset.end = end;
        odo.append(col);
        return col;
      }).filter(Boolean);
      el.replaceChildren(sr, odo);
      if (reduced) return;
      const io = onScreen(el, (v) => {
        if (!v) return;
        cols.forEach((col) => { col.style.transform = 'translateY(-' + col.dataset.end + 'em)'; });
        io.disconnect();
      }, '0px 0px -12% 0px');
    });
  }

  /* ------------------------------------------------------------------------
     12. Nos combats : défilement horizontal épinglé (ordinateur),
         carrousel natif au doigt (mobile)
     ------------------------------------------------------------------------ */
  function initCombats() {
    const root = $('[data-hscroll]');
    if (!root) return;
    const sticky = $('.hscroll__sticky', root);
    const track = $('[data-hs-track]', root);
    const panels = $$('.combat', track);
    const imgs = panels.map((p) => $('.combat__media img', p));
    const current = $('[data-hs-current]');
    const bar = $('[data-hs-bar]');
    const total = panels.filter((p) => !p.classList.contains('combat--end')).length;
    const SPEED = 1.3; // défilement horizontal un peu plus rapide que le vertical
    let pinned = false;
    let dist = 0;
    let top = 0;
    let cur = 0;
    let offsets = [];
    let shown = -1;

    const setCurrent = (i) => {
      const n = clamp(i, 0, total - 1);
      if (n === shown || !current) return;
      shown = n;
      current.textContent = String(n + 1).padStart(2, '0');
    };
    const measure = () => {
      const want = desktop.matches && !reduced;
      if (want !== pinned) {
        pinned = want;
        root.classList.toggle('is-pinned', pinned);
        if (!pinned) {
          track.style.transform = '';
          root.style.height = '';
          imgs.forEach((im) => { if (im) im.style.transform = ''; });
        }
      }
      if (!pinned) return;
      dist = Math.max(0, track.scrollWidth - innerWidth);
      root.style.height = (dist / SPEED + innerHeight) + 'px';
      top = root.getBoundingClientRect().top + scrollY;
      offsets = panels.map((p) => ({ left: p.offsetLeft, w: p.offsetWidth }));
    };
    measure();
    resizers.add(measure);
    addEventListener('load', () => { measure(); measureDoc(); wake(); });

    sticky.addEventListener('scroll', () => {
      if (pinned) return;
      const first = panels[0];
      const step = first.offsetWidth + 14;
      const i = Math.round(sticky.scrollLeft / step);
      setCurrent(i);
      if (bar) bar.style.transform = 'scaleX(' + clamp(sticky.scrollLeft / Math.max(1, sticky.scrollWidth - sticky.clientWidth), 0, 1) + ')';
    }, { passive: true });

    tasks.add(() => {
      if (!pinned) return false;
      const p = clamp(((view.y - top) * SPEED) / Math.max(dist, 1), 0, 1);
      const target = -p * dist;
      cur = lerp(cur, target, 0.14);
      if (Math.abs(cur - target) < 0.15) cur = target;
      track.style.transform = 'translate3d(' + cur.toFixed(2) + 'px,0,0)';
      if (bar) bar.style.transform = 'scaleX(' + p.toFixed(4) + ')';
      const mid = view.vw / 2;
      let best = 0;
      let bestD = Infinity;
      offsets.forEach((o, i) => {
        const center = o.left + o.w / 2 + cur - mid;
        const img = imgs[i];
        if (img && Math.abs(center) < view.vw * 1.2) img.style.transform = 'translate3d(' + (center * -0.07).toFixed(1) + 'px,0,0)';
        if (Math.abs(center) < bestD) { bestD = Math.abs(center); best = i; }
      });
      setCurrent(best);
      return cur !== target;
    });

    // Clavier : un lien qui reçoit le focus fait défiler jusqu’à son panneau
    track.addEventListener('focusin', (e) => {
      if (!pinned) return;
      const panel = e.target.closest('.combat');
      const i = panels.indexOf(panel);
      if (i < 0) return;
      const o = offsets[i];
      const x = clamp(o.left + o.w / 2 - innerWidth / 2, 0, dist);
      scrollTo({ top: top + x / SPEED, behavior: 'auto' });
      sticky.scrollLeft = 0;
    });
  }

  /* ------------------------------------------------------------------------
     13. Le jardin : des fleurs sauvages poussent au défilement ;
         un clic (ou un toucher) sème une fleur de plus
     ------------------------------------------------------------------------ */
  function initGarden() {
    const root = $('[data-garden]');
    if (!root) return;
    const svg = $('[data-garden-svg]', root);
    const lines = $$('[data-garden-line]', root);
    const counter = $('[data-garden-count]', root);
    const NS = 'http://www.w3.org/2000/svg';
    const W = 1600;
    const H = 900;
    // Aléatoire « graine » : le jardin est le même à chaque visite
    let seed = 1982;
    const rnd = () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const el = (tag, attrs, parent) => {
      const n = d.createElementNS(NS, tag);
      if (attrs) Object.keys(attrs).forEach((k) => n.setAttribute(k, attrs[k]));
      if (parent) parent.append(n);
      return n;
    };

    const layerBack = el('g', {}, svg);
    const layerFront = el('g', {}, svg);
    // Herbes
    const grass = el('g', {}, layerBack);
    for (let i = 0; i < 150; i++) {
      const x = rnd() * W;
      const h = 26 + rnd() * 80;
      el('path', { class: 'g-grass', d: 'M' + x.toFixed(1) + ' ' + H + ' q ' + (rnd() * 16 - 8).toFixed(1) + ' ' + (-h / 2).toFixed(1) + ' ' + (rnd() * 26 - 13).toFixed(1) + ' ' + (-h).toFixed(1) }, grass);
    }
    // Lucioles
    const flies = el('g', {}, layerBack);
    for (let i = 0; i < 16; i++) {
      const c = el('circle', { class: 'g-firefly', cx: (100 + rnd() * 1400).toFixed(0), cy: (360 + rnd() * 420).toFixed(0), r: (1.4 + rnd() * 1.8).toFixed(1) }, flies);
      c.style.setProperty('--f', (5 + rnd() * 6).toFixed(1) + 's');
      c.style.setProperty('--fd', (rnd() * 6).toFixed(1) + 's');
      c.style.setProperty('--fx', (rnd() * 60 - 30).toFixed(0) + 'px');
    }

    // Têtes de fleurs
    const blooms = {
      coquelicot(g) {
        [[-11, -7, -20], [11, -7, 20], [-10, 7, -160], [10, 7, 160]].forEach(([x, y, r], i) => {
          el('ellipse', { cx: x, cy: y, rx: 19, ry: 16, fill: i % 2 ? '#e0302a' : '#f0503c', opacity: 0.95, transform: 'rotate(' + r + ' ' + x + ' ' + y + ')' }, g);
        });
        el('circle', { r: 6.5, fill: '#1f1f29' }, g);
        for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; el('circle', { cx: (Math.cos(a) * 9).toFixed(1), cy: (Math.sin(a) * 9).toFixed(1), r: 1.3, fill: '#2a1a1a' }, g); }
      },
      bleuet(g) {
        for (let k = 0; k < 11; k++) {
          const a = (k / 11) * 360;
          el('path', { d: 'M0 0 L-5 -17 L-2 -21 L0 -18 L2 -21 L5 -17 Z', fill: k % 2 ? '#4f7fe0' : '#6e98ff', transform: 'rotate(' + a.toFixed(1) + ')' }, g);
        }
        el('circle', { r: 4.5, fill: '#2b3a8a' }, g);
      },
      marguerite(g) {
        for (let k = 0; k < 15; k++) {
          const a = (k / 15) * 360;
          el('ellipse', { cx: 0, cy: -13, rx: 3.6, ry: 11, fill: '#f6f3ea', opacity: 0.96, transform: 'rotate(' + a.toFixed(1) + ')' }, g);
        }
        el('circle', { r: 6, fill: '#f2b632' }, g);
      },
      cosmos(g) {
        for (let k = 0; k < 8; k++) {
          const a = (k / 8) * 360;
          el('ellipse', { cx: 0, cy: -13, rx: 7.5, ry: 12, fill: k % 2 ? '#e8618c' : '#f07aa0', opacity: 0.94, transform: 'rotate(' + a.toFixed(1) + ')' }, g);
        }
        el('circle', { r: 5.5, fill: '#f2c14e' }, g);
      },
      bouton(g) {
        el('ellipse', { cx: 0, cy: -4, rx: 6, ry: 10, fill: '#5fae2e' }, g);
        el('path', { d: 'M-4 -9 Q0 -20 4 -9 Z', fill: '#e8618c' }, g);
      },
    };
    const kinds = ['cosmos', 'cosmos', 'coquelicot', 'coquelicot', 'bleuet', 'marguerite', 'marguerite', 'bouton'];

    const flowers = [];
    function plant(x, stemH, kind, t0, dur, layer) {
      const g = el('g', { class: 'g-sway' }, layer);
      g.style.transformOrigin = x.toFixed(1) + 'px ' + H + 'px';
      g.style.setProperty('--sway', (4.5 + rnd() * 4).toFixed(1) + 's');
      g.style.setProperty('--sway-d', (-rnd() * 6).toFixed(1) + 's');
      g.style.setProperty('--amp', (0.8 + rnd() * 1.6).toFixed(2) + 'deg');
      const dx = (rnd() - 0.5) * 70;
      const c1 = (rnd() - 0.5) * 60;
      const tipX = x + dx;
      const tipY = H - stemH;
      const stem = el('path', {
        class: 'g-stem',
        d: 'M' + x.toFixed(1) + ' ' + H + ' C' + (x + c1).toFixed(1) + ' ' + (H - stemH * 0.35).toFixed(1) + ' ' + (tipX - c1 * 0.6).toFixed(1) + ' ' + (H - stemH * 0.72).toFixed(1) + ' ' + tipX.toFixed(1) + ' ' + tipY.toFixed(1),
      }, g);
      const len = stem.getTotalLength();
      stem.style.strokeDasharray = len.toFixed(1);
      stem.style.strokeDashoffset = len.toFixed(1);
      const leaves = [];
      const nLeaves = kind === 'bouton' ? 1 : 1 + (rnd() > 0.45 ? 1 : 0);
      for (let k = 0; k < nLeaves; k++) {
        const at = 0.22 + k * 0.22 + rnd() * 0.1;
        const pt = stem.getPointAtLength(len * at);
        const side = k % 2 ? 1 : -1;
        const angle = side * (28 + rnd() * 30) - 90 + (side > 0 ? 0 : 180);
        const leaf = el('path', { class: 'g-leaf', d: 'M0 0 C9 -8 26 -9 36 0 C26 8 9 8 0 0 Z' }, g);
        leaves.push({ node: leaf, x: pt.x, y: pt.y, a: angle, s: 0.75 + rnd() * 0.5 });
      }
      const bloom = el('g', {}, g);
      blooms[kind](bloom);
      const size = kind === 'bouton' ? 1 : 0.8 + rnd() * 0.55;
      const f = { stem, len, leaves, bloom, tipX, tipY, size, rot: (rnd() - 0.5) * 50, t0, dur, g: -1 };
      flowers.push(f);
      setGrowth(f, 0);
      return f;
    }
    function setGrowth(f, g) {
      if (Math.abs(g - f.g) < 0.001) return;
      f.g = g;
      const gs = easeOut(clamp(g / 0.62, 0, 1));
      f.stem.style.strokeDashoffset = (f.len * (1 - gs)).toFixed(1);
      const gl = easeOut(clamp((g - 0.28) / 0.42, 0, 1));
      f.leaves.forEach((l) => l.node.setAttribute('transform', 'translate(' + l.x.toFixed(1) + ' ' + l.y.toFixed(1) + ') rotate(' + l.a.toFixed(1) + ') scale(' + (gl * l.s).toFixed(3) + ')'));
      const gb = clamp((g - 0.58) / 0.42, 0, 1);
      const sb = gb <= 0 ? 0 : easeBack(gb) * f.size;
      f.bloom.setAttribute('transform', 'translate(' + f.tipX.toFixed(1) + ' ' + f.tipY.toFixed(1) + ') rotate(' + (f.rot * (1 - gb) - 20 * (1 - gb)).toFixed(1) + ') scale(' + Math.max(sb, 0).toFixed(3) + ')');
    }

    // Le jardin : plus dense au centre (visible aussi sur téléphone)
    const N = 34;
    for (let i = 0; i < N; i++) {
      const u = (i + rnd() * 0.8) / N;
      const centered = 0.5 + (u - 0.5) * (0.55 + 0.45 * Math.abs(u - 0.5) * 2);
      const x = 60 + centered * (W - 120);
      const stemH = 150 + rnd() * 250 + (1 - Math.abs(centered - 0.5) * 2) * 70;
      const t0 = rnd() * 0.62;
      plant(x, stemH, kinds[(rnd() * kinds.length) | 0], t0, 0.24 + rnd() * 0.14, rnd() > 0.5 ? layerFront : layerBack);
    }

    let pinned = !reduced;
    let top = 0;
    let span = 1;
    let visible = false;
    let activeLine = -1;
    const measure = () => {
      top = root.getBoundingClientRect().top + scrollY;
      span = Math.max(1, root.offsetHeight - innerHeight);
    };
    measure();
    resizers.add(measure);
    onScreen(root, (v) => { visible = v; root.classList.toggle('is-visible', v); if (v) wake(); }, '100px');

    const render = (p) => {
      flowers.forEach((f) => { if (!f.manual) setGrowth(f, clamp((p - f.t0) / f.dur, 0, 1)); });
      const li = p < 0.34 ? 0 : p < 0.64 ? 1 : 2;
      if (li !== activeLine) { activeLine = li; lines.forEach((l, i) => l.classList.toggle('is-active', i === li)); }
      root.classList.toggle('is-done', p > 0.72);
    };
    if (!pinned) { render(1); lines.forEach((l) => l.classList.add('is-active')); }
    else {
      let lastP = -1;
      tasks.add(() => {
        if (!visible) return false;
        const p = clamp((view.y - top) / span, 0, 1);
        if (Math.abs(p - lastP) > 0.0004) { render(p); lastP = p; }
      });
    }

    // Semer une fleur
    let sown = 0;
    root.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || e.target.closest('a, button')) return;
      const ctm = svg.getScreenCTM();
      if (!ctm) return;
      const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse());
      if (pt.y < H * 0.2) return;
      const kind = kinds[(Math.random() * 7) | 0];
      const f = plant(clamp(pt.x, 20, W - 20), clamp(H - pt.y, 120, 430) + Math.random() * 40, kind, 0, 1, layerFront);
      f.manual = true;
      sown++;
      if (counter) counter.textContent = sown;
      Consent.track('garden_sow', { count: sown });
      if (reduced) { setGrowth(f, 1); return; }
      const t0 = performance.now();
      const grow = (now) => {
        const g = clamp((now - t0) / 1400, 0, 1);
        setGrowth(f, g);
        if (g < 1) requestAnimationFrame(grow);
      };
      requestAnimationFrame(grow);
    });
    root.addEventListener('pointerenter', () => root.classList.add('is-sowing'));
    root.addEventListener('pointerleave', () => root.classList.remove('is-sowing'));
  }

  /* ------------------------------------------------------------------------
     14. Le petit guide : l’image de l’arche suit le conseil lu
     ------------------------------------------------------------------------ */
  function initGuide() {
    const root = $('[data-guide]');
    if (!root) return;
    const items = $$('[data-tip]', root);
    const imgs = $$('.guide__arch img', root);
    const year = $('[data-guide-num]', root);
    const list = $('.guide__list', root);
    // Les images de l’arche sont masquées (clip-path) : on force leur chargement à l’approche
    onScreen(root, (v) => { if (v && desktop.matches) imgs.forEach((im) => { im.loading = 'eager'; }); }, '700px');
    let active = 0;
    const setActive = (i) => {
      if (i === active || i < 0) return;
      items[active].classList.remove('is-active');
      imgs.forEach((im) => im.classList.remove('was-active'));
      if (imgs[active]) { imgs[active].classList.remove('is-active'); imgs[active].classList.add('was-active'); }
      active = i;
      items[i].classList.add('is-active');
      if (imgs[i]) imgs[i].classList.add('is-active');
      const txt = $('.tip__num', items[i]).textContent.slice(0, 2);
      if (!year || year.textContent === txt) return;
      if (reduced || !year.animate) { year.textContent = txt; return; }
      year.animate([{ transform: 'none', opacity: 1 }, { transform: 'translateY(-18%)', opacity: 0 }], { duration: 220, easing: 'ease-in' }).onfinish = () => {
        year.textContent = txt;
        year.animate([{ transform: 'translateY(22%)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 650, easing: 'cubic-bezier(.16,1,.3,1)' });
      };
    };
    if ('IntersectionObserver' in window) {
      const io = new IntersectionObserver((entries) => {
        entries.forEach((e) => { if (e.isIntersecting) setActive(items.indexOf(e.target)); });
      }, { rootMargin: '-48% 0px -48% 0px' });
      items.forEach((it) => io.observe(it));
    }
    if (reduced || !list) return;
    let visible = false;
    onScreen(list, (v) => { visible = v; if (v) wake(); });
    let lastP = -1;
    tasks.add(() => {
      if (!visible || !desktop.matches) return false;
      const r = list.getBoundingClientRect();
      const p = clamp((view.vh * 0.5 - r.top) / r.height, 0, 1);
      if (Math.abs(p - lastP) > 0.001) { list.style.setProperty('--wp', p.toFixed(4)); lastP = p; }
    });
  }

  /* ------------------------------------------------------------------------
     15. Parallaxe douce (collage, grande image du pied de page)
     ------------------------------------------------------------------------ */
  function initParallax() {
    if (reduced) return;
    const items = $$('[data-speed]').map((node) => ({ node, speed: parseFloat(node.dataset.speed) || 0, top: 0, h: 0, cur: 0 }));
    const bg = $('[data-speed-bg]');
    const scene = $('[data-footer-scene]');
    let bgCur = 0;
    const measure = () => {
      items.forEach((it) => {
        const prev = it.node.style.translate;
        it.node.style.translate = '';
        const r = it.node.getBoundingClientRect();
        it.top = r.top + scrollY;
        it.h = r.height;
        it.node.style.translate = prev;
      });
    };
    measure();
    resizers.add(measure);
    addEventListener('load', measure);
    tasks.add(() => {
      let moving = false;
      const mid = view.y + view.vh / 2;
      if (desktop.matches) {
        items.forEach((it) => {
          const off = it.top + it.h / 2 - mid;
          if (Math.abs(off) > view.vh * 1.4) return;
          const target = off * it.speed * -1;
          it.cur = lerp(it.cur, target, 0.12);
          if (Math.abs(it.cur - target) > 0.1) moving = true; else it.cur = target;
          it.node.style.translate = '0 ' + it.cur.toFixed(1) + 'px';
        });
      } else if (items.length && items[0].cur !== 0) {
        items.forEach((it) => { it.cur = 0; it.node.style.translate = ''; });
      }
      if (bg && scene) {
        const r = scene.getBoundingClientRect();
        if (r.top < view.vh && r.bottom > 0) {
          const target = (r.top + r.height / 2 - view.vh / 2) * -0.12;
          bgCur = lerp(bgCur, target, 0.12);
          if (Math.abs(bgCur - target) > 0.1) moving = true;
          bg.style.translate = '0 ' + bgCur.toFixed(1) + 'px';
        }
      }
      return moving;
    });
  }

  /* ------------------------------------------------------------------------
     16. Grand mot « Greenpeace » du pied de page : les lettres se lèvent
     ------------------------------------------------------------------------ */
  function initGiant() {
    const g = $('[data-giant]');
    if (!g) return;
    const text = g.textContent.trim();
    g.textContent = '';
    const chars = text.split('').map((ch) => {
      const s = d.createElement('span');
      s.className = 'ch';
      s.textContent = ch;
      g.append(s);
      return s;
    });
    if (reduced) return;
    let visible = false;
    let lastP = -1;
    onScreen(g, (v) => { visible = v; if (v) wake(); }, '60px');
    tasks.add(() => {
      if (!visible) return false;
      const r = g.getBoundingClientRect();
      const p = clamp((view.vh - r.top) / (r.height * 1.4), 0, 1);
      if (Math.abs(p - lastP) < 0.002) return;
      lastP = p;
      chars.forEach((c, i) => {
        const local = clamp(p * 1.7 - i * 0.07, 0, 1);
        c.style.setProperty('--y', ((1 - easeOut(local)) * 70).toFixed(1) + '%');
      });
    });
  }

  /* ------------------------------------------------------------------------
     17. Curseur et boutons aimantés (souris uniquement)
     ------------------------------------------------------------------------ */
  function initCursor() {
    const c = $('.cursor');
    if (!c || !finePointer || reduced) return;
    html.classList.add('has-cursor');
    const label = $('.cursor__label', c);
    let x = -200;
    let y = -200;
    let cx = x;
    let cy = y;
    c.classList.add('is-hidden');
    addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse') return;
      x = e.clientX; y = e.clientY;
      if (c.classList.contains('is-hidden')) { cx = x; cy = y; c.classList.remove('is-hidden'); }
      wake();
    }, { passive: true });
    d.addEventListener('mouseout', (e) => { if (!e.relatedTarget) c.classList.add('is-hidden'); });
    d.addEventListener('pointerover', (e) => {
      const t = e.target;
      const field = t.closest('input, textarea, select');
      const labelled = t.closest('[data-cursor]');
      const garden = t.closest('[data-garden]');
      const link = t.closest('a, button, label, summary');
      const dark = t.closest('.garden, .footer__scene, .hero, .combat--forest, .menu');
      let text = '';
      if (labelled) text = labelled.dataset.cursor;
      else if (garden && !link) text = 'Semer';
      c.classList.toggle('is-label', !!text && !field);
      c.classList.toggle('is-link', !!link && !text && !field);
      c.classList.toggle('is-dark', !!dark && !t.closest('.hero__card'));
      if (field) c.classList.add('is-hidden'); else if (x > -100) c.classList.remove('is-hidden');
      if (text) label.textContent = text;
    });
    tasks.add(() => {
      cx = lerp(cx, x, Math.min(1, 0.24 * (view.dt / 16.7)));
      cy = lerp(cy, y, Math.min(1, 0.24 * (view.dt / 16.7)));
      c.style.transform = 'translate3d(' + cx.toFixed(1) + 'px,' + cy.toFixed(1) + 'px,0)';
      return Math.abs(cx - x) + Math.abs(cy - y) > 0.2;
    });
  }

  function initMagnetic() {
    if (!finePointer || reduced) return;
    $$('[data-magnetic]').forEach((node) => {
      node.addEventListener('pointermove', (e) => {
        const r = node.getBoundingClientRect();
        const dx = e.clientX - (r.left + r.width / 2);
        const dy = e.clientY - (r.top + r.height / 2);
        node.style.translate = (dx * 0.16).toFixed(1) + 'px ' + (dy * 0.26).toFixed(1) + 'px';
      });
      node.addEventListener('pointerleave', () => { node.style.translate = ''; });
    });
  }

  /* ------------------------------------------------------------------------
     18. Formulaire de commande : validation, anti-spam, puis
         - envoi à l’API (hors du site, les clés restent côté serveur), ou
         - sans API : la messagerie du visiteur s’ouvre avec la demande pré-remplie
           (aucune donnée ne transite par un serveur tiers).
     ------------------------------------------------------------------------ */
  function initForm() {
    const form = $('[data-form]');
    if (!form) return;
    const api = (html.dataset.api || '').replace(/\/$/, '');
    const shopMail = html.dataset.mail || '';
    const body = $('[data-form-body]', form);
    const success = $('[data-form-success]', form);
    const alertBox = $('[data-form-alert]', form);
    const submit = $('[data-submit]', form);
    const countNow = $('[data-count-now]', form);
    const countBox = countNow ? countNow.parentElement : null;
    const orderOnly = $('[data-order-only]', form);
    const F = form.elements;
    const MAX = 1500;
    const EMAIL_RE = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)*\.[a-z]{2,}$/i;
    const PHONE_RE = /^\+?[0-9 ()./-]{8,20}$/;
    const TYPOS = {
      'gmial.com': 'gmail.com', 'gmai.com': 'gmail.com', 'gmail.co': 'gmail.com', 'gamil.com': 'gmail.com', 'gnail.com': 'gmail.com',
      'hotmial.com': 'hotmail.com', 'hotmail.co': 'hotmail.com', 'hotmal.com': 'hotmail.com', 'hotmail.b': 'hotmail.be',
      'outlok.com': 'outlook.com', 'outlook.co': 'outlook.com', 'yahooo.com': 'yahoo.com', 'yaho.com': 'yahoo.com',
      'icloud.co': 'icloud.com', 'iclod.com': 'icloud.com', 'skynet.b': 'skynet.be', 'telenet.b': 'telenet.be', 'proximus.b': 'proximus.be',
    };
    const TOPICS = { bouquet: 'Un bouquet', plante: 'Une plante ou un conseil', cadeau: 'Un cadeau', vintage: 'Une pièce vintage', autre: 'Autre chose' };
    const BUDGETS = { 'moins-30': 'Moins de 30 €', '30-50': '30 à 50 €', '50-80': '50 à 80 €', 'plus-80': 'Plus de 80 €' };
    const T = {
      nameRequired: 'Indiquez votre nom.',
      nameShort: 'Votre nom semble un peu court.',
      emailRequired: 'Indiquez votre adresse e-mail.',
      emailInvalid: 'Cette adresse ne semble pas valide (exemple : prenom@exemple.be).',
      phoneInvalid: 'Ce numéro ne semble pas valide (exemple : 0470 12 34 56).',
      datePast: 'Choisissez une date à partir d’aujourd’hui.',
      messageRequired: 'Écrivez-nous quelques mots.',
      messageShort: 'Encore quelques mots ? (10 caractères minimum)',
      messageLong: 'Message trop long (1500 caractères maximum).',
      links: 'Un seul lien maximum dans le message, merci.',
      consent: 'Cochez cette case pour que nous puissions traiter votre demande.',
      summary: 'Merci de corriger les champs indiqués ci-dessous.',
      rate: 'Doucement ! Attendez une minute avant d’envoyer une nouvelle demande.',
      tooFast: 'Envoi un peu trop rapide pour un humain ! Relisez-vous et réessayez dans quelques secondes.',
      network: 'Envoi impossible pour le moment. Réessayez, ou écrivez-nous à ' + (shopMail || 'la boutique') + '.',
    };
    let started = 0;
    const touched = new Set();

    // Date minimale : aujourd’hui (heure locale)
    const now = new Date();
    const today = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
    if (F.date) F.date.min = today;

    // Les liens « Commander un bouquet », « Demander conseil »… présélectionnent le sujet
    const syncTopic = () => { if (orderOnly) orderOnly.classList.toggle('is-muted', !['bouquet', 'cadeau'].includes(F.topic.value)); };
    d.addEventListener('click', (e) => {
      const a = e.target.closest('a[data-topic]');
      if (!a || !F.topic) return;
      F.topic.value = a.dataset.topic;
      syncTopic();
    });
    F.topic.addEventListener('change', syncTopic);
    syncTopic();

    const wrap = (input) => input.closest('.field');
    const errorEl = (input) => $('[data-error]', wrap(input));

    function check(name) {
      const v = (F[name].value || '').trim();
      switch (name) {
        case 'name': return !v ? T.nameRequired : v.length < 2 ? T.nameShort : '';
        case 'email': return !v ? T.emailRequired : !EMAIL_RE.test(v) ? T.emailInvalid : '';
        case 'phone': return v && (!PHONE_RE.test(v) || v.replace(/\D/g, '').length < 8) ? T.phoneInvalid : '';
        case 'date': return v && v < today ? T.datePast : '';
        case 'message': {
          if (!v) return T.messageRequired;
          if (v.length < 10) return T.messageShort;
          if (v.length > MAX) return T.messageLong;
          if ((v.match(/https?:\/\/|www\./gi) || []).length > 1) return T.links;
          return '';
        }
        case 'consent': return F.consent.checked ? '' : T.consent;
        default: return '';
      }
    }
    function show(name, msg) {
      const input = F[name];
      const f = wrap(input);
      f.classList.toggle('is-invalid', !!msg);
      f.classList.toggle('is-valid', !msg && name !== 'consent' && !!(input.value || '').trim());
      input.setAttribute('aria-invalid', msg ? 'true' : 'false');
      errorEl(input).textContent = msg;
    }
    function suggest() {
      const input = F.email;
      const f = wrap(input);
      let hint = $('.field__hint', f);
      const v = input.value.trim().toLowerCase();
      const at = v.lastIndexOf('@');
      const fix = at > 0 ? TYPOS[v.slice(at + 1)] : null;
      if (!fix) { if (hint) hint.remove(); return; }
      const proposal = v.slice(0, at + 1) + fix;
      if (!hint) { hint = d.createElement('p'); hint.className = 'field__hint'; hint.setAttribute('aria-live', 'polite'); f.append(hint); }
      hint.textContent = 'Vouliez-vous dire ';
      const b = d.createElement('button');
      b.type = 'button';
      b.textContent = proposal;
      b.addEventListener('click', () => { input.value = proposal; hint.remove(); show('email', check('email')); input.focus(); });
      hint.append(b, ' ?');
    }

    const checked = ['name', 'email', 'phone', 'date', 'message', 'consent'];
    checked.forEach((name) => {
      const input = F[name];
      if (!input) return;
      input.addEventListener('blur', () => {
        if (name !== 'consent' && !input.value.trim() && !touched.has(name)) return;
        touched.add(name);
        show(name, check(name));
        if (name === 'email') suggest();
      });
      input.addEventListener(name === 'consent' ? 'change' : 'input', () => {
        if (wrap(input).classList.contains('is-invalid') || name === 'consent') show(name, check(name));
      });
    });
    form.addEventListener('focusin', () => { if (!started) started = Date.now(); });
    F.message.addEventListener('input', () => {
      const n = F.message.value.length;
      if (countNow) countNow.textContent = n;
      if (countBox) countBox.classList.toggle('is-near', n > MAX - 150);
    });

    const setAlert = (msg) => {
      alertBox.textContent = msg;
      alertBox.hidden = !msg;
      if (msg) alertBox.focus();
    };
    const lastSent = () => { try { return +localStorage.getItem('gt_form_ts') || 0; } catch (e) { return 0; } };
    const frDate = (iso) => { const [y, m, dd] = iso.split('-'); return dd + '/' + m + '/' + y; };

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      setAlert('');
      const errors = checked.filter((n) => F[n]).map((n) => [n, check(n)]).filter(([, m]) => m);
      checked.forEach((n) => { if (F[n]) { touched.add(n); show(n, check(n)); } });
      if (errors.length) {
        setAlert(T.summary);
        const first = F[errors[0][0]];
        setTimeout(() => first.focus(), 30);
        Consent.track('form_error', { fields: errors.map(([n]) => n).join(',') });
        return;
      }
      // Anti-spam 1 : champ piège rempli → on fait semblant que tout va bien
      if (F.website.value) { done('bot'); return; }
      // Anti-spam 2 : un humain met plus de 3 secondes à remplir le formulaire
      const elapsed = started ? Date.now() - started : 0;
      if (elapsed < 3000) { setAlert(T.tooFast); return; }
      // Anti-spam 3 : une demande par minute au maximum
      if (Date.now() - lastSent() < 60000) { setAlert(T.rate); return; }

      const data = {
        name: F.name.value.trim(),
        email: F.email.value.trim(),
        phone: F.phone.value.trim(),
        topic: F.topic.value,
        date: F.date.value,
        budget: F.budget.value,
        message: F.message.value.trim(),
        consent: true,
        website: '',
        elapsed,
        page: location.pathname,
      };
      submit.setAttribute('aria-busy', 'true');
      submit.disabled = true;
      try {
        let mode = 'api';
        if (api) {
          const ctrl = new AbortController();
          const timer = setTimeout(() => ctrl.abort(), 12000);
          const res = await fetch(api + '/contact', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify(data),
            signal: ctrl.signal,
            credentials: 'omit',
          });
          clearTimeout(timer);
          const out = await res.json().catch(() => ({}));
          if (res.status === 429) { setAlert(T.rate); return; }
          if (!res.ok || !out.ok) {
            if (out.fields) Object.keys(out.fields).forEach((n) => { if (F[n]) show(n, out.fields[n]); });
            setAlert(out.error || T.network);
            return;
          }
        } else {
          // Hébergement statique (GitHub Pages) : la demande part par la messagerie du visiteur
          mode = 'mail';
          const lines = [
            'Nom : ' + data.name,
            'E-mail : ' + data.email,
            data.phone ? 'Téléphone : ' + data.phone : '',
            'Demande : ' + TOPICS[data.topic],
            data.date ? 'Pour le : ' + frDate(data.date) : '',
            data.budget ? 'Budget : ' + BUDGETS[data.budget] : '',
            '',
            data.message,
          ].filter((l, i) => l !== '' || i === 6);
          const subject = 'Demande via le site — ' + TOPICS[data.topic];
          const href = 'mailto:' + shopMail + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(lines.join('\r\n'));
          location.href = href;
          await new Promise((r) => setTimeout(r, 400));
        }
        try { localStorage.setItem('gt_form_ts', String(Date.now())); } catch (err) { /* ignore */ }
        Consent.track('generate_lead', { topic: data.topic, mode });
        done(mode, data.name);
      } catch (err) {
        setAlert(T.network);
      } finally {
        submit.removeAttribute('aria-busy');
        submit.disabled = false;
      }
    });

    function done(mode, name) {
      const first = (name || '').split(/\s+/)[0];
      $('[data-success-title]', success).textContent = first ? 'Merci, ' + first + ' !' : 'Merci !';
      const text = $('[data-success-text]', success);
      text.textContent = '';
      if (mode === 'mail') {
        const strong = d.createElement('strong');
        strong.textContent = 'Votre messagerie s’ouvre avec la demande pré-remplie : il ne reste qu’à l’envoyer.';
        const link = d.createElement('a');
        link.href = 'mailto:' + shopMail;
        link.textContent = shopMail;
        text.append(strong, d.createElement('br'), 'Rien ne s’ouvre ? Écrivez-nous à ', link, '.');
      } else {
        text.textContent = 'Votre demande est bien partie. On vous répond au plus vite.';
      }
      body.hidden = true;
      success.hidden = false;
      success.focus();
    }
    $('[data-form-reset]', form).addEventListener('click', () => {
      form.reset();
      touched.clear();
      started = 0;
      $$('.field', form).forEach((f) => f.classList.remove('is-invalid', 'is-valid'));
      $$('[data-error]', form).forEach((p) => { p.textContent = ''; });
      const hint = $('.field__hint', form);
      if (hint) hint.remove();
      if (countNow) countNow.textContent = '0';
      syncTopic();
      success.hidden = true;
      body.hidden = false;
      F.name.focus();
    });
  }

  /* ------------------------------------------------------------------------
     19. Pages intérieures : sommaire actif, 404 qu’on arrose, statistiques
     ------------------------------------------------------------------------ */
  function initToc() {
    const toc = $('[data-toc]');
    if (!toc || !('IntersectionObserver' in window)) return;
    const links = $$('a', toc);
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        links.forEach((a) => a.classList.toggle('is-current', a.getAttribute('href') === '#' + e.target.id));
      });
    }, { rootMargin: '-20% 0px -70% 0px' });
    links.forEach((a) => { const t = d.getElementById(a.getAttribute('href').slice(1)); if (t) io.observe(t); });
  }

  function initLost() {
    const lost = $('[data-lost]');
    if (!lost) return;
    const btn = $('[data-water]', lost);
    if (!btn) return;
    btn.addEventListener('click', () => {
      if (lost.classList.contains('is-watered')) return;
      lost.classList.add('is-watering');
      setTimeout(() => {
        lost.classList.add('is-watered');
        const label = $('.btn__label', btn);
        label.textContent = 'Elle refleurit';
        label.dataset.label = 'Elle refleurit';
        btn.setAttribute('aria-pressed', 'true');
        Consent.track('404_water');
      }, reduced ? 0 : 900);
    });
  }

  // Bouton « Activer / Réduire les animations » : le choix est mémorisé sur l’appareil
  function initMotionToggle() {
    $$('[data-motion-toggle]').forEach((b) => {
      const on = !html.classList.contains('reduced');
      b.textContent = on ? 'Réduire les animations' : 'Activer les animations';
      b.setAttribute('aria-pressed', String(on));
      b.addEventListener('click', () => {
        try { localStorage.setItem('gt_motion', on ? 'reduce' : 'full'); } catch (e) { /* ignore */ }
        location.reload();
      });
    });
  }

  function initTracking() {
    d.addEventListener('click', (e) => {
      const a = e.target.closest('a');
      if (!a) return;
      if (a.dataset.track) Consent.track('cta_click', { cta: a.dataset.track, link_url: a.href });
      else if (a.hostname && a.hostname !== location.hostname) Consent.track('outbound_click', { link_url: a.href });
    });
    if (/\/404\.html$|^$/.test(location.pathname) || d.body.classList.contains('page-404')) {
      Consent.track('page_not_found', { page_path: location.pathname });
    }
  }

  /* ------------------------------------------------------------------------
     Démarrage
     ------------------------------------------------------------------------ */
  const run = (fn) => { try { fn(); } catch (err) { console.error('[greentage]', fn.name, err); } };
  run(Consent.init);
  run(initIntro);
  run(initReveals);
  run(initNav);
  run(initMenu);
  run(initHero);
  run(initPetals);
  run(initMarquee);
  run(initManifesto);
  run(initCounters);
  run(initCombats);
  run(initGarden);
  run(initGuide);
  run(initParallax);
  run(initGiant);
  run(initCursor);
  run(initMagnetic);
  run(initForm);
  run(initToc);
  run(initLost);
  run(initTracking);
  run(initMotionToggle);
  $$('[data-year]').forEach((el) => { el.textContent = String(new Date().getFullYear()); });
  measureDoc();
  html.classList.add('js-ready');
  wake();
})();
