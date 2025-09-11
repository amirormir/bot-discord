# Commandes Admin et Publiques

Ce document décrit les commandes administrateur et publiques disponibles dans le bot.

## Permissions

### Commandes Admin

Les commandes admin sont accessibles aux utilisateurs ayant :

- La permission **Administrateur** sur le serveur Discord
- Le rôle **Arbitre** (pour certaines commandes)

### Commandes Publiques

Les commandes publiques sont accessibles à **tous les utilisateurs**.

## Commandes Disponibles

### Commandes Publiques

#### `!elo @utilisateur`

Affiche l'ELO et les statistiques d'un joueur.

**Permissions :** Tous les utilisateurs

**Utilisation :**

```
!elo @Nickel
```

**Informations affichées :**

- ELO actuel
- Nombre de parties jouées
- Winrate (pourcentage de victoires)
- Nombre de victoires/défaites
- Rang (Bronze/Argent/Or selon l'ELO)
- Dernière mise à jour
- Stats avancées (coût moyen des adversaires)

**Fonctionnalités :**

- Couleur de l'embed selon le rang ELO
- Gestion des joueurs sans stats (ELO par défaut 1000)
- Affichage de l'avatar du joueur

---

### Commandes Admin

### 1. Gestion des Réponses Globales

#### `!admin pauseglobal`

Met en pause ou active les réponses globales automatiques du bot.

**Permissions :** Admin ou Arbitre

**Utilisation :**

```
!admin pauseglobal
```

**Fonctionnement :**

- Premier usage : Met en pause les réponses globales
- Deuxième usage : Réactive les réponses globales
- Affiche un embed avec le statut actuel

---

### 2. Gestion de l'ELO

#### `!admin elo add @utilisateur <points>`

Ajoute des points ELO à un joueur.

**Permissions :** Admin ou Arbitre

**Utilisation :**

```
!admin elo add @Nickel 50
```

#### `!admin elo remove @utilisateur <points>`

Retire des points ELO à un joueur.

**Permissions :** Admin ou Arbitre

**Utilisation :**

```
!admin elo remove @Nickel 25
```

#### `!admin elo set @utilisateur <points>`

Définit l'ELO exact d'un joueur.

**Permissions :** Admin ou Arbitre

**Utilisation :**

```
!admin elo set @Nickel 1200
```

**Fonctionnalités :**

- Crée automatiquement les stats du joueur si elles n'existent pas
- Ajoute l'opération à l'historique ELO
- Affiche un embed avec les détails de la modification
- L'ELO ne peut pas descendre en dessous de 0

---

### 3. Reset ELO Complet

#### `!admin eloreset`

Remet l'ELO de tous les joueurs à 1000 et supprime tous les matchs.

**Permissions :** Admin uniquement (commande critique)

**Utilisation :**

```
!admin eloreset
```

**Processus :**

1. Affiche un embed de confirmation avec les détails de l'opération
2. L'utilisateur doit taper `!admin eloreset confirm` pour confirmer
3. Effectue le reset de tous les PlayerStats
4. Supprime tous les matchs de l'historique
5. Affiche un rapport de l'opération

**⚠️ ATTENTION :** Cette commande est **IRRÉVERSIBLE** !

---

## Exemples d'Utilisation

### Scénario 1 : Correction d'ELO après un bug

```
!admin elo add @JoueurBug 100
```

### Scénario 2 : Pause temporaire des réponses

```
!admin pauseglobal
# ... faire des tests ...
!admin pauseglobal
```

### Scénario 3 : Reset complet du système

```
!admin eloreset
!admin eloreset confirm
```

## Logs

Toutes les commandes admin sont loggées avec :

- L'utilisateur qui a exécuté la commande
- Les détails de l'opération
- L'heure et la date

## Sécurité

- Double confirmation pour les commandes critiques
- Vérification des permissions à chaque utilisation
- Logs détaillés pour audit
- Protection contre les valeurs négatives d'ELO
