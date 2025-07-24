import { Logger } from "../utils/logger.js";
import { ImageDetector } from "../utils/imageDetector.js";
import { REPLACEMENT_GIF, MESSAGE_DELETE_DELAY } from "../config/config.js";
import { WatchedUser } from "../models/WatchedUser.js";

function parseDiscordId(input) {
  return input.replace(/<@!?([0-9]+)>/, "$1").trim();
}

async function isWatchedUser(userId) {
  const cleanId = parseDiscordId(userId);
  Logger.info(
    `[DEBUG] Recherche en base pour userId: '${userId}' (nettoyé: '${cleanId}')`
  );
  const user = await WatchedUser.findOne({ userId: cleanId });
  Logger.info(`[DEBUG] Résultat de la recherche:`, user);
  Logger.info(
    `[MODERATION] Vérification watched user pour ${cleanId} : ${
      user ? "OUI" : "NON"
    }`
  );
  return !!user;
}

export class ImageModerationHandler {
  async handleMessage(message) {
    Logger.info(
      `[MODERATION] Analyse du message de ${message.author.tag} (${message.author.id})`
    );
    const watched = await isWatchedUser(message.author.id);
    if (!watched) {
      Logger.info(`[MODERATION] Utilisateur NON surveillé, aucune action.`);
      return;
    }

    Logger.user(`Utilisateur surveillé détecté : ${message.author.tag}`);

    const hasImage = ImageDetector.detectImage(message);
    Logger.info(
      `[MODERATION] Présence d'image/GIF dans le message : ${
        hasImage ? "OUI" : "NON"
      }`
    );

    if (hasImage) {
      Logger.info(`[MODERATION] Tentative de suppression du message...`);
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
