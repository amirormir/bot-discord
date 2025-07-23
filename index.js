import { DiscordBot } from "./services/discordBot.js";
import { Logger } from "./utils/logger.js";

// Gestion des signaux pour arrêt propre
process.on("SIGINT", async () => {
  Logger.info("Arrêt du bot...");
  await bot.stop();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  Logger.info("Arrêt du bot...");
  await bot.stop();
  process.exit(0);
});

// Gestion des erreurs non capturées
process.on("unhandledRejection", (reason, promise) => {
  Logger.error(`Promesse rejetée non gérée: ${reason}`);
});

process.on("uncaughtException", (error) => {
  Logger.error(`Exception non capturée: ${error.message}`);
  process.exit(1);
});

// Démarrage du bot
const bot = new DiscordBot();

Logger.info("Démarrage du bot Discord...");
bot.start().catch((error) => {
  Logger.error(`Erreur fatale: ${error.message}`);
  process.exit(1);
});
