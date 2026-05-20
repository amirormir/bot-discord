import mongoose from "mongoose";

const playerCostTicketSchema = new mongoose.Schema(
  {
    guildId: { type: String, required: true, index: true },
    userId: { type: String, required: true, index: true },
    requestChannelId: { type: String, required: true },
    committeeChannelId: { type: String, required: true },
    committeeRoleId: { type: String, required: true },
    dpmLink: { type: String, required: true },
    desiredCost: { type: Number, required: true, min: 1, max: 5 },
    roles: { type: String, required: true },
    optionalMessage: { type: String, default: "" },
    committeeMessageId: { type: String, required: true, unique: true },
    status: {
      type: String,
      enum: ["OPEN", "ANSWERED"],
      default: "OPEN",
    },
    lastResponse: { type: String, default: "" },
    lastRespondedBy: { type: String, default: null },
    lastRespondedAt: { type: Date, default: null },
  },
  {
    timestamps: true,
  }
);

export const PlayerCostTicket = mongoose.model(
  "PlayerCostTicket",
  playerCostTicketSchema
);
