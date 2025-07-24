import { Logger } from "../utils/logger.js";
import { ImageDetector } from "../utils/imageDetector.js";
import { REPLACEMENT_GIF, MESSAGE_DELETE_DELAY } from "../config/config.js";
import { WatchedUser } from "../models/WatchedUser.js";

function parseDiscordId(input) {
  return input.replace(/<@!?([0-9]+)>/, "$1").trim();
}

async function isWatchedUser(userId) {
  const cleanId = parseDiscordId(userId);
  const user = await WatchedUser.findOne({ userId: cleanId });
  Logger.info(
    `[MODERATION] Utilisateur ${cleanId} surveillé: ${user ? "OUI" : "NON"}`
  );
  return !!user;
}

export class ImageModerationHandler {
  async handleMessage(message) {
    const watched = await isWatchedUser(message.author.id);
    if (!watched) {
      return;
    }

    Logger.user(`Utilisateur surveillé détecté : ${message.author.tag}`);

    const hasImage = ImageDetector.detectImage(message);
    Logger.info(`[MODERATION] Image/GIF détectée: ${hasImage ? "OUI" : "NON"}`);

    if (hasImage) {
      Logger.info(`[MODERATION] Suppression du message...`);
      await this.handleImageMessage(message);
    } else {
      Logger.success("Aucune image/GIF détectée, message conservé");
    }
  }

  async handleImageMessage(message) {
    try {
      Logger.delete("Suppression du message contenant une image/GIF");
      await message.delete();
      Logger.info(`[MODERATION] Message supprimé avec succès.`);

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
        `[MODERATION] Erreur lors de la suppression/remplacement: ${err.message}`
      );
    }
  }
}
