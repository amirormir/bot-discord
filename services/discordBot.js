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
      await this.messageTemplateHandler.handleMessage(message);
    } catch (error) {
      Logger.error(`Erreur lors du traitement du message: ${error.message}`);
    }
  }

  async onInteractionCreate(interaction) {
    if (!interaction.isStringSelectMenu()) return;

    if (interaction.customId === "channel_selector") {
      try {
        const templateName = interaction.values[0];
        const template = await this.messageTemplateHandler.getTemplate(
          templateName
        );

        if (!template) {
          await interaction.reply({
            content: "❌ Template non trouvé.",
            ephemeral: true,
          });
          return;
        }

        // Créer le sélecteur de channel
        const channels = interaction.guild.channels.cache
          .filter((channel) => channel.type === 0) // 0 = GUILD_TEXT
          .map((channel) => ({
            label: channel.name,
            value: channel.id,
            description: `#${channel.name}`,
          }));

        const {
          ActionRowBuilder,
          StringSelectMenuBuilder,
          StringSelectMenuOptionBuilder,
        } = await import("discord.js");

        const channelSelect = new StringSelectMenuBuilder()
          .setCustomId("final_channel_selector")
          .setPlaceholder("Choisissez le channel de destination")
          .addOptions(
            channels
              .slice(0, 25)
              .map((channel) =>
                new StringSelectMenuOptionBuilder()
                  .setLabel(channel.label)
                  .setDescription(channel.description)
                  .setValue(channel.value)
              )
          );

        const row = new ActionRowBuilder().addComponents(channelSelect);

        await interaction.update({
          content: `Template sélectionné : **${template.name}**\nChoisissez maintenant le channel :`,
          components: [row],
        });
      } catch (error) {
        Logger.error(`Erreur sélection template: ${error.message}`);
        await interaction.reply({
          content: "❌ Erreur lors de la sélection.",
          ephemeral: true,
        });
      }
    }

    if (interaction.customId === "final_channel_selector") {
      try {
        const channelId = interaction.values[0];
        const channel = interaction.guild.channels.cache.get(channelId);

        if (!channel) {
          await interaction.reply({
            content: "❌ Channel non trouvé.",
            ephemeral: true,
          });
          return;
        }

        // Récupérer le template depuis le message précédent
        const templateName = interaction.message.content.match(
          /Template sélectionné : \*\*(.*?)\*\*/
        )?.[1];
        const template = await this.messageTemplateHandler.getTemplate(
          templateName
        );

        if (!template) {
          await interaction.reply({
            content: "❌ Template non trouvé.",
            ephemeral: true,
          });
          return;
        }

        // Envoyer le message avec @everyone
        await channel.send({
          content: `@everyone ${template.content}`,
        });

        await interaction.update({
          content: `✅ Message envoyé dans #${channel.name} !`,
          components: [],
        });
      } catch (error) {
        Logger.error(`Erreur envoi message: ${error.message}`);
        await interaction.reply({
          content: "❌ Erreur lors de l'envoi.",
          ephemeral: true,
        });
      }
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
