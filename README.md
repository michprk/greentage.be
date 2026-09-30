# Greentage — site vitrine

Site de **Greentage**, boutique de plantes, de fleurs de saison et d’objets vintage,
Rue du Noyer 283 à Bruxelles, à deux pas du parc du Cinquantenaire.

**En ligne : https://michprk.github.io/greentage.be/**

Direction artistique : « un carnet d’herbier au coin du feu ». Toile parchemin, grands titres
à empattements (Fraunces), filets vert-de-gris et une seule couleur d’accent : le **vert sauge
de la façade**. La photographie de la boutique (miroirs dorés, buffets chinés, jungle de plantes)
apporte le côté maximaliste ; l’interface reste aérée. Le logo en pixels (un pot de terre cuite,
deux feuilles, une fleur rose) sert de favicon, de logo et d’animation d’ouverture.

## Structure

```
index.html              accueil (une seule longue page, 7 sections)
confidentialite.html    politique de confidentialité (RGPD) + cookies
cgu.html                conditions d’utilisation + mentions légales + crédits
404.html                page « introuvable » (on arrose la plante pour qu’elle refleurisse)
assets/css/main.css     tout le style : couleurs, typographie, animations, responsive
assets/js/boot.js       chargé en premier (dans le <head>) : force le HTTPS, prépare les animations
assets/js/app.js        animations, cookies + mesure d’audience, formulaire, anti-spam
assets/fonts/           polices auto-hébergées (Fraunces + Hanken Grotesk) : aucun appel à Google Fonts
assets/img/             photos compressées en WebP à plusieurs tailles (voir assets/img/README.md)
api/                    API du formulaire, hébergée à part (Cloudflare Workers) : voir api/README.md
favicon.svg, favicon.ico, favicon-32.png, apple-touch-icon.png, icon-*.png, site.webmanifest
og.jpg                  image de partage (réseaux sociaux, WhatsApp…) 1200 × 630
robots.txt, sitemap.xml référencement
.htaccess, _headers     HTTPS forcé + en-têtes de sécurité (Apache / Netlify / Cloudflare)
.well-known/security.txt contact sécurité
scripts/                build.sh (CSP + versions), check-links.sh (liens cassés)
```

Aucune dépendance et aucune étape de compilation : HTML, CSS et JavaScript simples.

## Les sections de l’accueil

1. **Ouverture** : photo plein écran (miroir doré et feuillages), carte givrée, pétales qui dérivent.
2. **La maison** : le manifeste « green + vintage » s’allume mot à mot, avec des pastilles photo.
3. **Nos univers** : six panneaux qui défilent à l’horizontale (plantes, fleurs, pots, vintage, conseils, fêtes).
4. **Le jardin** : une scène de nuit où des fleurs sauvages poussent au défilement ; un clic en fait pousser une de plus.
5. **Le petit guide** : six conseils d’entretien, l’image de l’arche suit la lecture.
6. **Sur Instagram** : collage façon planches d’herbier + trois avis clients.
7. **Commander** : bouquet, plante, panier anti-gaspi (Too Good To Go).
8. **Nous rendre visite** : adresse, horaires, formulaire de commande.

## Animations

- Ouverture (une fois par visite) : la plante en pixels pousse ligne par ligne, puis le rideau se lève.
- Au défilement : titres mot par mot, photos dévoilées, chiffres « odomètre », bandeau dont la
  vitesse suit le défilement, panneaux horizontaux épinglés, jardin qui fleurit, grand mot
  « Greentage » dont les lettres se lèvent, parallaxe douce.
- À la souris : curseur qui s’agrandit et nomme l’action (« Découvrir », « Commander »…),
  boutons aimantés, texte des boutons qui roule, arches qui deviennent des cadres.
- Entre les pages : transition en fondu (navigateurs récents).
- Toutes les animations sont actives pour tous les visiteurs, quel que soit le réglage de leur
  appareil. Le bouton « Réduire les animations » du pied de page permet à chacun de les couper
  (fondus doux uniquement) ; ce choix est mémorisé sur l’appareil (`gt_motion`).
  On peut aussi forcer un mode avec `?motion=reduce` ou `?motion=full` dans l’adresse.

## Formulaire de commande

- **Validation** en français sous chaque champ (nom, e-mail avec correction des fautes de frappe
  « gmial.com », téléphone facultatif, date à partir d’aujourd’hui, message de 10 à 1500
  caractères, case RGPD obligatoire). Les erreurs sont lues par les lecteurs d’écran.
- **Anti-spam** : champ piège invisible, envoi refusé en moins de 3 secondes, une demande par
  minute, un seul lien autorisé dans le message (et limite par adresse IP côté API).
- **Envoi** : sans API, la messagerie du visiteur s’ouvre avec la demande pré-remplie vers
  info.greentage@gmail.com. Avec l’API (dossier `api/`, clés côté serveur uniquement), l’e-mail
  part directement. Il suffit de renseigner `data-api` dans `index.html`.

## Cookies et mesure d’audience

Aucun cookie publicitaire. La bannière demande l’accord (« Tout refuser » et « Tout accepter »
ont le même poids) et le lien « Gérer les cookies » permet de changer d’avis. La mesure
d’audience (Google Analytics 4, Consent Mode v2) ne se charge qu’après accord : pour l’activer,
coller l’identifiant `G-XXXXXXX` dans l’attribut `data-ga` de la balise `<html>` de chaque page.
Tant qu’il est vide, **aucune requête** ne part vers un service tiers.

## HTTPS et sécurité

- `boot.js` redirige automatiquement de `http://` vers `https://`.
- GitHub Pages : *Settings → Pages → Enforce HTTPS* (activé).
- `.htaccess` (Apache) et `_headers` (Netlify / Cloudflare) : redirection côté serveur, HSTS,
  CSP stricte, anti-iframe, cache long des fichiers versionnés.
- Politique de sécurité du contenu (CSP) dans chaque page, avec l’empreinte du script en ligne.
  **Après toute modification de `boot.js`, `main.css` ou `app.js`, lancer `bash scripts/build.sh`.**

## Référencement et performance

Titres et descriptions uniques, balises de partage (Open Graph / X), données structurées
`Florist` (adresse, horaires, réseaux), `sitemap.xml`, `robots.txt`, textes alternatifs sur
toutes les photos, polices préchargées, image d’ouverture préchargée, photos en WebP à la bonne
taille (`srcset`) et chargées au dernier moment, contrastes AA.

> La maquette est volontairement en `noindex` pour ne pas apparaître dans Google avant l’accord
> de la boutique. Le jour de la mise en ligne : retirer la ligne `<meta name="robots" …>` des pages.
> Sur une adresse `github.io/greentage.be/`, Google lit le `robots.txt` à la racine du domaine :
> le fichier fourni sera pris en compte une fois le site sur son propre nom de domaine.

## Voir le site en local

N’importe quel petit serveur statique suffit, en servant le dossier **parent** pour garder
l’adresse `/greentage.be/` :

```bash
npx http-server .. -p 8080
# puis ouvrir http://localhost:8080/greentage.be/
```

## Mettre en ligne (GitHub Pages)

Le site est publié depuis la branche `main` :

```bash
git add -A && git commit -m "…" && git push
```

GitHub met le site à jour en une minute environ.

## Mise en ligne sur le nom de domaine (Hostinger)

```bash
bash scripts/export-hostinger.sh          # → dist/greentage-hostinger.zip
```

Le script prépare automatiquement la version finale pour `https://greentage.be` : adresses à la
racine du domaine, site visible sur Google (plus de `noindex`, sauf la page 404), mentions de
démonstration retirées, formulaire relié à `api/contact.php` (envoi des demandes par e-mail côté
serveur, anti-spam, aucune clé dans le site). Il suffit ensuite, dans hPanel :

1. *Fichiers → Gestionnaire de fichiers → public_html* : supprimer le fichier par défaut,
   téléverser le `.zip`, puis *Extraire* directement dans `public_html`.
2. *Sécurité → SSL* : activer le certificat gratuit et « Forcer HTTPS ».
3. *E-mails* : créer l’adresse `site@greentage.be` (expéditeur du formulaire, voir `api/contact.php`).
4. Tester : le cadenas, le formulaire (la demande arrive sur info.greentage@gmail.com) et une
   adresse inexistante (page 404).

Autre domaine : `bash scripts/export-hostinger.sh autre-domaine.be`.

## À compléter avant la mise en ligne

- Horaires détaillés (le site indique « ouvert tous les jours », comme sur Instagram).
- Forme juridique, numéro d’entreprise (BCE) et TVA dans `cgu.html` et `confidentialite.html`
  (mentions marquées « à compléter »).
- Accord de la boutique pour l’utilisation des photos Instagram et des avis cités.
- Identifiant Google Analytics (`data-ga`) et adresse de l’API (`data-api`) si souhaités.
