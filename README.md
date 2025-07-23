# Bot Discord Modulaire

Un bot Discord avec une architecture modulaire et bien structurée.

## Structure du Projet

```
bot-discord/
├── config/
│   └── config.js          # Configuration centralisée
├── handlers/
│   ├── messageHandler.js  # Gestionnaire principal des messages
│   ├── randomResponseHandler.js  # Gestion des réponses aléatoires
│   └── imageModerationHandler.js # Modération des images
├── services/
│   └── discordBot.js      # Service principal du bot
├── utils/
│   ├── logger.js          # Utilitaire de logging
│   └── imageDetector.js   # Détection d'images
├── index.js               # Point d'entrée principal
└── package.json
```

## Fonctionnalités

### 1. Réponses Aléatoires

- Surveille un utilisateur spécifique (`277825453580877824`)
- Répond avec des messages aléatoires tous les 2-3 messages
- Messages disponibles :
  - "bien dit goat"
  - "les termes"
  - "reel"
  - "OWN THIS FRAUD"
  - "MY midlaner"

### 2. Modération d'Images

- Surveille une liste d'utilisateurs spécifiques
- Détecte les images et GIF (pièces jointes et liens)
- Supprime automatiquement les messages contenant des images
- Remplace par un GIF de remplacement avec le texte "crois le"
- Supprime le message de remplacement après 5 secondes

## Configuration

Toutes les configurations sont centralisées dans `config/config.js` :

- `DISCORD_TOKEN` : Token du bot Discord
- `WATCHED_USERS` : Liste des utilisateurs surveillés pour les images
- `RANDOM_RESPONSE_USER` : Utilisateur pour les réponses aléatoires
- `RANDOM_RESPONSES` : Messages de réponse aléatoires
- `REPLACEMENT_GIF` : GIF de remplacement
- `MESSAGE_DELETE_DELAY` : Délai de suppression (5 secondes)

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

### Gestionnaires (Handlers)

- `MessageHandler` : Coordonne tous les autres gestionnaires
- `RandomResponseHandler` : Gère les réponses aléatoires
- `ImageModerationHandler` : Gère la modération des images

### Utilitaires (Utils)

- `Logger` : Système de logging avec des méthodes spécialisées
- `ImageDetector` : Détection d'images dans les messages

### Services

- `DiscordBot` : Service principal qui gère la connexion Discord

## Gestion d'Erreurs

- Gestion des erreurs non capturées
- Arrêt propre du bot avec `SIGINT` et `SIGTERM`
- Logging détaillé des erreurs
- Try-catch dans tous les gestionnaires

## Extensibilité

La structure modulaire permet d'ajouter facilement de nouvelles fonctionnalités :

1. Créer un nouveau gestionnaire dans `handlers/`
2. L'ajouter au `MessageHandler`
3. Configurer les paramètres dans `config/config.js`
