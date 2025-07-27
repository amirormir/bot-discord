import { Logger } from "../utils/logger.js";
import { MessageTemplate } from "../models/MessageTemplate.js";
import {
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ChannelType,
} from "discord.js";

export class MessageTemplateHandler {
  async createTemplate(name, content, userId) {
    try {
      const existing = await MessageTemplate.findOne({ name });
      if (existing) {
        return { success: false, error: "Un template avec ce nom existe déjà" };
      }

      await MessageTemplate.create({
        name,
        content,
        createdBy: userId,
      });

      return { success: true };
    } catch (error) {
      Logger.error(`[TEMPLATE] Erreur création template: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  async listTemplates() {
    try {
      const templates = await MessageTemplate.find().sort({ createdAt: -1 });
      Logger.info(
        `[TEMPLATE] Nombre de templates dans la DB: ${templates.length}`
      );
      templates.forEach((t) => {
        Logger.info(`[TEMPLATE] Template DB: "${t.name}"`);
      });
      return templates;
    } catch (error) {
      Logger.error(`[TEMPLATE] Erreur liste templates: ${error.message}`);
      return [];
    }
  }

  async deleteTemplate(name) {
    try {
      const result = await MessageTemplate.deleteOne({ name });
      return result.deletedCount > 0;
    } catch (error) {
      Logger.error(`[TEMPLATE] Erreur suppression template: ${error.message}`);
      return false;
    }
  }

  async getTemplate(name) {
    try {
      Logger.info(`[TEMPLATE] Recherche du template: "${name}"`);
      const template = await MessageTemplate.findOne({ name });
      Logger.info(`[TEMPLATE] Template trouvé: ${template ? "OUI" : "NON"}`);
      if (template) {
        Logger.info(
          `[TEMPLATE] Template: ${template.name} - Contenu: ${template.content}`
        );
      }
      return template;
    } catch (error) {
      Logger.error(`[TEMPLATE] Erreur récupération template: ${error.message}`);
      return null;
    }
  }

  createChannelSelector(templates) {
    const select = new StringSelectMenuBuilder()
      .setCustomId("channel_selector")
      .setPlaceholder("Choisissez un template à envoyer")
      .addOptions(
        templates.map((template) =>
          new StringSelectMenuOptionBuilder()
            .setLabel(template.name)
            .setDescription(
              template.content.substring(0, 50) +
                (template.content.length > 50 ? "..." : "")
            )
            .setValue(template.name)
        )
      );

    return new ActionRowBuilder().addComponents(select);
  }

  createFinalChannelSelector(templateName, channels) {
    const select = new StringSelectMenuBuilder()
      .setCustomId("final_channel_selector")
      .setPlaceholder("Choisissez un channel pour envoyer le message")
      .addOptions(
        channels.map((channel) => {
          // Nettoyer le nom du channel pour éviter les caractères problématiques
          const cleanName = channel.name
            .replace(/[^\w\s-]/g, "")
            .substring(0, 100);
          return new StringSelectMenuOptionBuilder()
            .setLabel(cleanName || channel.name.substring(0, 100))
            .setDescription(`#${channel.name}`)
            .setValue(channel.id.toString()); // S'assurer que c'est une string
        })
      );

    return new ActionRowBuilder().addComponents(select);
  }

  async handleChannelSelector(interaction) {
    try {
      Logger.info(`[TEMPLATE] Début handleChannelSelector`);
      const selectedTemplateName = interaction.values[0];
      Logger.info(`[TEMPLATE] Template sélectionné: ${selectedTemplateName}`);

      const template = await this.getTemplate(selectedTemplateName);

      if (!template) {
        await interaction.reply({
          content: "❌ Template non trouvé.",
          flags: 64, // Ephemeral flag
        });
        return;
      }

      Logger.info(`[TEMPLATE] Template trouvé: ${template.name}`);
      Logger.info(
        `[TEMPLATE] Nombre total de channels: ${interaction.guild.channels.cache.size}`
      );

      // Récupérer tous les channels textuels du serveur
      const channels = interaction.guild.channels.cache
        .filter((channel) => {
          // Vérification plus robuste pour les channels textuels
          return channel.type === ChannelType.GuildText || channel.type === 0;
        })
        .map((channel) => ({ id: channel.id, name: channel.name }))
        .sort((a, b) => a.name.localeCompare(b.name));

      Logger.info(`[TEMPLATE] Channels textuels trouvés: ${channels.length}`);

      if (channels.length === 0) {
        await interaction.reply({
          content: "❌ Aucun channel textuel trouvé sur ce serveur.",
          flags: 64, // Ephemeral flag
        });
        return;
      }

      const row = this.createFinalChannelSelector(
        selectedTemplateName,
        channels
      );

      await interaction.update({
        content: `Template sélectionné : **${template.name}**\n\nContenu : ${template.content}\n\nChoisissez le channel de destination :`,
        components: [row],
      });
    } catch (error) {
      Logger.error(`[TEMPLATE] Erreur handleChannelSelector: ${error.message}`);
      Logger.error(`[TEMPLATE] Stack trace: ${error.stack}`);
      await interaction.reply({
        content: "❌ Erreur lors de la sélection du template.",
        flags: 64, // Ephemeral flag
      });
    }
  }

  async handleFinalChannelSelector(interaction) {
    try {
      const selectedChannelId = interaction.values[0];
      const channel = interaction.guild.channels.cache.get(selectedChannelId);

      if (!channel) {
        await interaction.reply({
          content: "❌ Channel non trouvé.",
          flags: 64, // Ephemeral flag
        });
        return;
      }

      // Récupérer le nom du template depuis le message précédent
      const messageContent = interaction.message.content;
      const templateNameMatch = messageContent.match(
        /Template sélectionné : \*\*(.*?)\*\*/
      );

      if (!templateNameMatch) {
        await interaction.reply({
          content: "❌ Impossible de récupérer le template.",
          flags: 64, // Ephemeral flag
        });
        return;
      }

      const templateName = templateNameMatch[1];
      const template = await this.getTemplate(templateName);

      if (!template) {
        await interaction.reply({
          content: "❌ Template non trouvé.",
          flags: 64, // Ephemeral flag
        });
        return;
      }

      // Envoyer le message dans le channel sélectionné
      await channel.send(template.content);

      await interaction.update({
        content: `✅ Message envoyé dans ${channel} !`,
        components: [],
      });
    } catch (error) {
      Logger.error(
        `[TEMPLATE] Erreur handleFinalChannelSelector: ${error.message}`
      );
      await interaction.reply({
        content: "❌ Erreur lors de l'envoi du message.",
        flags: 64, // Ephemeral flag
      });
    }
  }

  async handleMessage(message) {
    // Commande pour créer un template
    if (message.content.startsWith("!createtemplate ")) {
      const parts = message.content.split(" ");
      if (parts.length < 3) {
        await message.reply(
          "Usage : !createtemplate <nom> <contenu du message>"
        );
        return;
      }

      const name = parts[1];
      const content = parts.slice(2).join(" ");

      const result = await this.createTemplate(
        name,
        content,
        message.author.id
      );
      if (result.success) {
        await message.reply(`✅ Template "${name}" créé avec succès !`);
      } else {
        await message.reply(`❌ Erreur : ${result.error}`);
      }
      return;
    }

    // Commande pour lister les templates
    if (message.content === "!listtemplates") {
      const templates = await this.listTemplates();
      if (templates.length === 0) {
        await message.reply("Aucun template disponible.");
        return;
      }

      const templateList = templates
        .map(
          (t) =>
            `**${t.name}** : ${t.content.substring(0, 100)}${
              t.content.length > 100 ? "..." : ""
            }`
        )
        .join("\n\n");

      await message.reply(`**Templates disponibles :**\n\n${templateList}`);
      return;
    }

    // Commande pour supprimer un template
    if (message.content.startsWith("!deletetemplate ")) {
      const name = message.content.split(" ")[1];
      if (!name) {
        await message.reply("Usage : !deletetemplate <nom>");
        return;
      }

      const deleted = await this.deleteTemplate(name);
      if (deleted) {
        await message.reply(`✅ Template "${name}" supprimé !`);
      } else {
        await message.reply(`❌ Template "${name}" non trouvé.`);
      }
      return;
    }

    // Commande pour envoyer un message via sélecteur
    if (message.content === "!sendmessage") {
      const templates = await this.listTemplates();
      Logger.info(
        `[TEMPLATE] Templates disponibles pour le menu: ${templates.length}`
      );
      templates.forEach((t) => {
        Logger.info(`[TEMPLATE] Template menu: "${t.name}"`);
      });

      if (templates.length === 0) {
        await message.reply(
          "Aucun template disponible. Créez-en un avec !createtemplate"
        );
        return;
      }

      const row = this.createChannelSelector(templates);
      await message.reply({
        content: "Choisissez le template à envoyer :",
        components: [row],
      });
      return;
    }
  }
}
