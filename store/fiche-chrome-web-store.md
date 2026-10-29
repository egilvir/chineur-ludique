# Fiche Chrome Web Store — textes à copier-coller

## Fiche (onglet « Store listing »)

**Nom** (repris du champ `name` du manifest, 75 caractères max)
> Chineur Ludique – jeux de société d'occasion

**Résumé** (132 caractères max, repris du manifest)
> Jeux de société : statut dans ta collection BGG, avis BGG et MyLudo en un clic, recherche d'occasion sur Okkazeo, Leboncoin…

**Catégorie**
> Lifestyle › Shopping

**Langue**
> Français

**Description détaillée**

```
Tu chines des jeux de société ? Chineur Ludique t'accompagne sur chaque fiche de jeu et chaque annonce.

🎲 RECONNAÎT LE JEU
Sur BoardGameGeek, MyLudo, Okkazeo, Philibert, Leboncoin, Vinted, eBay et Amazon, l'extension repère le jeu affiché : nom français et anglais, jeu de base ou extension.

✓ TA COLLECTION BGG SUR CHAQUE PAGE
Relie ton pseudo BoardGameGeek et une pastille t'indique tout de suite :
• ✓ si le jeu est déjà dans ta ludothèque
• ♥ s'il est dans ta liste d'envies (avec ta priorité)
• si tu possèdes un jeu proche, par exemple le jeu de base d'une extension
Fini les doublons achetés par erreur.

⭐ LES AVIS EN UN CLIC
Boutons BGG et MyLudo pour lire les notes et les avis avant d'acheter.

♻ LA RECHERCHE D'OCCASION
Un clic ouvre la recherche du jeu sur Okkazeo, Leboncoin (Jeux & jouets), Vinted et eBay (occasion), dans un groupe d'onglets. En option : Philibert (prix neuf de référence) et Facebook Marketplace. Prix max, choix du nom FR ou EN, clic droit sur un nom de jeu.

🔒 RESPECTUEUX DE TA VIE PRIVÉE
Pas de serveur, pas de compte, pas de pub, pas de statistiques. Ta collection reste dans ton navigateur. Code source ouvert.

La collection BGG est facultative : sans pseudo, la pastille, les avis et la recherche d'occasion fonctionnent quand même.

Projet indépendant, non affilié à BoardGameGeek, MyLudo, Okkazeo, ni aux sites de vente cités.
```

**Visuels** (dossier `store/screenshots`)
- Icône : `extension/icons/icon128.png`
- Captures 1280×800 : `1-pastille.png`, `2-popup.png`, `3-statuts.png`
- Petite vignette promo 440×280 : `promo-440x280.png`

**Liens**
- Site web / page d'accueil : `https://github.com/egilvir/chineur-ludique`
- Assistance : `https://github.com/egilvir/chineur-ludique/issues`

## Onglet « Privacy practices »

**Objectif unique (single purpose)**
> Aider les joueurs de jeux de société à identifier le jeu affiché sur une page, voir s'il est dans leur collection BoardGameGeek, consulter ses avis et le trouver d'occasion.

**Justification des permissions**

| Permission | Justification |
|---|---|
| `activeTab` | Lire le titre et le prix de la page en cours quand l'utilisateur ouvre le popup, pour reconnaître le jeu. |
| `scripting` | Injecter le script de détection du jeu dans l'onglet actif à l'ouverture du popup ; lire la collection BGG depuis un onglet boardgamegeek.com déjà ouvert si l'accès direct est refusé. |
| `contextMenus` | Menu clic droit « Chercher le jeu d'occasion » sur un texte sélectionné. |
| `storage` | Mémoriser les réglages, la collection BGG de l'utilisateur et un cache des noms de jeux. |
| `tabGroups` | Regrouper dans un groupe d'onglets les recherches ouvertes sur les sites d'occasion. |
| `alarms` | Resynchroniser la collection BGG deux fois par jour. |
| Hôte `boardgamegeek.com` | Télécharger la collection de l'utilisateur connecté via l'API XML de BGG. |
| Hôtes `www.wikidata.org`, `query.wikidata.org` | Trouver le nom français/anglais et le numéro BGG du jeu affiché. |
| Scripts de contenu (BGG, MyLudo, Okkazeo, Philibert, Leboncoin, Vinted, eBay, Amazon) | Afficher la pastille (statut dans la collection, boutons avis et recherche) sur les fiches de jeux de ces sites. |

**Code distant (remote code)**
> Non. Tout le code est inclus dans le paquet de l'extension.

**Données utilisées** (cases à cocher)
- ☑ **Informations permettant d'identifier une personne** : pseudo BoardGameGeek saisi par l'utilisateur, envoyé uniquement à BoardGameGeek pour récupérer sa collection.
- ☑ **Contenu de site web** : titre et prix des fiches produits sur les sites pris en charge ; le nom du jeu est envoyé à Wikidata pour l'identifier.
- ☐ Tout le reste (santé, finances, authentification, communications, localisation, historique web, activité utilisateur) : non.

**Certifications** (cocher les trois)
- Je ne vends ni ne transfère les données des utilisateurs à des tiers, en dehors des cas d'usage approuvés.
- Je n'utilise ni ne transfère les données des utilisateurs à des fins sans rapport avec l'objectif unique de l'extension.
- Je n'utilise ni ne transfère les données des utilisateurs pour évaluer leur solvabilité ou accorder des prêts.

**URL de la politique de confidentialité**
> `https://github.com/egilvir/chineur-ludique/blob/main/PRIVACY.md`

## Onglet « Distribution »

- **Visibilité** : commencer en **Non répertoriée** (installable seulement avec le lien), puis passer en **Publique**.
- **Pays** : tous, ou France/Belgique/Suisse/Canada (l'interface est en français).
- **Paiement** : gratuit.

---

## Version anglaise (plus tard)

Le nom et le résumé viennent du manifest : pour une fiche anglaise, il faudra ajouter un dossier `_locales` (fr, en). Description anglaise prête :

**Name:** the store uses the manifest name; for an English listing, add a translated `name` through `_locales` later.

**Summary:** Board games: your BGG collection status, BGG & MyLudo reviews in one click, second-hand search on Okkazeo, Leboncoin…

**Description:**

```
For board game hunters on French marketplaces (interface in French).

• Recognizes the game on BoardGameGeek, MyLudo, Okkazeo, Philibert, Leboncoin, Vinted, eBay and Amazon: French and English names, base game or expansion.
• Link your BoardGameGeek username: a badge shows if you already own the game, if it's on your wishlist (with priority), or if you own a related game.
• BGG and MyLudo buttons to read ratings and reviews.
• One click searches the game second-hand on Okkazeo, Leboncoin, Vinted and eBay, in a tab group.
• No server, no account, no ads, no analytics. Open source.

Independent project, not affiliated with BoardGameGeek, MyLudo or Okkazeo.
```
