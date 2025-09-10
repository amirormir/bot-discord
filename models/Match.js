import mongoose from "mongoose";

const matchSchema = new mongoose.Schema({
  matchId: {
    type: String,
    required: true,
    unique: true,
  },
  // Équipes
  team1: {
    players: [
      {
        userId: String,
        username: String,
        elo: Number,
        cost: Number,
        role: String,
      },
    ],
    averageElo: Number,
    averageCost: Number,
  },
  team2: {
    players: [
      {
        userId: String,
        username: String,
        elo: Number,
        cost: Number,
        role: String,
      },
    ],
    averageElo: Number,
    averageCost: Number,
  },
  // Résultat
  winner: {
    type: String,
    enum: ["team1", "team2"],
    required: true,
  },
  // Métadonnées
  duration: {
    type: Number, // en minutes
    default: null,
  },
  // Facteurs modulateurs optionnels
  victoryMargin: {
    type: Number, // différence de score, etc.
    default: null,
  },
  // Calculs Elo
  eloCalculations: {
    team1Expected: Number,
    team2Expected: Number,
    team1Change: Number,
    team2Change: Number,
    kFactor: Number,
    lambda: Number, // poids entre Elo et Cost
  },
  // Timestamps
  createdAt: {
    type: Date,
    default: Date.now,
  },
  resolvedAt: {
    type: Date,
    default: Date.now,
  },
  resolvedBy: {
    type: String, // userId de l'admin qui a résolu le match
    required: true,
  },
});

// Index pour les requêtes fréquentes
matchSchema.index({ matchId: 1 });
matchSchema.index({ createdAt: -1 });
matchSchema.index({ "team1.players.userId": 1 });
matchSchema.index({ "team2.players.userId": 1 });

export const Match = mongoose.model("Match", matchSchema);
