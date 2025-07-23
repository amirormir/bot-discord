import { Client, GatewayIntentBits } from "discord.js";
import { Logger } from "../utils/logger.js";
import { CONFIG } from "../config/config.js";
import { MessageHandler } from "../handlers/messageHandler.js";

export class DiscordBot {
  constructor() {
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
      ],
    });

    this.messageHandler = new MessageHandler();
    this.setupEventHandlers();
  }

  setupEventHandlers() {
    this.client.on("ready", this.onReady.bind(this));
    this.client.on("messageCreate", this.onMessageCreate.bind(this));
  }

  onReady() {
    Logger.bot(`Connecté en tant que ${this.client.user.tag}`);
  }

  async onMessageCreate(message) {
    try {
      await this.messageHandler.handleMessage(message);
    } catch (error) {
      Logger.error(`Erreur lors du traitement du message: ${error.message}`);
    }
  }

  async start() {
    try {
      await this.client.login(CONFIG.DISCORD_TOKEN);
      Logger.success("Bot Discord démarré avec succès");
    } catch (error) {
      Logger.error(`Erreur lors du démarrage du bot: ${error.message}`);
      process.exit(1);
    }
  }

  async stop() {
    try {
      await this.client.destroy();
      Logger.info("Bot Discord arrêté");
    } catch (error) {
      Logger.error(`Erreur lors de l'arrêt du bot: ${error.message}`);
    }
  }
}
