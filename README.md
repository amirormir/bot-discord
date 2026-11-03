# Bot Discord Modulaire

Un bot Discord avec une architecture modulaire et bien structurée, utilisant MongoDB pour la persistance des données.

## Structure du Projet

```
ewa/
├── config/
│   └── config.js                    # Configuration centralisée
├── handlers/
│   ├── messageHandler.js            # Gestionnaire principal des messages
│   ├── imageModerationHandler.js    # Modération des images
│   ├── globalResponseHandler.js     # Réponses globales et ADC
│   ├── messageTemplateHandler.js    # Gestion des templates de messages
│   └── customGameHandler.js         # Gestion de la queue 5v5
├── models/
│   ├── WatchedUser.js               # Modèle des utilisateurs surveillés
│   ├── RandomResponseUser.js        # Modèle de l'utilisateur random
│   ├── MessageTemplate.js           # Modèle des templates de messages
│   ├── Player.js                    # Modèle des joueurs 5v5
│   ├── Queue.js                     # Modèle de la queue 5v5
│   └── PlayerStats.js               # Modèle des statistiques des joueurs
├── services/
│   └── discordBot.js                # Service principal du bot
├── utils/
│   ├── logger.js                    # Utilitaire de logging
│   ├── imageDetector.js             # Détection d'images
│   ├── teamBuilder.js               # Algorithme de création d'équipes 5v5
│   └── db.js                        # Connexion MongoDB
├── index.js                         # Point d'entrée principal
└── package.json
```

## Fonctionnalités

### 1. Modération d'Images

- Surveille une liste d'utilisateurs spécifiques (stockée en MongoDB)
- Détecte les images et GIF (pièces jointes et liens)
- Supprime automatiquement les messages contenant des images
- Remplace par un GIF de remplacement avec le texte "crois le"
- Supprime le message de remplacement après 5 secondes

### 2. Réponses Aléatoires

- Surveille un utilisateur spécifique (configurable via commande)
- Répond avec des messages aléatoires tous les 2-3 messages
- Messages configurables dans `config/config.js`

### 3. Réponses Globales

- Répond à tous les 5-6 messages avec des réponses aléatoires
- Utilisateurs "bénis" exclus du décompte (définis dans le code)
- Réponses : "pas lu", "après qui ta demandé", "bodycount ?", etc.

### 4. Réponses ADC

- Déclenché quand l'utilisateur `324201004176375808` utilise les mots "adc", "ADC", "AD", etc.
- Réponses automatiques sur le thème ADC/toplane

### 5. Templates de Messages

- Création et gestion de templates de messages
- Envoi via sélecteur de channel avec `@everyone`
- Interface utilisateur intuitive avec menus déroulants

### 6. Queue 5v5 Custom

- Système de file d'attente pour organiser des parties 5v5
- Sélection de rôles (Top, Jungle, Mid, ADC, Support, Fill)
- Attribution de niveaux (1-5) pour l'équilibrage
- Algorithme de backtracking pour un équilibrage optimal des équipes
- Système de classement et statistiques des joueurs
- Interface interactive avec boutons et menus déroulants

## Commandes

### Commandes Accessibles à Tous les Membres

#### Queue 5v5 Custom

- `!custom start` : Démarrer une queue 5v5
- `!custom stop` : Arrêter et vider la queue
- `!custom reset` : Vider la queue et recommencer
- `!custom reroll` : Refaire les équipes avec les joueurs actuels
- `!custom test` : Créer 10 joueurs de test prédéfinis
- `!custom random` : Créer 10 joueurs avec rôles/niveaux aléatoires

#### Statistiques et Classement

- `!classement` : Afficher le classement des joueurs
- `!stats <@user>` : Afficher les stats détaillées d'un joueur

#### Autres
- `!help` : Afficher la liste des commandes

### Commandes Administrateur

#### Gestion des Utilisateurs Surveillés

- `!addwatch <userId>` : Ajouter un utilisateur surveillé
- `!removewatch <userId>` : Retirer un utilisateur surveillé

#### Gestion des Réponses Random

- `!setrandomuser <userId>` : Définir l'utilisateur cible des réponses random
- `!removerandomuser` : Désactiver les réponses random

#### Gestion des Templates

- `!createtemplate <nom> <contenu>` : Créer un template de message
- `!listtemplates` : Lister tous les templates
- `!deletetemplate <nom>` : Supprimer un template
- `!sendmessage` : Envoyer un message via sélecteur

#### Administration

- `!resetclassement` : Réinitialiser le classement (Admin uniquement)

## Configuration

### Variables d'Environnement

Créez un fichier `.env` à la racine du projet :

```
DISCORD_TOKEN=votre_token_discord
MONGO_URL=votre_url_mongodb
# TCGarden (tcgarden/README.md) : le même secret que BOT_API_SECRET sur le site
TCGARDEN_BOT_SECRET=
```

### TCGarden

Les commandes `!vitrine`, `!best`, `!profil`, `!booster`, `!carte` et `!tcg` publient des GIF animés du jeu de cartes TCGarden : voir [tcgarden/README.md](tcgarden/README.md).

### Configuration MongoDB

- Toutes les données sont stockées en MongoDB
- Connexion automatique au démarrage
- Modèles Mongoose pour la persistance

## Installation

```bash
npm install
```

## Démarrage

```bash
npm start
```

## Architecture

### Pattern Modulaire

- **Séparation des responsabilités** : Chaque classe a une responsabilité unique
- **Injection de dépendances** : Les dépendances sont injectées via le constructeur
- **Configuration centralisée** : Toutes les constantes dans un seul fichier
- **Logging unifié** : Système de logging centralisé avec des méthodes spécialisées
- **Persistance MongoDB** : Données stockées en base avec Mongoose

### Gestionnaires (Handlers)

- `MessageHandler` : Coordonne tous les autres gestionnaires et gère les commandes
- `ImageModerationHandler` : Gère la modération des images
- `GlobalResponseHandler` : Gère les réponses globales et ADC
- `MessageTemplateHandler` : Gère les templates de messages
- `CustomGameHandler` : Gère la queue 5v5 et le système de classement

### Modèles (Models)

- `WatchedUser` : Utilisateurs surveillés pour la modération
- `RandomResponseUser` : Utilisateur cible des réponses random
- `MessageTemplate` : Templates de messages
- `Player` : Joueurs dans la queue 5v5
- `Queue` : État de la queue 5v5
- `PlayerStats` : Statistiques des joueurs

### Utilitaires (Utils)

- `Logger` : Système de logging avec des méthodes spécialisées
- `ImageDetector` : Détection d'images dans les messages
- `TeamBuilder` : Algorithme de backtracking pour l'équilibrage des équipes 5v5
- `db.js` : Connexion et configuration MongoDB

### Services

- `DiscordBot` : Service principal qui gère la connexion Discord et les interactions

## Gestion d'Erreurs

- Gestion des erreurs non capturées
- Arrêt propre du bot avec `SIGINT` et `SIGTERM`
- Logging détaillé des erreurs
- Try-catch dans tous les gestionnaires
- Gestion des erreurs MongoDB

## Sécurité

- Commandes sensibles réservées aux administrateurs
- Commandes custom et classement accessibles à tous les membres
- Validation des entrées utilisateur
- Gestion sécurisée des tokens et URLs

## Extensibilité

La structure modulaire permet d'ajouter facilement de nouvelles fonctionnalités :

1. Créer un nouveau gestionnaire dans `handlers/`
2. Créer les modèles Mongoose nécessaires dans `models/`
3. L'ajouter au `MessageHandler` ou `DiscordBot`
4. Configurer les paramètres dans `config/config.js` ou en base

## Utilisateurs Bénis

Les utilisateurs suivants sont exclus du décompte des réponses globales :

- 277825453580877824
- 700466241265205368
- 451379187031343104
- 276060004262477825
- 432610292342587392
- 472911936951156740
- 684773505157431347
- 589065324834324500
- 338222603829510164
- 550737379460382752
- 204255221017214977
- 1397555801542889564
