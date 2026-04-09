import { Logger } from "../utils/logger.js";
import { MessageTemplate } from "../models/MessageTemplate.js";
import {
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ChannelType,
  EmbedBuilder,
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

      // Recherche exacte d'abord
      let template = await MessageTemplate.findOne({ name });

      // Si pas trouvé, recherche avec nettoyage (sans retours à la ligne)
      if (!template) {
        const cleanName = name.trim();
        template = await MessageTemplate.findOne({
          name: {
            $regex: `^${cleanName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`,
          },
        });
      }

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
    try {
      Logger.info(
        `[TEMPLATE] Création du menu de sélection de channel avec ${channels.length} channels`
      );

      const options = [];
      for (let i = 0; i < channels.length && i < 25; i++) {
        // Discord limite à 25 options
        const channel = channels[i];
        const cleanName =
          channel.name.replace(/[^\w\s-]/g, "").substring(0, 100) ||
          channel.name.substring(0, 100);

        Logger.info(`[TEMPLATE] Ajout option: ${cleanName} (${channel.id})`);

        options.push(
          new StringSelectMenuOptionBuilder()
            .setLabel(cleanName)
            .setDescription(`#${channel.name}`)
            .setValue(channel.id)
        );
      }

      const select = new StringSelectMenuBuilder()
        .setCustomId("final_channel_selector")
        .setPlaceholder("Choisissez un channel pour envoyer le message")
        .addOptions(options);

      return new ActionRowBuilder().addComponents(select);
    } catch (error) {
      Logger.error(`[TEMPLATE] Erreur création menu channel: ${error.message}`);
      throw error;
    }
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

      // Tronquer le contenu pour éviter de dépasser la limite de 2000 caractères
      const maxContentLength = 1500; // Réserver de l'espace pour le reste du message
      const truncatedContent =
        template.content.length > maxContentLength
          ? template.content.substring(0, maxContentLength) + "..."
          : template.content;

      await interaction.update({
        content: `Template sélectionné : **${template.name}**\n\nContenu : ${truncatedContent}\n\nChoisissez le channel de destination :`,
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
      const interactionMessageContent = interaction.message.content;
      Logger.info(
        `[TEMPLATE] Contenu du message: "${interactionMessageContent}"`
      );

      // Méthode plus robuste pour extraire le nom du template
      let templateName = null;

      // Chercher le pattern "Template sélectionné : **nom**" de manière plus simple
      const startIndex = interactionMessageContent.indexOf(
        "Template sélectionné : **"
      );
      if (startIndex !== -1) {
        const start = startIndex + "Template sélectionné : **".length;
        const endIndex = interactionMessageContent.indexOf("**", start);
        if (endIndex !== -1) {
          templateName = interactionMessageContent
            .substring(start, endIndex)
            .trim();
          Logger.info(`[TEMPLATE] Template trouvé: "${templateName}"`);
        }
      }

      if (!templateName) {
        Logger.error(
          `[TEMPLATE] Impossible d'extraire le nom du template du contenu: "${interactionMessageContent}"`
        );
        await interaction.reply({
          content: "❌ Impossible de récupérer le template.",
          flags: 64, // Ephemeral flag
        });
        return;
      }

      const template = await this.getTemplate(templateName);

      if (!template) {
        await interaction.reply({
          content: "❌ Template non trouvé.",
          flags: 64, // Ephemeral flag
        });
        return;
      }

      // Envoyer le message dans le channel sélectionné
      await channel.send({
        content: template.content,
        allowedMentions: { parse: ["everyone", "roles", "users"] },
      });

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

      const name = parts[1].trim(); // Nettoyer le nom
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

    // Commande pour envoyer un message via sélecteur (ou direct: !sendmessage <nom> #channel)
    if (message.content.startsWith("!sendmessage")) {
      // Direct format: !sendmessage <templateName> #channel
      const targetChannel = message.mentions.channels.first();
      if (targetChannel) {
        const parts = message.content.replace("!sendmessage ", "").trim();
        const templateName = parts.split("<#")[0].trim();

        if (!templateName) {
          await message.reply(
            "Usage : `!sendmessage <nom> #channel` ou `!sendmessage` pour le sélecteur"
          );
          return;
        }

        const template = await this.getTemplate(templateName);
        if (!template) {
          await message.reply(`❌ Template "${templateName}" non trouvé.`);
          return;
        }

        let messageContent = template.content;
        if (messageContent.toLowerCase().includes("everyone")) {
          messageContent = "@everyone " + messageContent;
        }

        await targetChannel.send({
          content: messageContent,
          allowedMentions: { parse: ["everyone", "roles", "users"] },
        });
        await message.reply(`✅ Template **${templateName}** envoyé dans ${targetChannel} !`);
        return;
      }

      // Selector mode (original behavior)
      const templates = await this.listTemplates();
      if (templates.length === 0) {
        await message.reply(
          "Aucun template disponible. Créez-en un avec `!createtemplate`"
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

    // ─── Quick send: !msg #channel contenu ────────────────────────────
    if (message.content.startsWith("!msg ")) {
      const targetChannel = message.mentions.channels.first();
      if (!targetChannel) {
        await message.reply("Usage : `!msg #channel contenu du message`");
        return;
      }

      // Get content after the channel mention
      const content = message.content
        .replace(/^!msg\s+<#\d+>\s*/, "")
        .trim();

      if (!content) {
        await message.reply("❌ Veuillez fournir le contenu du message.");
        return;
      }

      await targetChannel.send({
        content,
        allowedMentions: { parse: ["everyone", "roles", "users"] },
      });
      await message.reply(`✅ Message envoyé dans ${targetChannel} !`);
      return;
    }

    // ─── Interactive Embed Builder: !embed ─────────────────────────────
    if (message.content === "!embed") {
      await this.handleEmbedBuilder(message);
      return;
    }
  }

  // ─── Interactive Embed Builder ──────────────────────────────────────

  async handleEmbedBuilder(message) {
    const userId = message.author.id;
    const filter = (m) => m.author.id === userId;

    const askStep = async (description) => {
      await message.channel.send({
        embeds: [
          new EmbedBuilder()
            .setDescription(description)
            .setColor("#e67e22")
            .setFooter({ text: "Tapez 'cancel' pour annuler • Timeout: 60s" }),
        ],
      });
      const collected = await message.channel.awaitMessages({
        filter,
        max: 1,
        time: 60000,
      });
      if (collected.size === 0) return null;
      const response = collected.first();
      if (response.content.toLowerCase() === "cancel") return "cancel";
      return response;
    };

    try {
      // Step 1: Target channel
      const channelMsg = await askStep(
        "📨 **Embed Builder**\n\nMentionnez le **channel** de destination.\nExemple : `#general`"
      );
      if (!channelMsg || channelMsg === "cancel") {
        await message.channel.send(
          channelMsg === "cancel"
            ? "❌ Annulé."
            : "⏰ Timeout."
        );
        return;
      }
      const targetChannel = channelMsg.mentions.channels.first();
      if (!targetChannel) {
        await message.channel.send("❌ Channel invalide. Annulé.");
        return;
      }

      // Step 2: Title
      const titleMsg = await askStep(
        "Entrez le **titre** de l'embed.\n(`skip` pour ignorer)"
      );
      if (!titleMsg || titleMsg === "cancel") {
        await message.channel.send(titleMsg === "cancel" ? "❌ Annulé." : "⏰ Timeout.");
        return;
      }
      const title =
        titleMsg.content.toLowerCase() === "skip" ? null : titleMsg.content;

      // Step 3: Description
      const descMsg = await askStep("Entrez la **description** de l'embed.");
      if (!descMsg || descMsg === "cancel") {
        await message.channel.send(descMsg === "cancel" ? "❌ Annulé." : "⏰ Timeout.");
        return;
      }
      const description = descMsg.content;

      // Step 4: Color
      const colorMsg = await askStep(
        "Entrez la **couleur** (hex).\nExemple : `#FF0000`\n(`skip` pour la couleur par défaut)"
      );
      if (!colorMsg || colorMsg === "cancel") {
        await message.channel.send(colorMsg === "cancel" ? "❌ Annulé." : "⏰ Timeout.");
        return;
      }
      let color = "#2ecc71";
      if (colorMsg.content.toLowerCase() !== "skip") {
        const hexMatch = colorMsg.content.match(/^#?([0-9a-fA-F]{6})$/);
        if (hexMatch) {
          color = `#${hexMatch[1]}`;
        }
      }

      // Step 5: Image
      const imageMsg = await askStep(
        "Entrez l'**URL de l'image**.\n(`skip` pour ignorer)"
      );
      if (!imageMsg || imageMsg === "cancel") {
        await message.channel.send(imageMsg === "cancel" ? "❌ Annulé." : "⏰ Timeout.");
        return;
      }
      const image =
        imageMsg.content.toLowerCase() === "skip" ? null : imageMsg.content;

      // Step 6: Footer
      const footerMsg = await askStep(
        "Entrez le **footer**.\n(`skip` pour ignorer)"
      );
      if (!footerMsg || footerMsg === "cancel") {
        await message.channel.send(footerMsg === "cancel" ? "❌ Annulé." : "⏰ Timeout.");
        return;
      }
      const footer =
        footerMsg.content.toLowerCase() === "skip" ? null : footerMsg.content;

      // Step 7: Text content above embed
      const contentMsg = await askStep(
        "Entrez le **texte** au-dessus de l'embed.\n(`skip` pour aucun texte)\nVous pouvez utiliser `@everyone` ou `@here`."
      );
      if (!contentMsg || contentMsg === "cancel") {
        await message.channel.send(contentMsg === "cancel" ? "❌ Annulé." : "⏰ Timeout.");
        return;
      }
      const textContent =
        contentMsg.content.toLowerCase() === "skip" ? null : contentMsg.content;

      // Build embed
      const embed = new EmbedBuilder().setDescription(description).setColor(color);
      if (title) embed.setTitle(title);
      if (image) embed.setImage(image);
      if (footer) embed.setFooter({ text: footer });

      // Preview
      await message.channel.send({
        content: "**Aperçu :**",
        embeds: [embed],
      });

      const confirmMsg = await askStep(
        "Envoyer ce message ? (`oui` / `non`)"
      );
      if (
        !confirmMsg ||
        confirmMsg === "cancel" ||
        confirmMsg.content.toLowerCase() !== "oui"
      ) {
        await message.channel.send("❌ Envoi annulé.");
        return;
      }

      // Send
      const sendOptions = { embeds: [embed] };
      if (textContent) {
        sendOptions.content = textContent;
        sendOptions.allowedMentions = {
          parse: ["everyone", "roles", "users"],
        };
      }

      await targetChannel.send(sendOptions);
      await message.channel.send(`✅ Embed envoyé dans ${targetChannel} !`);
    } catch (error) {
      Logger.error(`[TEMPLATE] Erreur embed builder: ${error.message}`);
      await message.channel.send("❌ Erreur lors de la création de l'embed.");
    }
  }
}
