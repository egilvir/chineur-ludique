# Chineur Ludique

Extension Chrome pour les fans de jeux de société qui chinent d'occasion. Sur la fiche d'un jeu ou une annonce, elle :

- **reconnaît le jeu** (nom français et anglais, jeu de base ou extension) ;
- t'indique s'il est **dans ta ludothèque**, ta **liste d'envies** BoardGameGeek, ou si tu possèdes **un jeu proche** ;
- ouvre ses **avis BGG et MyLudo** en un clic ;
- le **cherche d'occasion** sur Okkazeo, Leboncoin (Jeux de société, avec livraison, annonces disponibles, sans les inserts vendus seuls), Vinted et eBay (Philibert et Facebook Marketplace en option), et ouvre ses **vidéos YouTube** (règles, présentations) ;
- affiche ta **liste d'envies MyLudo en colonnes** par impatience, à réorganiser par glisser-déposer.

Pas de serveur, pas de compte, pas de pub : voir la [politique de confidentialité](PRIVACY.md).

> Projet indépendant, non affilié à BoardGameGeek, MyLudo, Okkazeo ni aux sites de vente cités.

## Installer

- **Chrome Web Store** : lien à venir.
- **Dernière version** : télécharge `chineur-ludique-<version>.zip` dans les [Releases](https://github.com/egilvir/chineur-ludique/releases/latest), dézippe-le, puis `chrome://extensions` → *Mode développeur* → *Charger l'extension non empaquetée* → dossier dézippé.
- **Depuis le code** : `chrome://extensions` → *Mode développeur* → *Charger l'extension non empaquetée* → dossier `extension/`.

Ensuite, dans les options, saisis ton pseudo BoardGameGeek (facultatif) en étant connecté à boardgamegeek.com dans le navigateur. Les options permettent aussi de masquer la pastille et de garder ou non les inserts vendus seuls dans les recherches.

## Sites pris en charge

| Site | Pastille |
|---|---|
| BoardGameGeek, MyLudo, Okkazeo, Philibert | sur chaque fiche de jeu |
| Leboncoin | annonces Jeux & jouets |
| Vinted, eBay, Amazon | quand l'article est un jeu de société, ou un jeu de ta collection |

Sur les autres sites, le popup (icône ou `Alt+Maj+L`) fonctionne sur la page en cours.

## Comment ça marche

- **Collection** : téléchargée depuis l'API XML de BGG avec la session de l'utilisateur connecté, deux fois par jour.
- **Noms français** : la recherche de l'API BGG demande un jeton, les noms viennent donc de [Wikidata](https://www.wikidata.org) (propriété P2339, « BoardGameGeek game ID »).
- **MyLudo** : pas d'API publique, le bouton ouvre la recherche MyLudo du jeu. Sur ta liste d'envies myludo.fr, un script réorganise l'affichage en colonnes par impatience et enregistre tes glisser-déposer avec ta session, comme le site lui-même.
- **Recherche d'occasion** : chaque site reçoit ses propres filtres dans l'URL (catégorie Jeux de société, livraison, annonces disponibles, prix max). Les inserts vendus seuls sont exclus avec `NOT insert` sur Leboncoin et `-insert` sur eBay ; Vinted ne sait pas exclure un mot.

## Développer

```
extension/   le code de l'extension (Manifest V3, sans dépendance ni étape de build)
tests/       tests unitaires (Node) et de bout en bout (Playwright + Chromium, BGG et Wikidata simulés)
store/       textes et visuels du Chrome Web Store
scripts/     fabrication du paquet
```

```bash
node tests/unit.mjs                       # logique : titres, collection, matching, Wikidata
pip install playwright && python3 -m playwright install chromium
python3 tests/e2e.py                      # extension chargée dans Chromium, pages de test
./scripts/build.sh                        # dist/chineur-ludique-<version>.zip pour le Store
python scripts/build.py                   # même chose sous Windows (sans bash ni zip)
python3 store/make_visuals.py             # régénère les captures du Store depuis la vraie extension
```

La publication pas à pas est décrite dans [PUBLIER.md](PUBLIER.md).

**Ajouter un site de recherche** : une entrée dans `SITES` (`extension/lib.js`).
**Ajouter un site pour la pastille** : son domaine dans `content_scripts.matches` (`manifest.json`) et sa détection dans `extension/detect.js`.

## Licence

[MIT](LICENSE)
