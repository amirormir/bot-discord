import { Logger } from "../utils/logger.js";
import { BlessedUser } from "../models/BlessedUser.js";
import { AdcTrigger } from "../models/AdcTrigger.js";

export class GlobalResponseHandler {
  constructor() {
    this.messageCounter = 0;
    this.globalResponses = [
      "pas lu",
      "après qui ta demandé",
      "bodycount ?",
      "qui lui dit ?",
      "@https://tenor.com/fr/view/benzema-karim-benzema-arrete-arrête-arrete-arrete-arrete-gif-5404649638740761265",
    ];
  }

  async isBlessedUser(userId) {
    const user = await BlessedUser.findOne({ userId });
    return !!user;
  }

  async getAdcConfig() {
    let config = await AdcTrigger.findOne();
    if (!config) {
      config = await AdcTrigger.create({
        userId: "324201004176375808",
        triggers: ["adc", "ADC", "AD", "ad", "AD carry", "Ad carry"],
        responses: [
          "ENCORE LA FAUTE DES ADC",
          "C'est jamais de la faute de la toplane GOAT",
          "tu veux que je te trouve la moyenne des morts de tout les adc du discord goat?",
          "oui oui , les adc oui",
        ],
      });
    }
    return config;
  }

  shouldRespondGlobally() {
    return this.messageCounter >= 5 && Math.random() < 0.3;
  }

  getRandomGlobalResponse() {
    return this.globalResponses[
      Math.floor(Math.random() * this.globalResponses.length)
    ];
  }

  async getRandomAdcResponse() {
    const config = await this.getAdcConfig();
    return config.responses[
      Math.floor(Math.random() * config.responses.length)
    ];
  }

  async handleMessage(message) {
    // Vérifier si l'utilisateur est bénit
    const isBlessed = await this.isBlessedUser(message.author.id);
    if (!isBlessed) {
      this.messageCounter++;
      Logger.info(`[GLOBAL] Compteur global: ${this.messageCounter}`);
    }

    // Réponse globale tous les 5-6 messages
    if (this.shouldRespondGlobally()) {
      const response = this.getRandomGlobalResponse();
      Logger.info(`[GLOBAL] Réponse globale: "${response}"`);
      try {
        await message.reply(response);
        this.messageCounter = 0;
      } catch (err) {
        Logger.error(`[GLOBAL] Erreur réponse globale: ${err.message}`);
      }
    }

    // Réponse ADC
    const adcConfig = await this.getAdcConfig();
    if (message.author.id === adcConfig.userId) {
      const hasAdcTrigger = adcConfig.triggers.some((trigger) =>
        message.content.toLowerCase().includes(trigger.toLowerCase())
      );

      if (hasAdcTrigger) {
        const adcResponse = await this.getRandomAdcResponse();
        Logger.info(`[ADC] Réponse ADC: "${adcResponse}"`);
        try {
          await message.reply(adcResponse);
        } catch (err) {
          Logger.error(`[ADC] Erreur réponse ADC: ${err.message}`);
        }
      }
    }
  }
}
