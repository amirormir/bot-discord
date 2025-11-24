import mongoose from "mongoose";

const teamPlayerSchema = new mongoose.Schema({
  discordUserId: {
    type: String,
    required: true,
  },
  pseudo: {
    type: String,
    required: true,
  },
  addedAt: {
    type: Date,
    default: Date.now,
  },
});

const teamSchema = new mongoose.Schema({
  guildId: {
    type: String,
    required: true,
    index: true,
  },
  name: {
    type: String,
    required: true,
    trim: true,
  },
  tag: {
    type: String,
    trim: true,
    default: null,
  },
  players: {
    type: [teamPlayerSchema],
    default: [],
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

// Index composé pour éviter les doublons de nom par serveur
teamSchema.index({ guildId: 1, name: 1 }, { unique: true });

// Méthode pour mettre à jour updatedAt avant sauvegarde
teamSchema.pre("save", function (next) {
  this.updatedAt = Date.now();
  next();
});

export const Team = mongoose.model("Team", teamSchema);

