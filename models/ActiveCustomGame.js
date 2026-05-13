import mongoose from "mongoose";

const activePlayerSchema = new mongoose.Schema(
  {
    userId: String,
    username: String,
    selectedRole: String,
    assignedRole: String,
    selectedCost: Number,
    rating: Number,
    rd: Number,
    volatility: Number,
    tierLabel: String,
  },
  { _id: false }
);

const activeTeamSchema = new mongoose.Schema(
  {
    players: {
      type: [activePlayerSchema],
      default: [],
    },
    averageCost: {
      type: Number,
      default: 0,
    },
  },
  { _id: false }
);

const activeCustomGameSchema = new mongoose.Schema({
  key: {
    type: String,
    unique: true,
    default: "current",
  },
  status: {
    type: String,
    enum: ["awaiting_winner", "awaiting_performance", "completed"],
    default: "awaiting_winner",
  },
  queueId: {
    type: String,
    default: null,
  },
  team1: {
    type: activeTeamSchema,
    default: () => ({ players: [], averageCost: 0 }),
  },
  team2: {
    type: activeTeamSchema,
    default: () => ({ players: [], averageCost: 0 }),
  },
  costDifference: {
    type: Number,
    default: 0,
  },
  winner: {
    type: String,
    enum: ["team1", "team2", null],
    default: null,
  },
  mvpUserId: {
    type: String,
    default: null,
  },
  aceUserId: {
    type: String,
    default: null,
  },
  sourceMatchId: {
    type: String,
    default: null,
  },
  startedAt: {
    type: Date,
    default: Date.now,
  },
  finalizedAt: {
    type: Date,
    default: null,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

activeCustomGameSchema.index({ key: 1 }, { unique: true });

export const ActiveCustomGame = mongoose.model(
  "ActiveCustomGame",
  activeCustomGameSchema
);
