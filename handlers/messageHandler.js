import { Logger } from "../utils/logger.js";
import { RandomResponseHandler } from "./randomResponseHandler.js";
import { ImageModerationHandler } from "./imageModerationHandler.js";
import { promises as fs } from "fs";

const WATCHED_USERS_PATH = "./config/watchedUsers.json";

async function addWatchedUser(userId) {
  const users = await getWatchedUsers();
  if (!users.includes(userId)) {
    users.push(userId);
    await fs.writeFile(WATCHED_USERS_PATH, JSON.stringify(users, null, 2));
    return true;
  }
  return false;
}

async function removeWatchedUser(userId) {
  let users = await getWatchedUsers();
  if (users.includes(userId)) {
    users = users.filter((id) => id !== userId);
    await fs.writeFile(WATCHED_USERS_PATH, JSON.stringify(users, null, 2));
    return true;
  }
  return false;
}

async function getWatchedUsers() {
  try {
    const data = await fs.readFile(WATCHED_USERS_PATH, "utf-8");
    return JSON.parse(data);
  } catch (e) {
    return [];
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
        await message.reply(`L'utilisateur ${userId} est déjà surveillé.`);
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
        await message.reply(`L'utilisateur ${userId} n'était pas surveillé.`);
      }
      return;
    }

    // Gestion des réponses aléatoires
    await this.randomResponseHandler.handleMessage(message);

    // Gestion de la modération des images
    await this.imageModerationHandler.handleMessage(message);
  }
}
