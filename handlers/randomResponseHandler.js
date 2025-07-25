import { Logger } from "../utils/logger.js";
import { RandomResponseUser } from "../models/RandomResponseUser.js";
import { RANDOM_RESPONSES } from "../config/config.js";

export class RandomResponseHandler {
  constructor() {
    // Suppression du compteur, maintenant 5% de chance à chaque message
  }

  shouldRespond() {
    // 5% de chance de répondre à chaque message
    return Math.random() < 0.05;
  }

  getRandomResponse() {
    return RANDOM_RESPONSES[
      Math.floor(Math.random() * RANDOM_RESPONSES.length)
    ];
  }

  async getTargetUserId() {
    let config = await RandomResponseUser.findOne();
    if (!config) {
      config = await RandomResponseUser.create({
        userId: "277825453580877824",
      });
    }
    return config.userId;
  }

  async handleMessage(message) {
    const targetUserId = await this.getTargetUserId();
    if (message.author.id !== targetUserId) {
      return;
    }

    Logger.info(
      `[RANDOM] Message de l'utilisateur cible: ${message.author.tag}`
    );

    if (this.shouldRespond()) {
      const randomResponse = this.getRandomResponse();
      Logger.random(`Envoi d'une réponse aléatoire: "${randomResponse}"`);

      try {
        await message.reply(randomResponse);
        Logger.info("Réponse random envoyée avec succès");
      } catch (err) {
        Logger.error(
          `Erreur lors de l'envoi de la réponse aléatoire: ${err.message}`
        );
      }
    }
  }
}
