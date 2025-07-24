import { Logger } from "../utils/logger.js";
import { ImageDetector } from "../utils/imageDetector.js";
import { promises as fs } from "fs";
import { REPLACEMENT_GIF, MESSAGE_DELETE_DELAY } from "../config/config.js";

const WATCHED_USERS_PATH = "./config/watchedUsers.json";

async function getWatchedUsers() {
  try {
    const data = await fs.readFile(WATCHED_USERS_PATH, "utf-8");
    return JSON.parse(data);
  } catch (e) {
    return [];
  }
}

export class ImageModerationHandler {
  async handleMessage(message) {
    const WATCHED_USERS = await getWatchedUsers();
    if (!WATCHED_USERS.includes(message.author.id)) {
      return;
    }

    Logger.user(`Utilisateur surveillé détecté : ${message.author.tag}`);

    const hasImage = ImageDetector.detectImage(message);

    if (hasImage) {
      await this.handleImageMessage(message);
    } else {
      Logger.success("Aucune image/GIF détectée, message conservé");
    }
  }

  async handleImageMessage(message) {
    try {
      Logger.delete("Suppression du message contenant une image/GIF");
      await message.delete();

      Logger.replace("Envoi du message de remplacement");
      const replacementMessage = await message.channel.send({
        content: `${REPLACEMENT_GIF}\n\n**crois le**`,
      });

      // Supprimer le message de remplacement après délai
      setTimeout(async () => {
        try {
          await replacementMessage.delete();
          Logger.timer("Message de remplacement supprimé après 5 secondes");
        } catch (err) {
          Logger.error(
            `Erreur lors de la suppression du message de remplacement: ${err.message}`
          );
        }
      }, MESSAGE_DELETE_DELAY);
    } catch (err) {
      Logger.error(
        `Erreur lors de la suppression/remplacement: ${err.message}`
      );
    }
  }
}
