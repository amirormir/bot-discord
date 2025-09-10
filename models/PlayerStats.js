import mongoose from "mongoose";

const playerStatsSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true,
    unique: true,
  },
  username: {
    type: String,
    required: true,
  },
  // Système Elo
  elo: {
    type: Number,
    default: 1000, // Elo de départ
    min: 0,
  },
  gamesPlayed: {
    type: Number,
    default: 0,
  },
  // Statistiques classiques (conservées pour compatibilité)
  wins: {
    type: Number,
    default: 0,
  },
  losses: {
    type: Number,
    default: 0,
  },
  totalGames: {
    type: Number,
    default: 0,
  },
  // Coût moyen des équipes adverses quand le joueur gagne
  avgOpponentCostWhenWin: {
    type: Number,
    default: 0,
  },
  // Coût moyen des équipes adverses quand le joueur perd
  avgOpponentCostWhenLose: {
    type: Number,
    default: 0,
  },
  // Nombre de parties gagnées contre chaque niveau de coût
  winsByOpponentCost: {
    type: Map,
    of: Number,
    default: new Map(),
  },
  // Nombre de parties perdues contre chaque niveau de coût
  lossesByOpponentCost: {
    type: Map,
    of: Number,
    default: new Map(),
  },
  // Historique Elo pour tracking
  eloHistory: [
    {
      elo: Number,
      change: Number,
      matchId: String,
      date: { type: Date, default: Date.now },
    },
  ],
  lastUpdated: {
    type: Date,
    default: Date.now,
  },
});

// Méthode pour calculer le winrate
playerStatsSchema.virtual("winrate").get(function () {
  if (this.totalGames === 0) return 0;
  return ((this.wins / this.totalGames) * 100).toFixed(1);
});

// Méthode pour mettre à jour les statistiques après une partie
playerStatsSchema.methods.updateStats = function (isWin, opponentTeamCost) {
  this.totalGames++;

  if (isWin) {
    this.wins++;
    // Mettre à jour le coût moyen des adversaires quand on gagne
    const totalCostWhenWin =
      this.avgOpponentCostWhenWin * (this.wins - 1) + opponentTeamCost;
    this.avgOpponentCostWhenWin = totalCostWhenWin / this.wins;

    // Incrémenter le compteur de victoires pour ce coût d'adversaire
    const costKey = opponentTeamCost.toString();
    this.winsByOpponentCost.set(
      costKey,
      (this.winsByOpponentCost.get(costKey) || 0) + 1
    );
  } else {
    this.losses++;
    // Mettre à jour le coût moyen des adversaires quand on perd
    const totalCostWhenLose =
      this.avgOpponentCostWhenLose * (this.losses - 1) + opponentTeamCost;
    this.avgOpponentCostWhenLose = totalCostWhenLose / this.losses;

    // Incrémenter le compteur de défaites pour ce coût d'adversaire
    const costKey = opponentTeamCost.toString();
    this.lossesByOpponentCost.set(
      costKey,
      (this.lossesByOpponentCost.get(costKey) || 0) + 1
    );
  }

  this.lastUpdated = new Date();
};

export const PlayerStats = mongoose.model("PlayerStats", playerStatsSchema);
