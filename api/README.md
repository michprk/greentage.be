# API du formulaire (hors du site)

Le site est 100 % statique (GitHub Pages) : il ne contient **aucune clé secrète**.
Pour que le formulaire « Commander ou nous écrire » envoie un vrai e-mail à la boutique,
on branche cette petite API, hébergée à part sur **Cloudflare Workers** (gratuit).

```
Visiteur ──(formulaire)──▶ site statique ──(POST /contact)──▶ API Cloudflare ──▶ e-mail à la boutique
                                                              (clé Resend ici seulement)
```

Ce que fait l’API (`contact-worker.js`) :

- accepte uniquement les demandes venant du site (`ALLOWED_ORIGIN`, CORS strict) ;
- revalide tous les champs côté serveur (on ne fait jamais confiance au navigateur) ;
- anti-spam : champ piège, envoi trop rapide, limite de 5 demandes / 10 min par IP (option KV) ;
- envoie un e-mail texte à la boutique, avec « répondre à » = le client ;
- renvoie des erreurs en français que le site affiche sous les bons champs.

Tant que l’API n’est pas branchée, le formulaire fonctionne quand même : la messagerie du
visiteur s’ouvre avec la demande pré-remplie (aucune donnée ne passe par un serveur).

## Mise en route (≈ 15 minutes)

1. Créer un compte gratuit sur [resend.com](https://resend.com), vérifier le domaine
   de la boutique (ex. `greentage.be`) et copier la clé API.
2. Créer un compte gratuit sur [cloudflare.com](https://dash.cloudflare.com).
3. Dans ce dossier `api/` :

   ```bash
   npx wrangler login
   npx wrangler secret put RESEND_API_KEY
   npx wrangler deploy
   ```

4. Copier l’adresse obtenue (ex. `https://greentage-contact.<compte>.workers.dev`) dans
   l’attribut `data-api` de la balise `<html>` de `index.html` :

   ```html
   <html lang="fr-BE" data-api="https://greentage-contact.<compte>.workers.dev" …>
   ```

5. Vérifier `ALLOWED_ORIGIN`, `SHOP_EMAIL` et `FROM_EMAIL` dans `wrangler.toml`.

La politique de sécurité du site (CSP) autorise déjà les adresses `*.workers.dev`.
Si l’API est servie depuis un autre domaine, l’ajouter dans `scripts/build.sh` (`connect-src`).
