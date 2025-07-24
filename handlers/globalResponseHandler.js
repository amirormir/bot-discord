import { Logger } from "../utils/logger.js";
import { AdcTrigger } from "../models/AdcTrigger.js";
import { BazouzouTrigger } from "../models/BazouzouTrigger.js";

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
    // Utilisateurs bénis définis directement dans le code
    this.blessedUsers = [
      "277825453580877824",
      "700466241265205368",
      "451379187031343104",
      "276060004262477825",
      "432610292342587392",
      "472911936951156740",
      "684773505157431347",
      "589065324834324500",
      "338222603829510164",
      "550737379460382752",
      "204255221017214977",
      "1397555801542889564",
    ];
  }

  isBlessedUser(userId) {
    return this.blessedUsers.includes(userId);
  }

  isCommand(message) {
    return message.content.startsWith("!");
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

  async getBazouzouConfig() {
    let config = await BazouzouTrigger.findOne();
    if (!config) {
      config = await BazouzouTrigger.create({
        triggers: [
          "8=D",
          "8==D",
          "8===D",
          "8>D",
          "8=D~",
          "8=D💦",
          "8====D",
          "8=====D",
          "8======D",
          "8=====D~",
          "8====D💦",
          "8====D~",
          "8========D",
          "8=========D",
          "8===========D",
          "8============D💦",
          "8=========D~~",
          "8=========D🍑",
          "8==D~",
          "8=)D",
          "8==D🍌",
          "(8====D)",
          "[8====D]",
          "/8===D\\",
          "8==D👉👌",
          "8=D ¿",
          "8=3D",
          "8==D⛓️",
          "8===D🐍",
          "8===D🔥",
          "8===D😳",
          "8===D🚀",
          "8===D💀",
        ],
        responses: ["force", "ptit zizi"],
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

  async getRandomBazouzouResponse() {
    const config = await this.getBazouzouConfig();
    return config.responses[
      Math.floor(Math.random() * config.responses.length)
    ];
  }

  async handleMessage(message) {
    // Ne pas compter les commandes dans le compteur global
    if (this.isCommand(message)) {
      return;
    }

    // Vérifier si l'utilisateur est bénit
    const isBlessed = this.isBlessedUser(message.author.id);
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

    // Réponse Bazouzou (seulement pour les bazouzou "petits")
    const bazouzouConfig = await this.getBazouzouConfig();
    const smallBazouzou = [
      "8=D",
      "8==D",
      "8===D",
      "8>D",
      "8=D~",
      "8=D💦",
      "8==D~",
      "8=)D",
      "8==D🍌",
      "8=D ¿",
      "8=3D",
    ];

    const hasSmallBazouzou = smallBazouzou.some((trigger) =>
      message.content.includes(trigger)
    );

    if (hasSmallBazouzou) {
      const bazouzouResponse = await this.getRandomBazouzouResponse();
      Logger.info(
        `[BAZOUZOU] Bazouzou petit détecté, réponse: "${bazouzouResponse}"`
      );
      try {
        await message.reply(`${message.content} ${bazouzouResponse}`);
      } catch (err) {
        Logger.error(`[BAZOUZOU] Erreur réponse Bazouzou: ${err.message}`);
      }
    }
  }
}
