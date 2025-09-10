# 🏆 Système Elo Dynamique

## 📋 Vue d'ensemble

Le système Elo dynamique permet d'attribuer un score de compétence aux joueurs basé sur leurs performances dans les matchs 5v5. Il combine l'Elo classique avec le système de "coût" interne pour un équilibrage optimal.

## 🎯 Fonctionnalités

### ✨ Caractéristiques principales

- **Elo de départ** : 1000 points pour tous les joueurs
- **Calcul hybride** : Combine l'Elo classique et le coût des équipes
- **Facteur K dynamique** : S'adapte selon l'expérience et le niveau du joueur
- **Bornes de sécurité** : Changements limités entre -40 et +40 points
- **Historique complet** : Suivi de l'évolution de l'Elo de chaque joueur

### 🔧 Paramètres configurables

- **Conversion Cost → Elo** : 1 coût = 60 Elo (par défaut)
- **Poids de mélange (λ)** : 70% Elo, 30% Coût (par défaut)
- **Facteurs K** : 40 (nouveaux), 24 (standard), 16 (experts)
- **Bonus performance** : ±5 points maximum

## 🧮 Algorithme de calcul

### 1. Calcul de l'Expected Elo

```
Expected = 1 / (1 + 10^((Elo_Adversaire - Elo_Joueur) / 400))
```

### 2. Calcul de l'Expected Cost

```
Différence_Cost = (Cost_Équipe1 - Cost_Équipe2) × 60
Expected = 1 / (1 + 10^(-Différence_Cost / 400))
```

### 3. Expected Blendé

```
Expected_Final = λ × Expected_Elo + (1-λ) × Expected_Cost
```

### 4. Changement d'Elo

```
Δ = K × (Score - Expected_Final) + Bonus_Performance
Δ = max(-40, min(40, Δ))  // Bornes de sécurité
```

### 5. Facteur K dynamique

- **< 10 parties** : K = 40 (apprentissage rapide)
- **10-2000 Elo** : K = 24 (standard)
- **> 2000 Elo** : K = 16 (stabilité)

## 📊 Exemples de calcul

### Exemple 1 : Match équilibré

```
Équipe 1: Elo 1000, Cost 3.0
Équipe 2: Elo 1000, Cost 3.0
Résultat: Équipe 1 gagne

Expected Elo: 0.5 / 0.5
Expected Cost: 0.5 / 0.5
Expected Blendé: 0.5 / 0.5

Changement: ±12 points (K=24)
```

### Exemple 2 : Upset (underdog gagne)

```
Équipe 1: Elo 1000, Cost 2.0
Équipe 2: Elo 1200, Cost 4.0
Résultat: Équipe 1 gagne

Expected Elo: 0.24 / 0.76
Expected Cost: 0.24 / 0.76
Expected Blendé: 0.24 / 0.76

Changement Équipe 1: +18 points
Changement Équipe 2: -18 points
```

### Exemple 3 : Nouveau joueur

```
Joueur: 5 parties, Elo 1000
Victoire surprise: +32 points (K=40)
Défaite attendue: -8 points (K=40)
```

## 🛠️ Configuration

### Paramètres principaux

#### `costToElo` (défaut: 60)

- Conversion entre coût et Elo
- Plus élevé = le coût influence plus l'expected
- Recommandé: 40-80

#### `lambda` (défaut: 0.7)

- Poids entre Elo et Coût
- 0.7 = 70% Elo, 30% Coût
- Recommandé: 0.6-0.8

#### `kFactors`

```javascript
{
  newbie: 40,    // < 10 parties
  standard: 24,  // 10-2000 Elo
  expert: 16     // > 2000 Elo
}
```

### Ajustement des paramètres

#### Pour un système plus réactif

```javascript
{
  costToElo: 80,
  lambda: 0.6,
  kFactors: { newbie: 50, standard: 30, expert: 20 }
}
```

#### Pour un système plus stable

```javascript
{
  costToElo: 40,
  lambda: 0.8,
  kFactors: { newbie: 30, standard: 20, expert: 12 }
}
```

## 🔌 API Endpoints

### Résoudre un match

```http
POST /elo/matches/resolve
Content-Type: application/json

{
  "matchData": {
    "team1": {
      "players": [
        {
          "userId": "123",
          "username": "Player1",
          "elo": 1000,
          "cost": 3,
          "role": "Top"
        }
        // ... 4 autres joueurs
      ]
    },
    "team2": {
      "players": [
        // ... 5 joueurs
      ]
    },
    "winner": "team1",
    "duration": 25,
    "victoryMargin": 2
  },
  "resolvedBy": "admin_user_id"
}
```

### Obtenir les stats d'un joueur

```http
GET /elo/players/{userId}/stats
```

### Obtenir le classement

```http
GET /elo/leaderboard?limit=50
```

### Mettre à jour la configuration

```http
PUT /elo/config
Content-Type: application/json

{
  "config": {
    "costToElo": 70,
    "lambda": 0.75
  }
}
```

## 🧪 Tests

### Exécuter les tests

```bash
npm test
```

### Tests inclus

- ✅ Calcul des expected (Elo et Cost)
- ✅ Mélange des expected avec λ
- ✅ Facteur K dynamique
- ✅ Bornes de changement (-40/+40)
- ✅ Underdog gagne plus de points
- ✅ Influence du coût sur l'expected
- ✅ Validation des données de match

### Exemples de tests

```javascript
// Test: Underdog gagne plus de points
const underdog = { elo: 1000, gamesPlayed: 50 };
const favorite = { elo: 1200, gamesPlayed: 50 };
const expected = { team1Expected: 0.3, team2Expected: 0.7 };

const underdogResult = eloService.calculateEloChange(underdog, "win", expected);
const favoriteResult = eloService.calculateEloChange(
  favorite,
  "loss",
  expected
);

expect(Math.abs(underdogResult.change)).toBeGreaterThan(
  Math.abs(favoriteResult.change)
);
```

## 📈 Monitoring et logs

### Logs détaillés

Chaque calcul d'Elo génère des logs complets :

```
[ELO_SERVICE] Expected Elo - Team1: 0.240, Team2: 0.760
[ELO_SERVICE] Expected Cost - Team1: 0.240, Team2: 0.760 (diff: -120.0 Elo)
[ELO_SERVICE] Blended Expected (λ=0.7) - Team1: 0.240, Team2: 0.760
[ELO_SERVICE] K Factor: 24 (Elo: 1000, Games: 50)
[ELO_SERVICE] Elo Change pour Player1: +18.0 (K: 24, Score: 1, Expected: 0.240, Bonus: 0)
```

### Métriques importantes

- **Temps de calcul** : < 100ms par match
- **Précision** : Expected calculé à 3 décimales
- **Stabilité** : Bornes respectées à 100%

## 🚀 Intégration

### Dans le bot Discord

```javascript
import { EloController } from "./controllers/eloController.js";

const eloController = new EloController();

// Après un match
const result = await eloController.resolveMatch(matchData, adminUserId);
console.log(`Match résolu: ${result.matchId}`);
```

### Avec Express

```javascript
import eloRoutes from "./routes/eloRoutes.js";

app.use("/elo", eloRoutes);
```

## 🔧 Maintenance

### Réinitialisation des Elo

```javascript
// Remettre tous les joueurs à 1000 Elo
await PlayerStats.updateMany({}, { elo: 1000, eloHistory: [] });
```

### Ajustement des paramètres

```javascript
// Ajuster selon les performances observées
eloController.updateEloConfig({
  costToElo: 70, // Augmenter si le coût n'influence pas assez
  lambda: 0.75, // Augmenter si l'Elo est trop dominant
});
```

### Nettoyage de l'historique

```javascript
// Limiter l'historique à 50 entrées (automatique)
// Ou nettoyer les anciennes entrées
const cutoffDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000); // 90 jours
await PlayerStats.updateMany(
  {},
  { $pull: { eloHistory: { date: { $lt: cutoffDate } } } }
);
```

## 📚 Références

- [Système Elo - Wikipedia](https://fr.wikipedia.org/wiki/Système_Elo)
- [Elo Rating System - Chess.com](https://www.chess.com/terms/elo-rating-chess)
- [Glicko Rating System](https://en.wikipedia.org/wiki/Glicko_rating_system) (alternative plus complexe)

---

_Système développé pour le bot Discord EWA - Architecture MVC avec Node.js + Express_
