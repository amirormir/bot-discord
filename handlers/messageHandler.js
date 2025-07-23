import { Logger } from "../utils/logger.js";
import { RandomResponseHandler } from "./randomResponseHandler.js";
import { ImageModerationHandler } from "./imageModerationHandler.js";

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

    // Gestion des réponses aléatoires
    await this.randomResponseHandler.handleMessage(message);

    // Gestion de la modération des images
    await this.imageModerationHandler.handleMessage(message);
  }
}
