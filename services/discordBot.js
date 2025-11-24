import {
  Client,
  GatewayIntentBits,
  SlashCommandBuilder,
  Routes,
  REST,
} from "discord.js";
import { Logger } from "../utils/logger.js";
import { CONFIG } from "../config/config.js";
import { MessageHandler } from "../handlers/messageHandler.js";
import { MessageTemplateHandler } from "../handlers/messageTemplateHandler.js";
import { RichPresenceService } from "./richPresence.js";
import { TeamCommandHandler } from "../handlers/teamCommandHandler.js";

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
    this.richPresence = new RichPresenceService();
    this.teamCommandHandler = new TeamCommandHandler();
    this.setupEventHandlers();
  }

  setupEventHandlers() {
    this.client.on("ready", this.onReady.bind(this));
    this.client.on("messageCreate", this.onMessageCreate.bind(this));
    this.client.on("interactionCreate", this.onInteractionCreate.bind(this));
  }

  async onReady() {
    Logger.bot(`Connecté en tant que ${this.client.user.tag}`);
    // Enregistrer les commandes slash une fois le bot prêt
    await this.registerSlashCommands();
  }

  /**
   * Enregistre les commandes slash
   */
  async registerSlashCommands() {
    try {
      const commands = [
        new SlashCommandBuilder()
          .setName("team")
          .setDescription("Gestion des teams")
          .addSubcommand((subcommand) =>
            subcommand
              .setName("create")
              .setDescription("Crée une nouvelle team")
              .addStringOption((option) =>
                option
                  .setName("name")
                  .setDescription("Nom de la team")
                  .setRequired(true)
                  .setMaxLength(50)
              )
              .addStringOption((option) =>
                option
                  .setName("tag")
                  .setDescription("Tag optionnel de la team")
                  .setRequired(false)
                  .setMaxLength(10)
              )
          )
          .addSubcommand((subcommand) =>
            subcommand
              .setName("add-player")
              .setDescription("Ajoute un joueur à une team")
              .addStringOption((option) =>
                option
                  .setName("team")
                  .setDescription("Nom ou ID de la team")
                  .setRequired(true)
                  .setAutocomplete(false)
              )
              .addUserOption((option) =>
                option
                  .setName("user")
                  .setDescription("Utilisateur Discord à ajouter")
                  .setRequired(true)
              )
              .addStringOption((option) =>
                option
                  .setName("pseudo")
                  .setDescription("Pseudo du joueur dans la team")
                  .setRequired(true)
                  .setMaxLength(50)
              )
          ),
      ].map((command) => command.toJSON());

      const rest = new REST({ version: "10" }).setToken(CONFIG.DISCORD_TOKEN);

      Logger.info(
        `[DISCORD_BOT] Enregistrement de ${commands.length} commande(s) slash...`
      );

      // Enregistrer les commandes globalement (peut prendre jusqu'à 1 heure pour se propager)
      // Pour un déploiement plus rapide, utilisez Routes.guildCommands() avec un guildId spécifique
      const data = await rest.put(
        Routes.applicationCommands(this.client.user.id),
        { body: commands }
      );

      Logger.success(
        `[DISCORD_BOT] ${data.length} commande(s) slash enregistrée(s) avec succès`
      );
    } catch (error) {
      Logger.error(
        `[DISCORD_BOT] Erreur lors de l'enregistrement des commandes slash: ${error.message}`
      );
    }
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
      // Gestion des commandes slash
      if (interaction.isChatInputCommand()) {
        if (interaction.commandName === "team") {
          const subcommand = interaction.options.getSubcommand();

          if (subcommand === "create") {
            await this.teamCommandHandler.handleCreate(interaction);
            return;
          }

          if (subcommand === "add-player") {
            await this.teamCommandHandler.handleAddPlayer(interaction);
            return;
          }
        }
      }

      // Gestion des select menus
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

      // Gestion des boutons
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

      // Initialiser le Rich Presence
      await this.richPresence.initialize();
    } catch (error) {
      Logger.error(`Erreur lors du démarrage du bot: ${error.message}`);
      process.exit(1);
    }
  }

  async stop() {
    try {
      // Détruire le Rich Presence
      await this.richPresence.destroy();

      // Déconnecter le client Discord
      await this.client.destroy();
      Logger.success("Bot Discord arrêté avec succès");
    } catch (error) {
      Logger.error(`Erreur lors de l'arrêt du bot: ${error.message}`);
    }
  }

  // Méthodes pour mettre à jour le Rich Presence
  updateRichPresenceForQueue(playerCount = 0, maxPlayers = 10) {
    this.richPresence.updateGameStatus("Queue 5v5", playerCount, maxPlayers);
  }

  updateRichPresenceForGame() {
    this.richPresence.updateGameStatus("Partie 5v5", 10, 10);
  }

  updateRichPresenceForIdle() {
    this.richPresence.updatePresence();
  }

  clearRichPresence() {
    this.richPresence.clearPresence();
  }
}
