import { Logger } from "../utils/logger.js";
import { AdcTrigger } from "../models/AdcTrigger.js";
import { BazouzouTrigger } from "../models/BazouzouTrigger.js";

export class GlobalResponseHandler {
  constructor(adminHandler = null) {
    this.adminHandler = adminHandler;
    this.globalResponses = [
      "pas lu",
      "après qui ta demandé",
      "bodycount ?",
      "qui lui dit ?",
      "@https://tenor.com/fr/view/benzema-karim-benzema-arrete-arrête-arrete-arrete-arrete-gif-5404649638740761265",
    ];
    this.ratioResponses = [
      "ratio",
      "pleure",
      "a quoi bon tout ces mots si tu prends perpet",
      "y que fue",
      "va la bas p diddy",
    ];
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

  shouldRespondGlobally() {
    // Vérifier si les réponses globales sont pausées
    if (this.adminHandler && this.adminHandler.isGlobalResponsesPaused()) {
      return false;
    }

    // 5% de chance de répondre à chaque message
    return Math.random() < 0.05;
  }

  shouldRespondWithRatio() {
    // 20% de chance que la réponse globale soit un ratio (donc 1% de chance totale)
    return Math.random() < 0.2;
  }

  getRandomGlobalResponse() {
    return this.globalResponses[
      Math.floor(Math.random() * this.globalResponses.length)
    ];
  }

  getRandomRatioResponse() {
    return this.ratioResponses[
      Math.floor(Math.random() * this.ratioResponses.length)
    ];
  }

  async timeoutUser(message, duration = 60) {
    try {
      const member = message.member;
      if (!member) {
        Logger.error(
          `[GLOBAL] Impossible de timeout l'utilisateur: membre non trouvé`
        );
        return false;
      }

      await member.timeout(
        duration * 1000,
        "Ratio - Réponse automatique du bot"
      );
      Logger.info(
        `[GLOBAL] Utilisateur ${message.author.username} (${message.author.id}) timeout pour ${duration} secondes`
      );
      return true;
    } catch (error) {
      Logger.error(`[GLOBAL] Erreur timeout utilisateur: ${error.message}`);
      return false;
    }
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
    if (this.isCommand(message)) {
      return;
    }

    const isBlessed = this.isBlessedUser(message.author.id);
    if (!isBlessed) {
      // Réponse globale avec 5% de chance
      if (this.shouldRespondGlobally()) {
        let response;
        let isRatio = false;

        // 20% de chance que ce soit un ratio (1% de chance totale)
        if (this.shouldRespondWithRatio()) {
          response = this.getRandomRatioResponse();
          isRatio = true;
          Logger.info(`[GLOBAL] Réponse ratio: "${response}"`);
        } else {
          response = this.getRandomGlobalResponse();
          Logger.info(`[GLOBAL] Réponse globale: "${response}"`);
        }

        try {
          await message.reply(response);

          // Si c'est un ratio, timeout l'utilisateur
          if (isRatio) {
            const timeoutSuccess = await this.timeoutUser(message, 60);
            if (timeoutSuccess) {
              Logger.info(`[GLOBAL] Timeout appliqué après ratio`);
            }
          }
        } catch (err) {
          Logger.error(`[GLOBAL] Erreur réponse globale: ${err.message}`);
        }
      }
    }

    // Vérifier les réponses ADC
    const adcConfig = await this.getAdcConfig();
    if (message.author.id === adcConfig.userId) {
      const adcTriggers = adcConfig.triggers;
      const hasAdcTrigger = adcTriggers.some((trigger) =>
        message.content.toLowerCase().includes(trigger.toLowerCase())
      );

      if (hasAdcTrigger) {
        const adcResponse = await this.getRandomAdcResponse();
        Logger.info(`[ADC] Trigger ADC détecté, réponse: "${adcResponse}"`);
        try {
          await message.reply(adcResponse);
        } catch (err) {
          Logger.error(`[ADC] Erreur réponse ADC: ${err.message}`);
        }
      }
    }

    // Vérifier les réponses bazouzou
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
