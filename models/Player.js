import mongoose from "mongoose";

const playerSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true,
  },
  username: {
    type: String,
    required: true,
  },
  selectedRole: {
    type: String,
    enum: ["Top", "Jungle", "Mid", "ADC", "Support", "Fill"],
    required: true,
  },
  selectedCost: {
    type: Number,
    min: 1,
    max: 5,
    required: true,
  },
  assignedRole: {
    type: String,
    enum: ["Top", "Jungle", "Mid", "ADC", "Support"],
    default: null,
  },
  teamId: {
    type: Number,
    default: null,
  },
  joinedAt: {
    type: Date,
    default: Date.now,
  },
});

export const Player = mongoose.model("Player", playerSchema);
