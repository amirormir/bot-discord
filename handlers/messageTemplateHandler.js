import { Logger } from "../utils/logger.js";
import { MessageTemplate } from "../models/MessageTemplate.js";
import {
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
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
      return await MessageTemplate.findOne({ name });
    } catch (error) {
      Logger.error(`[TEMPLATE] Erreur récupération template: ${error.message}`);
      return null;
    }
  }

  createChannelSelector(templates) {
    const select = new StringSelectMenuBuilder()
      .setCustomId("channel_selector")
      .setPlaceholder("Choisissez un channel pour envoyer le message")
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
