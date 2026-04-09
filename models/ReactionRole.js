import mongoose from "mongoose";

const reactionRoleSchema = new mongoose.Schema({
  guildId: { type: String, required: true },
  channelId: { type: String, required: true },
  messageId: { type: String, required: true, unique: true },
  reactions: [
    {
      emoji: { type: String, required: true },
      roleId: { type: String, required: true },
      roleName: { type: String },
    },
  ],
  title: { type: String },
  createdBy: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
});

export const ReactionRole = mongoose.model("ReactionRole", reactionRoleSchema);
