import { Logger } from "../utils/logger.js";
import { RandomResponseHandler } from "./randomResponseHandler.js";
import { ImageModerationHandler } from "./imageModerationHandler.js";
import { WatchedUser } from "../models/WatchedUser.js";

async function addWatchedUser(userId) {
  try {
    const existing = await WatchedUser.findOne({ userId });
    if (existing) return false;
    await WatchedUser.create({ userId });
    return true;
  } catch (e) {
    return false;
  }
}

async function removeWatchedUser(userId) {
  try {
    const res = await WatchedUser.deleteOne({ userId });
    return res.deletedCount > 0;
  } catch (e) {
    return false;
  }
}

export class MessageHandler {
  constructor() {
    this.randomResponseHandler = new RandomResponseHandler();
    this.imageModerationHandler = new ImageModerationHandler();
  }

  async handleMessage(message) {
    Logger.user(
      `Nouveau message de ${message.author.tag} (${message.author.id}) : ${message.content}`
    );

    if (message.author.bot) {
      return;
    }

    // Commandes de gestion des utilisateurs surveillés
    if (message.content.startsWith("!addwatch ")) {
      const userId = message.content.split(" ")[1];
      if (!userId) {
        await message.reply("Usage : !addwatch <userId>");
        return;
      }
      const added = await addWatchedUser(userId);
      if (added) {
        await message.reply(`Utilisateur surveillé ajouté : ${userId}`);
      } else {
        await message.reply(
          `L'utilisateur ${userId} est déjà surveillé ou une erreur est survenue.`
        );
      }
      return;
    }
    if (message.content.startsWith("!removewatch ")) {
      const userId = message.content.split(" ")[1];
      if (!userId) {
        await message.reply("Usage : !removewatch <userId>");
        return;
      }
      const removed = await removeWatchedUser(userId);
      if (removed) {
        await message.reply(
          `Utilisateur retiré de la surveillance : ${userId}`
        );
      } else {
        await message.reply(
          `L'utilisateur ${userId} n'était pas surveillé ou une erreur est survenue.`
        );
      }
      return;
    }

    // Gestion des réponses aléatoires
    await this.randomResponseHandler.handleMessage(message);

    // Gestion de la modération des images
    await this.imageModerationHandler.handleMessage(message);
  }
}
