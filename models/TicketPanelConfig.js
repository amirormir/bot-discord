import mongoose from "mongoose";

const ticketPanelConfigSchema = new mongoose.Schema(
  {
    guildId: { type: String, required: true, unique: true },
    requestChannelId: { type: String, required: true },
    committeeChannelId: { type: String, required: true },
    committeeRoleId: { type: String, required: true },
    panelMessageId: { type: String, default: null },
    createdBy: { type: String, required: true },
    updatedBy: { type: String, required: true },
  },
  {
    timestamps: true,
  }
);

export const TicketPanelConfig = mongoose.model(
  "TicketPanelConfig",
  ticketPanelConfigSchema
);
