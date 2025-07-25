import mongoose from "mongoose";

const queueSchema = new mongoose.Schema({
  isActive: {
    type: Boolean,
    default: false,
  },
  maxPlayers: {
    type: Number,
    default: 10,
  },
  currentPhase: {
    type: String,
    enum: [
      "waiting",
      "role_selection",
      "cost_selection",
      "team_building",
      "completed",
    ],
    default: "waiting",
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

export const Queue = mongoose.model("Queue", queueSchema);
