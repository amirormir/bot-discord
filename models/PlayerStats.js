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
  // Système Glicko-2
  rating: {
    type: Number,
    default: 1000,
    min: 0,
  },
  rd: {
    type: Number,
    default: 200,
  },
  volatility: {
    type: Number,
    default: 0.06,
  },
  gamesPlayed: {
    type: Number,
    default: 0,
  },
  lastGameAt: {
    type: Date,
    default: null,
  },
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
  mvpCount: {
    type: Number,
    default: 0,
  },
  aceCount: {
    type: Number,
    default: 0,
  },
  avgOpponentCostWhenWin: {
    type: Number,
    default: 0,
  },
  avgOpponentCostWhenLose: {
    type: Number,
    default: 0,
  },
  winsByOpponentCost: {
    type: Map,
    of: Number,
    default: new Map(),
  },
  lossesByOpponentCost: {
    type: Map,
    of: Number,
    default: new Map(),
  },
  ratingHistory: [
    {
      rating: Number,
      rd: Number,
      displayScore: Number,
      ratingDelta: Number,
      displayDelta: Number,
      matchId: String,
      date: { type: Date, default: Date.now },
    },
  ],
  lastUpdated: {
    type: Date,
    default: Date.now,
  },
});

playerStatsSchema.virtual("winrate").get(function () {
  if (this.totalGames === 0) return 0;
  return ((this.wins / this.totalGames) * 100).toFixed(1);
});

export const PlayerStats = mongoose.model("PlayerStats", playerStatsSchema);
