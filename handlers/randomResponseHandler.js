import { Logger } from "../utils/logger.js";
import { RandomResponseUser } from "../models/RandomResponseUser.js";
import { RANDOM_RESPONSES } from "../config/config.js";

export class RandomResponseHandler {
  constructor() {
    this.messageCounter = 0;
  }

  shouldRespond() {
    return this.messageCounter >= 3 && Math.random() < 0.5;
  }

  getRandomResponse() {
    return RANDOM_RESPONSES[
      Math.floor(Math.random() * RANDOM_RESPONSES.length)
    ];
  }

  async getTargetUserId() {
    let config = await RandomResponseUser.findOne();
    if (!config) {
      // Si aucun user n'est en base, on en crée un par défaut
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

    this.messageCounter++;
    Logger.counter(
      `Compteur de messages pour ${message.author.tag}: ${this.messageCounter}`
    );

    if (this.shouldRespond()) {
      const randomResponse = this.getRandomResponse();
      Logger.random(`Envoi d'une réponse aléatoire: "${randomResponse}"`);

      try {
        await message.reply(randomResponse);
        Logger.info("Réponse random envoyée, compteur reset à 0");
        this.messageCounter = 0; // Reset du compteur après réponse
      } catch (err) {
        Logger.error(
          `Erreur lors de l'envoi de la réponse aléatoire: ${err.message}`
        );
      }
    }
  }
}
