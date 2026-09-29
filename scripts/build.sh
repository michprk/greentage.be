#!/usr/bin/env bash
# ==========================================================================
# À lancer après chaque modification de boot.js, main.css ou app.js :
#   bash scripts/build.sh
# 1. recopie assets/js/boot.js dans le <head> de chaque page (script en ligne),
# 2. recalcule son empreinte SHA-256 pour la politique de sécurité (CSP),
#    dans les pages, dans _headers (Netlify / Cloudflare) et dans .htaccess (Apache),
# 3. met à jour le numéro de version des fichiers (?v=…) pour vider les caches.
# ==========================================================================
set -euo pipefail
cd "$(dirname "$0")/.."
BOOT=$(cat assets/js/boot.js)
HASH=$(printf '%s' "$BOOT" | openssl dgst -sha256 -binary | openssl base64 -A)
VER=$(cat assets/css/main.css assets/js/app.js | openssl dgst -md5 | awk '{print substr($NF,1,10)}')
# API du formulaire (Cloudflare Workers) et mesure d’audience (Google Analytics 4, après accord)
CSP="default-src 'self'; script-src 'self' 'sha256-$HASH' https://www.googletagmanager.com; style-src 'self'; img-src 'self' data: https://*.google-analytics.com https://*.googletagmanager.com; font-src 'self'; connect-src 'self' https://*.google-analytics.com https://*.analytics.google.com https://*.googletagmanager.com https://*.workers.dev; manifest-src 'self'; frame-src 'none'; object-src 'none'; base-uri 'self'; form-action 'self'"
CSP_HEADER="$CSP; frame-ancestors 'none'; upgrade-insecure-requests"
export BOOT CSP CSP_HEADER VER
for f in *.html; do
  perl -0pi -e '
    s{<script>[^<]*</script>}{"<script>$ENV{BOOT}</script>"}e;
    s{(<meta http-equiv="Content-Security-Policy" content=")[^"]*(")}{$1$ENV{CSP}$2};
    s{\?v=[A-Za-z0-9_]+}{?v=$ENV{VER}}g;
  ' "$f"
  echo "  $f"
done
perl -pi -e 's{^(\s*Content-Security-Policy: ).*$}{$1$ENV{CSP_HEADER}}' _headers
perl -pi -e 's{(Header always set Content-Security-Policy ")[^"]*(")}{$1$ENV{CSP_HEADER}$2}' .htaccess
echo "  _headers, .htaccess"
echo "CSP : sha256-$HASH"
echo "Version : $VER"
