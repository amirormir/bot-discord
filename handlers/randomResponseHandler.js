import { Logger } from "../utils/logger.js";
import { RANDOM_RESPONSE_USER, RANDOM_RESPONSES } from "../config/config.js";

export class RandomResponseHandler {
  constructor() {
    this.messageCounter = 0;
  }

  shouldRespond() {
    return this.messageCounter >= 2 && Math.random() < 0.5;
  }

  getRandomResponse() {
    return RANDOM_RESPONSES[
      Math.floor(Math.random() * RANDOM_RESPONSES.length)
    ];
  }

  async handleMessage(message) {
    if (message.author.id !== RANDOM_RESPONSE_USER) {
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
        this.messageCounter = 0; // Reset du compteur après réponse
      } catch (err) {
        Logger.error(
          `Erreur lors de l'envoi de la réponse aléatoire: ${err.message}`
        );
      }
    }
  }
}
