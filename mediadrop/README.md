# MediaDrop

Un petit outil de bureau (Windows + Mac) qui te donne un panneau flottant,
toujours visible, pour parcourir tes propres dossiers et glisser-deposer un
fichier directement dans **n'importe quel logiciel** (Premiere Pro, After
Effects, DaVinci, etc.) — exactement comme le panneau "My Library" de
Premiere, mais independant du logiciel.

Fonctionnalites :

- **Ajouter un dossier** de ton ordinateur a la librairie (bouton "+ Ajouter
  un dossier"). La liste est sauvegardee automatiquement, tu la retrouves a
  chaque lancement.
- Arborescence dans le panneau lateral, comme un explorateur de fichiers.
- Zone principale avec vue grille ou liste, breadcrumb pour naviguer,
  recherche par nom.
- Icones natives du systeme pour chaque fichier (les memes que dans
  l'explorateur Windows / le Finder).
- **Glisser-deposer natif** : tu attrapes un fichier dans le panneau et tu le
  laches directement dans la timeline de Premiere Pro (ou n'importe quelle
  autre fenetre) — le fichier est depose comme s'il venait de l'explorateur
  de fichiers.
- **Previsualisation avant utilisation**, comme dans le panneau Bibliotheque
  de Premiere :
  - Les fichiers **audio** affichent leur **forme d'onde** en miniature ; un
    simple clic lance la lecture (une barre de progression avance sur la
    forme d'onde), un second clic met en pause.
  - Les fichiers **video** affichent une **miniature extraite** de la video ;
    un clic ouvre un lecteur en grand (avec ses propres controles) sans
    quitter le panneau.
  - Les **images** s'affichent directement en miniature.
  - Double-clic sur un fichier : l'ouvre avec l'application par defaut du
    systeme.
- Fenetre "toujours au-dessus" pour rester accessible pendant que tu montes.
- Clic droit sur un dossier de la librairie : renommer / retirer / ouvrir
  dans l'explorateur. Clic droit sur un fichier : l'ouvrir / l'afficher dans
  son dossier.

## Installation (une seule fois)

1. Installe [Node.js](https://nodejs.org) (version LTS) si ce n'est pas deja
   fait.
2. Decompresse ce dossier `media-library-panel`.
3. Ouvre un terminal (ou "Invite de commandes" sur Windows) dans ce dossier
   et lance :

   ```bash
   npm install
   ```

   Cela telecharge Electron (le moteur de l'application) — ca peut prendre
   quelques minutes la premiere fois.

## Lancer l'application

```bash
npm start
```

La fenetre du panneau s'ouvre. Clique sur **"+ Ajouter un dossier"**, choisis
le dossier "SOUND EFFECT" (ou n'importe quel autre dossier de ton
ordinateur), et il apparait dans "MA LIBRAIRIE". Ensuite tu peux glisser
n'importe quel fichier depuis le panneau vers Premiere Pro (la timeline, le
panneau Projet, etc.) ou vers n'importe quelle autre application ouverte.

## Construire une application installable (.exe / .dmg)

Si tu veux une vraie application que tu peux lancer sans terminal (une icone
a double-cliquer) :

```bash
# Sur Windows, pour obtenir un installeur .exe :
npm run dist:win

# Sur Mac, pour obtenir un fichier .dmg :
npm run dist:mac
```

Le resultat se trouve dans le dossier `dist/`. Note : pour un `.dmg` non
bloque par macOS (Gatekeeper), il est preferable de lancer cette commande
directement sur un Mac.

Pour personnaliser l'icone de l'application, ajoute un fichier
`assets/icon.png` (1024x1024) et `assets/icon.ico` (Windows), puis relance
la commande `dist`.

## Mettre en ligne et rendre telechargeable (GitHub)

Ce depot contient tout ce qu'il faut pour publier automatiquement un lien de
telechargement public, mis a jour a chaque nouvelle version :

- `.github/workflows/release.yml` : a chaque fois que tu pousses un tag de
  version (ex. `v1.0.0`), GitHub construit automatiquement le `.exe`
  (Windows) et le `.dmg` (Mac) et les publie dans une "Release" GitHub.
- `docs/index.html` : une page de telechargement prete a l'emploi, a activer
  via GitHub Pages (Settings > Pages > Source: Deploy from a branch > `main`
  > dossier `/docs`). Une fois active, elle est disponible a
  `https://<ton-pseudo>.github.io/<nom-du-depot>/` avec deux boutons
  "Telecharger pour Windows / Mac" qui pointent toujours vers la derniere
  version publiee.

Etapes pour publier une nouvelle version : mets a jour `"version"` dans
`package.json`, commit, puis :

```bash
git tag v1.0.1
git push origin v1.0.1
```

GitHub construit et publie automatiquement — la page de telechargement se
met a jour toute seule (elle pointe vers "latest").

## Notes techniques

- La liste des dossiers ajoutes est sauvegardee dans un fichier
  `library.json` propre a ton compte utilisateur (pas dans ce dossier), donc
  elle persiste meme si tu deplaces ou remplaces ce dossier de code.
- Le glisser-deposer utilise l'API native d'Electron
  (`webContents.startDrag`), qui simule un vrai glisser-deposer du systeme
  d'exploitation — c'est pour ca que ca fonctionne avec Premiere Pro et pas
  seulement dans le navigateur.
- Les formes d'onde sont generees directement dans l'application (Web Audio
  API) et les miniatures video en capturant une image de la video — aucun
  logiciel externe (pas de FFmpeg) n'est necessaire. Les fichiers audio de
  plus de 150 Mo n'affichent pas de forme d'onde (juste l'icone) pour eviter
  de ralentir l'application ; tout le reste fonctionne normalement.
- Aucune donnee ne quitte ton ordinateur : l'application lit uniquement les
  dossiers que tu ajoutes toi-meme, en local.
