# Guide de publication

Ordre conseillé : GitHub → BoardGameGeek → Chrome Web Store en « non répertoriée » → bêta avec quelques joueurs → publique.

## 1. Mettre le code sur GitHub

Dépôt : <https://github.com/egilvir/chineur-ludique>

Pour envoyer les prochaines modifications depuis ton ordinateur :
```bash
git clone https://github.com/egilvir/chineur-ludique.git
# … modifications …
git add -A && git commit -m "…" && git push
```

La politique de confidentialité est en ligne à l'adresse `https://github.com/egilvir/chineur-ludique/blob/main/PRIVACY.md`.

## 2. Déclarer l'application auprès de BoardGameGeek

Pour un usage perso, rien n'est nécessaire. Pour une diffusion publique, BGG demande d'enregistrer l'application (gratuit en non commercial, validation parfois en une semaine ou plus) : <https://boardgamegeek.com/applications>.

Texte suggéré :

> **Nom** : Chineur Ludique
> **Type** : non commercial
> **Description** : Extension de navigateur open source (Chrome) pour les joueurs francophones. Sur les fiches de jeux et les annonces d'occasion, elle indique à l'utilisateur si le jeu est dans sa propre collection BGG, et propose des liens vers la fiche BGG. Elle télécharge uniquement la collection de l'utilisateur connecté (xmlapi2/collection), au plus deux fois par jour, sans serveur intermédiaire ni redistribution des données. Code source : https://github.com/egilvir/chineur-ludique

Demande envoyée le 29/10/2026 (application n° 11558), **validée le 31/10/2026** (<https://boardgamegeek.com/applications>).

Ce que dit le guide de BGG (version du 2025-07-02) et ce que ça implique :
- L'exception « sans enregistrement » ne couvre que le téléchargement de **sa propre collection directement depuis le site**. Une extension publique doit être enregistrée et envoyer son jeton (`Authorization: Bearer …`).
- Le logo **« Powered by BGG »**, lié à boardgamegeek.com, est obligatoire : il est affiché dans le popup et les options.
- Usage **strictement non commercial** : même des dons volontaires (Ko-fi, Tipeee…) imposent une licence commerciale (probablement gratuite, mais à demander).
- BGG préfère les appels depuis un serveur avec cache ; l'extension limite les siens au strict minimum (sa propre collection, deux fois par jour).

**Quand l'application est validée :**
1. Sur <https://boardgamegeek.com/applications>, clique sur **Tokens** à côté de l'application et crée un jeton.
2. Ne le mets **jamais** dans le dépôt GitHub : il est injecté seulement dans le paquet du Store.
   ```bash
   BGG_TOKEN=le-jeton ./scripts/build.sh
   ```
   Sous Windows (sans bash ni zip), dans PowerShell :
   ```powershell
   $env:BGG_TOKEN = "le-jeton"; python scripts/build.py
   ```
3. Envoie ce paquet au Chrome Web Store.

## 3. Publier sur le Chrome Web Store

1. Crée un compte développeur sur <https://chrome.google.com/webstore/devconsole> (frais d'inscription uniques de 5 $). Utilise une adresse e-mail dédiée : elle ne pourra plus être changée.
2. Fabrique le paquet (avec le jeton BGG une fois l'application validée) :
   ```bash
   BGG_TOKEN=le-jeton ./scripts/build.sh        # crée dist/chineur-ludique-<version>.zip
   # ou, sous Windows : $env:BGG_TOKEN = "le-jeton"; python scripts/build.py
   ```
3. **Nouvel élément** → envoie le zip.
4. Remplis les onglets avec `store/fiche-chrome-web-store.md` (fiche, confidentialité, distribution) et les visuels de `store/screenshots/`.
5. Visibilité **Non répertoriée** → **Envoyer pour examen**. Comme l'extension s'active sur plusieurs sites, l'examen peut prendre de quelques jours à quelques semaines.
6. Une fois validée, partage le lien à quelques joueurs, corrige ce qui coince, puis passe en **Publique**.

Pour chaque mise à jour : incrémente `version` dans `extension/manifest.json`, relance `./scripts/build.sh` (ou `scripts/build.py`), envoie le nouveau zip. Sur GitHub, crée une release `vX.Y.Z` avec le paquet **sans jeton** (`python scripts/build.py` sans `BGG_TOKEN`).

## 4. Edge et Firefox (plus tard)

- **Edge** : même paquet, compte gratuit sur Partner Center.
- **Firefox** : demande une adaptation (Firefox ne gère pas `tabGroups` ni le `service_worker` en arrière-plan de la même façon). Compte gratuit sur addons.mozilla.org.

## Avant de gagner de l'argent

- Affiliation : la politique du Chrome Web Store (juin 2025) exige de l'annoncer sur la fiche, dans l'extension et avant l'installation, et qu'elle ne s'applique qu'après une action de l'utilisateur avec un bénéfice direct pour lui.
- BoardGameGeek : une application qui génère des revenus relève de la licence commerciale.
- Statut (micro-entreprise) et clause d'exclusivité de ton contrat de travail à vérifier.
