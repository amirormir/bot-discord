# TCGarden sur Discord

Les commandes animées du jeu de cartes [TCGarden](https://tcgarden.vercel.app), dont les cartes sont les membres du serveur. Chaque commande publie un GIF dans la direction artistique du site : un jardin nocturne bioluminescent, des cartes qui éclosent, la lumière de la plus rare qui envahit le fond.

| Commande | Ce qu'elle montre |
| --- | --- |
| `!vitrine [@membre]` | La vitrine d'un jardinier (jusqu'à six cartes, dans son ordre). La plus rare éclot en dernier ; une Mythique remplit le fond de son illustration, sous une aurore prismatique. |
| `!best [@membre]` | Ses trois plus belles cartes, en podium : la troisième, la deuxième, puis la première. |
| `!profil [@membre]` | Sa carte de visite : avatar, rang, devise, herbier qui se remplit, carte de cœur, dans l'ambiance et la teinte choisies sur le site. |
| `!booster` | Son dernier sachet, rejoué : il tremble, se déchire, les cartes se retournent une à une. Seulement le sien. |
| `!carte <nom>` / `!carte @membre` | La fiche d'une carte, qui tourne en 3D, avec son étiquette d'herbier. |
| `!tcg` | L'aide. |

Une Secrète ne se montre jamais sur Discord : elle apparaît de dos, dans son éclipse.

## Variables

| Variable | |
| --- | --- |
| `TCGARDEN_BOT_SECRET` | Obligatoire : la même valeur que `BOT_API_SECRET` sur le site. Sans elle, les commandes restent muettes. |
| `TCGARDEN_URL` | Facultatif, `https://tcgarden.vercel.app` par défaut. |
| `TCGARDEN_CHANNEL_IDS` | Facultatif : salons où les commandes répondent, séparés par des virgules (vide : partout). |
| `TCGARDEN_COOLDOWN` | Facultatif : secondes entre deux commandes d'un même membre (15). |

## Fonctionnement

- `api.js` lit le site par `/api/bot/v1` (avec le secret) et télécharge les visuels des cartes (avec un cache). Le bot n'a pas accès à la base : il ne reçoit que ce qu'un joueur voit déjà sur le site.
- `render/` dessine les images avec `@napi-rs/canvas` : la carte telle que sur le site (`card.js`), le jardin (`garden.js`), la mise en scène (`stage.js`), une scène par commande (`scenes/`). `gif.js` encode : une palette commune, un tramage ordonné fixe et seulement les pixels qui changent d'une image à l'autre, pour 2 à 3 Mo par GIF.
- Le rendu tourne dans un fil à part (`render/pool.js`), un GIF à la fois : le bot reste réactif pendant le calcul (1 à 3 secondes).

## Tester

- `npm run test:tcgarden` : encodeur, commandes, chaque scène sur des données fictives.
- `npm run tcgarden:preview -- vitrine <id Discord>` (ou `best`, `profil`, `booster`, `carte <nom>`) : lit le site et écrit le GIF dans `.lab/`, sans passer par Discord.

## Polices

Fraunces et Manrope, sous licence SIL Open Font License 1.1 (`assets/fonts/OFL-*.txt`). Le logo, les silhouettes du jardin et les motifs des cartes viennent du site TCGarden.
