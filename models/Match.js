import mongoose from "mongoose";

const playerSnapshotSchema = {
  userId: String,
  username: String,
  ratingBefore: Number,
  ratingAfter: Number,
  rdBefore: Number,
  rdAfter: Number,
  volatilityBefore: Number,
  volatilityAfter: Number,
  ratingDelta: Number,
  displayBefore: Number,
  displayAfter: Number,
  displayDelta: Number,
  cost: Number,
  role: String,
  result: { type: String, enum: ["win", "loss"] },
  performanceRole: { type: String, enum: ["MVP", "ACE", null], default: null },
};

const matchSchema = new mongoose.Schema({
  matchId: {
    type: String,
    required: true,
    unique: true,
  },
  team1: {
    players: [playerSnapshotSchema],
    averageRating: Number,
    averageRD: Number,
    averageCost: Number,
  },
  team2: {
    players: [playerSnapshotSchema],
    averageRating: Number,
    averageRD: Number,
    averageCost: Number,
  },
  winner: {
    type: String,
    enum: ["team1", "team2"],
    required: true,
  },
  mvpUserId: { type: String, default: null },
  aceUserId: { type: String, default: null },
  duration: {
    type: Number,
    default: null,
  },
  victoryMargin: {
    type: Number,
    default: null,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  resolvedAt: {
    type: Date,
    default: Date.now,
  },
  resolvedBy: {
    type: String,
    required: true,
  },
});

matchSchema.index({ matchId: 1 });
matchSchema.index({ createdAt: -1 });
matchSchema.index({ "team1.players.userId": 1 });
matchSchema.index({ "team2.players.userId": 1 });

export const Match = mongoose.model("Match", matchSchema);
