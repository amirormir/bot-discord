import mongoose from "mongoose";

const gameResultSchema = new mongoose.Schema({
  gameId: {
    type: String,
    required: true,
    unique: true,
  },
  winner: {
    type: String,
    enum: ["team1", "team2"],
    required: true,
  },
  team1: {
    players: [
      {
        userId: String,
        username: String,
        selectedRole: String,
        assignedRole: String,
        selectedCost: Number,
      },
    ],
    averageCost: Number,
  },
  team2: {
    players: [
      {
        userId: String,
        username: String,
        selectedRole: String,
        assignedRole: String,
        selectedCost: Number,
      },
    ],
    averageCost: Number,
  },
  costDifference: Number,
  playedAt: {
    type: Date,
    default: Date.now,
  },
  endedBy: {
    type: String, // userId de celui qui a terminé la partie
    required: true,
  },
});

export const GameResult = mongoose.model("GameResult", gameResultSchema);
