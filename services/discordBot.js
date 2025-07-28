import { Client, GatewayIntentBits } from "discord.js";
import { Logger } from "../utils/logger.js";
import { CONFIG } from "../config/config.js";
import { MessageHandler } from "../handlers/messageHandler.js";
import { MessageTemplateHandler } from "../handlers/messageTemplateHandler.js";

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
    this.messageTemplateHandler = new MessageTemplateHandler();
    this.setupEventHandlers();
  }

  setupEventHandlers() {
    this.client.on("ready", this.onReady.bind(this));
    this.client.on("messageCreate", this.onMessageCreate.bind(this));
    this.client.on("interactionCreate", this.onInteractionCreate.bind(this));
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

  async onInteractionCreate(interaction) {
    try {
      if (interaction.isStringSelectMenu()) {
        if (interaction.customId === "channel_selector") {
          await this.messageTemplateHandler.handleChannelSelector(interaction);
        }
        if (interaction.customId === "final_channel_selector") {
          await this.messageTemplateHandler.handleFinalChannelSelector(
            interaction
          );
        }
        if (interaction.customId.startsWith("role_selection_")) {
          await this.messageHandler.customGameHandler.handleRoleSelection(
            interaction
          );
        }
        if (interaction.customId.startsWith("cost_selection_")) {
          await this.messageHandler.customGameHandler.handleCostSelection(
            interaction
          );
        }
      }
      if (interaction.isButton()) {
        if (interaction.customId === "join_queue") {
          await this.messageHandler.customGameHandler.joinQueue(interaction);
        }
        if (interaction.customId === "leave_queue") {
          await this.messageHandler.customGameHandler.leaveQueue(interaction);
        }
        if (
          interaction.customId === "team1_win" ||
          interaction.customId === "team2_win"
        ) {
          await this.messageHandler.customGameHandler.handleGameResult(
            interaction
          );
        }
        if (interaction.customId === "cancel_game") {
          await interaction.reply({
            content: "❌ Partie annulée.",
            ephemeral: true,
          });
          this.messageHandler.customGameHandler.currentGameResult = null;
        }
        // Gestion des boutons de pagination du classement
        if (interaction.customId.startsWith("leaderboard_")) {
          await this.messageHandler.customGameHandler.handleLeaderboardNavigation(
            interaction
          );
        }
      }
    } catch (error) {
      Logger.error(`Erreur interaction: ${error.message}`);
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
