<?php
/**
 * ==========================================================================
 * Greentage — réception du formulaire « Commander ou nous écrire »
 * Pour un hébergement avec PHP (Hostinger, OVH, one.com…).
 *
 * Le site envoie la demande en JSON à /api/contact (réécrit vers ce fichier
 * par le .htaccess). Ce script revérifie tout côté serveur, bloque les robots
 * et envoie la demande par e-mail à la boutique. Aucune clé dans le site.
 * ==========================================================================
 */
declare(strict_types=1);

// ---------------------------------------------------------------- Réglages
const DESTINATAIRE = 'info.greentage@gmail.com'; // boîte qui reçoit les demandes
const EXPEDITEUR   = 'site@greentage.be';        // adresse du domaine (Hostinger > E-mails > créer)
const NOM_SITE     = 'Site Greentage';
const LIMITE       = 5;    // demandes maximum par adresse IP…
const FENETRE      = 600;  // …sur 10 minutes
// ---------------------------------------------------------------------------

mb_internal_encoding('UTF-8');
date_default_timezone_set('Europe/Brussels');
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: no-referrer');

function repondre(int $code, array $donnees): void
{
    http_response_code($code);
    echo json_encode($donnees, JSON_UNESCAPED_UNICODE);
    exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    repondre(405, ['ok' => false, 'error' => 'Méthode non autorisée.']);
}

// Uniquement depuis le site lui-même
$origine = $_SERVER['HTTP_ORIGIN'] ?? '';
$hote = strtolower((string) preg_replace('/:\d+$/', '', (string) ($_SERVER['HTTP_HOST'] ?? '')));
if ($origine !== '' && strtolower((string) parse_url($origine, PHP_URL_HOST)) !== $hote) {
    repondre(403, ['ok' => false, 'error' => 'Origine non autorisée.']);
}

$brut = (string) file_get_contents('php://input', false, null, 0, 8192);
$data = json_decode($brut, true);
if (!is_array($data)) {
    repondre(400, ['ok' => false, 'error' => 'Demande illisible.']);
}

// Anti-spam 1 : champ piège rempli → on répond « OK » sans rien envoyer
if (!empty($data['website'])) {
    repondre(200, ['ok' => true]);
}
// Anti-spam 2 : envoi trop rapide pour un humain
if (!isset($data['elapsed']) || (int) $data['elapsed'] < 3000) {
    repondre(400, ['ok' => false, 'error' => 'Envoi trop rapide. Réessayez dans quelques secondes.']);
}
// Anti-spam 3 : 5 demandes maximum par adresse IP sur 10 minutes
$dossier = __DIR__ . '/.data';
if (!is_dir($dossier)) {
    @mkdir($dossier, 0700, true);
}
$fichier = $dossier . '/' . hash('sha256', ($_SERVER['REMOTE_ADDR'] ?? '') . __FILE__) . '.json';
$maintenant = time();
$essais = is_file($fichier) ? json_decode((string) @file_get_contents($fichier), true) : [];
$essais = array_values(array_filter(is_array($essais) ? $essais : [], function ($t) use ($maintenant) {
    return is_int($t) && $t > $maintenant - FENETRE;
}));
if (count($essais) >= LIMITE) {
    repondre(429, ['ok' => false, 'error' => 'Trop de demandes. Réessayez dans quelques minutes.']);
}
$essais[] = $maintenant;
@file_put_contents($fichier, json_encode($essais), LOCK_EX);

// Nettoyage et validation (identiques au navigateur : on ne fait jamais confiance au client)
function ligne($valeur, int $max): string
{
    $v = is_string($valeur) ? $valeur : '';
    $v = (string) preg_replace('/[\x00-\x1F\x7F]+/u', ' ', $v); // aucun saut de ligne : protège les en-têtes
    return mb_substr(trim($v), 0, $max);
}
function texte($valeur, int $max): string
{
    $v = is_string($valeur) ? str_replace("\r\n", "\n", $valeur) : '';
    $v = (string) preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/u', '', $v);
    return mb_substr(trim($v), 0, $max);
}

$sujets = ['bouquet' => 'Un bouquet', 'plante' => 'Une plante ou un conseil', 'cadeau' => 'Un cadeau', 'vintage' => 'Une pièce vintage', 'autre' => 'Autre chose'];
$budgets = ['' => 'À définir', 'moins-30' => 'Moins de 30 €', '30-50' => '30 à 50 €', '50-80' => '50 à 80 €', 'plus-80' => 'Plus de 80 €'];

$f = [
    'name'    => ligne($data['name'] ?? '', 80),
    'email'   => ligne($data['email'] ?? '', 120),
    'phone'   => ligne($data['phone'] ?? '', 24),
    'topic'   => is_string($data['topic'] ?? null) && isset($sujets[$data['topic']]) ? $data['topic'] : 'autre',
    'date'    => is_string($data['date'] ?? null) && preg_match('/^\d{4}-\d{2}-\d{2}$/', $data['date']) ? $data['date'] : '',
    'budget'  => is_string($data['budget'] ?? null) && isset($budgets[$data['budget']]) ? $data['budget'] : '',
    'message' => texte($data['message'] ?? '', 1500),
];

$erreurs = [];
if (mb_strlen($f['name']) < 2) {
    $erreurs['name'] = 'Indiquez votre nom.';
}
if (!filter_var($f['email'], FILTER_VALIDATE_EMAIL)) {
    $erreurs['email'] = 'Cette adresse e-mail ne semble pas valide.';
}
if ($f['phone'] !== '' && !preg_match('/^\+?[0-9 ().\/-]{8,20}$/', $f['phone'])) {
    $erreurs['phone'] = 'Ce numéro ne semble pas valide.';
}
if (mb_strlen($f['message']) < 10) {
    $erreurs['message'] = 'Écrivez-nous quelques mots (10 caractères minimum).';
} elseif (preg_match_all('~https?://|www\.~i', $f['message']) > 1) {
    $erreurs['message'] = 'Un seul lien maximum dans le message.';
}
if (($data['consent'] ?? false) !== true) {
    $erreurs['consent'] = 'Le consentement est nécessaire pour traiter votre demande.';
}
if ($erreurs) {
    repondre(400, ['ok' => false, 'error' => 'Merci de corriger les champs indiqués.', 'fields' => $erreurs]);
}

// E-mail à la boutique (texte brut, « répondre » va directement au client)
$date = $f['date'] !== '' ? implode('/', array_reverse(explode('-', $f['date']))) : '—';
$corps = implode("\n", [
    'Nouvelle demande depuis le site Greentage',
    '',
    'Nom : ' . $f['name'],
    'E-mail : ' . $f['email'],
    'Téléphone : ' . ($f['phone'] !== '' ? $f['phone'] : '—'),
    'Demande : ' . $sujets[$f['topic']],
    'Pour le : ' . $date,
    'Budget : ' . $budgets[$f['budget']],
    '',
    $f['message'],
    '',
    '— Envoyé le ' . date('d/m/Y à H:i'),
]);
$sujet = 'Demande via le site — ' . $sujets[$f['topic']] . ' — ' . $f['name'];
$entetes = implode("\r\n", [
    'From: ' . mb_encode_mimeheader(NOM_SITE, 'UTF-8') . ' <' . EXPEDITEUR . '>',
    'Reply-To: ' . $f['email'],
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: 8bit',
]);

$envoye = @mail(DESTINATAIRE, mb_encode_mimeheader($sujet, 'UTF-8'), $corps, $entetes, '-f' . EXPEDITEUR);
if (!$envoye) {
    repondre(502, ['ok' => false, 'error' => 'Envoi impossible pour le moment. Écrivez-nous à ' . DESTINATAIRE . '.']);
}
repondre(200, ['ok' => true]);
