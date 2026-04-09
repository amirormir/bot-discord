import { Logger } from "../utils/logger.js";
import { ReactionRole } from "../models/ReactionRole.js";
import { EmbedBuilder } from "discord.js";

export class ReactionRoleHandler {
  async handleMessage(message) {
    if (message.content === "!rr setup") {
      await this.startSetup(message);
      return true;
    }
    if (message.content === "!rr list") {
      await this.listReactionRoles(message);
      return true;
    }
    if (message.content.startsWith("!rr add ")) {
      await this.addReactionToExisting(message);
      return true;
    }
    if (message.content.startsWith("!rr remove ")) {
      await this.removeReactionFromExisting(message);
      return true;
    }
    if (message.content.startsWith("!rr delete ")) {
      await this.deleteReactionRole(message);
      return true;
    }
    return false;
  }

  // ─── Interactive Setup ───────────────────────────────────────────────

  async startSetup(message) {
    const userId = message.author.id;
    const filter = (m) => m.author.id === userId;

    const askStep = async (embed) => {
      await message.channel.send({ embeds: [embed] });
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
        new EmbedBuilder()
          .setTitle("⚙️ Configuration Reaction Roles")
          .setDescription(
            "Mentionnez le **channel** où le message sera envoyé.\n\nExemple: `#roles`"
          )
          .setColor("#3498db")
          .setFooter({ text: "Tapez 'cancel' pour annuler • Timeout: 60s" })
      );
      if (!channelMsg || channelMsg === "cancel") {
        await message.channel.send(
          channelMsg === "cancel"
            ? "❌ Configuration annulée."
            : "⏰ Timeout — configuration annulée."
        );
        return;
      }

      const targetChannel = channelMsg.mentions.channels.first();
      if (!targetChannel) {
        await message.channel.send(
          "❌ Channel invalide. Configuration annulée."
        );
        return;
      }

      // Step 2: Title
      const titleMsg = await askStep(
        new EmbedBuilder()
          .setDescription(
            "Entrez le **titre** du message.\n(ou `skip` pour ignorer)"
          )
          .setColor("#3498db")
          .setFooter({ text: "Timeout: 60s" })
      );
      if (!titleMsg || titleMsg === "cancel") {
        await message.channel.send(
          titleMsg === "cancel"
            ? "❌ Configuration annulée."
            : "⏰ Timeout — configuration annulée."
        );
        return;
      }
      const title =
        titleMsg.content.toLowerCase() === "skip" ? null : titleMsg.content;

      // Step 3: Description
      const descMsg = await askStep(
        new EmbedBuilder()
          .setDescription("Entrez la **description** du message.")
          .setColor("#3498db")
          .setFooter({ text: "Timeout: 60s" })
      );
      if (!descMsg || descMsg === "cancel") {
        await message.channel.send(
          descMsg === "cancel"
            ? "❌ Configuration annulée."
            : "⏰ Timeout — configuration annulée."
        );
        return;
      }
      const description = descMsg.content;

      // Step 4: Emoji-role pairs
      const reactions = [];

      await message.channel.send({
        embeds: [
          new EmbedBuilder()
            .setDescription(
              "Ajoutez les paires **emoji → rôle**.\n\n" +
                "Format : `<emoji> @role`\n" +
                "Exemple : `🎮 @Gamer`\n\n" +
                "Tapez `done` quand vous avez terminé."
            )
            .setColor("#3498db")
            .setFooter({ text: "Timeout: 120s par réaction" }),
        ],
      });

      let addingReactions = true;
      while (addingReactions) {
        const collected = await message.channel.awaitMessages({
          filter,
          max: 1,
          time: 120000,
        });

        if (collected.size === 0) {
          await message.channel.send("⏰ Timeout — configuration annulée.");
          return;
        }

        const reactionMsg = collected.first();

        if (reactionMsg.content.toLowerCase() === "cancel") {
          await message.channel.send("❌ Configuration annulée.");
          return;
        }

        if (reactionMsg.content.toLowerCase() === "done") {
          if (reactions.length === 0) {
            await message.channel.send(
              "❌ Ajoutez au moins une réaction avant de terminer."
            );
            continue;
          }
          addingReactions = false;
          continue;
        }

        // Parse role mention
        const role = reactionMsg.mentions.roles.first();
        if (!role) {
          await message.channel.send(
            "❌ Mentionnez un rôle valide. Format : `<emoji> @role`"
          );
          continue;
        }

        // Extract emoji (everything before the role mention)
        const emojiPart = reactionMsg.content.split("<@&")[0].trim();
        const customEmojiMatch = emojiPart.match(/<a?:\w+:\d+>/);
        const emoji = customEmojiMatch ? customEmojiMatch[0] : emojiPart;

        if (!emoji) {
          await message.channel.send("❌ Emoji invalide. Réessayez.");
          continue;
        }

        reactions.push({ emoji, roleId: role.id, roleName: role.name });
        await message.channel.send(
          `✅ ${emoji} → **${role.name}** ajouté ! (${reactions.length} paire(s))\nContinuez ou tapez \`done\`.`
        );
      }

      // Step 5: Build embed and send
      const reactionListText = reactions
        .map((r) => `${r.emoji} → <@&${r.roleId}>`)
        .join("\n");

      const rrEmbed = new EmbedBuilder()
        .setDescription(`${description}\n\n${reactionListText}`)
        .setColor("#2ecc71")
        .setFooter({ text: "Réagissez pour obtenir le rôle correspondant" });

      if (title) rrEmbed.setTitle(title);

      const sentMessage = await targetChannel.send({ embeds: [rrEmbed] });

      // Add reactions to the message
      for (const reaction of reactions) {
        const customMatch = reaction.emoji.match(/<a?:\w+:(\d+)>/);
        await sentMessage.react(customMatch ? customMatch[1] : reaction.emoji);
      }

      // Save to database
      await ReactionRole.create({
        guildId: message.guild.id,
        channelId: targetChannel.id,
        messageId: sentMessage.id,
        reactions,
        title: title || "Reaction Roles",
        createdBy: message.author.id,
      });

      await message.channel.send({
        embeds: [
          new EmbedBuilder()
            .setTitle("✅ Reaction Roles configuré !")
            .setDescription(
              `Message envoyé dans ${targetChannel}\n` +
                `ID : \`${sentMessage.id}\`\n` +
                `${reactions.length} réaction(s) configurée(s).`
            )
            .setColor("#2ecc71"),
        ],
      });
    } catch (error) {
      Logger.error(`[REACTION_ROLE] Erreur setup: ${error.message}`);
      await message.channel.send("❌ Erreur lors de la configuration.");
    }
  }

  // ─── Add reaction to existing message ────────────────────────────────

  async addReactionToExisting(message) {
    // Format: !rr add <messageId> <emoji> @role
    const args = message.content.replace("!rr add ", "").trim();
    const parts = args.split(/\s+/);

    if (parts.length < 2 || !message.mentions.roles.first()) {
      await message.reply(
        "Usage : `!rr add <messageId> <emoji> @role`"
      );
      return;
    }

    const messageId = parts[0];
    const role = message.mentions.roles.first();

    // Extract emoji (between messageId and role mention)
    const afterId = args.substring(messageId.length).trim();
    const emojiPart = afterId.split("<@&")[0].trim();
    const customMatch = emojiPart.match(/<a?:\w+:\d+>/);
    const emoji = customMatch ? customMatch[0] : emojiPart;

    if (!emoji) {
      await message.reply("❌ Emoji invalide.");
      return;
    }

    try {
      const config = await ReactionRole.findOne({ messageId });
      if (!config) {
        await message.reply(
          "❌ Aucune config trouvée pour ce message."
        );
        return;
      }

      // Check if emoji already exists
      const exists = config.reactions.some((r) => r.emoji === emoji);
      if (exists) {
        await message.reply("❌ Cet emoji est déjà configuré sur ce message.");
        return;
      }

      // Add reaction to DB
      config.reactions.push({ emoji, roleId: role.id, roleName: role.name });
      await config.save();

      // Add reaction to Discord message
      const channel = message.guild.channels.cache.get(config.channelId);
      if (channel) {
        const targetMsg = await channel.messages.fetch(messageId);
        const customId = emoji.match(/<a?:\w+:(\d+)>/);
        await targetMsg.react(customId ? customId[1] : emoji);

        // Update embed
        await this.updateReactionRoleEmbed(targetMsg, config);
      }

      await message.reply(
        `✅ ${emoji} → **${role.name}** ajouté au message \`${messageId}\`.`
      );
    } catch (error) {
      Logger.error(`[REACTION_ROLE] Erreur add: ${error.message}`);
      await message.reply("❌ Erreur lors de l'ajout.");
    }
  }

  // ─── Remove reaction from existing message ──────────────────────────

  async removeReactionFromExisting(message) {
    // Format: !rr remove <messageId> <emoji>
    const args = message.content.replace("!rr remove ", "").trim();
    const parts = args.split(/\s+/);

    if (parts.length < 2) {
      await message.reply("Usage : `!rr remove <messageId> <emoji>`");
      return;
    }

    const messageId = parts[0];
    const emoji = parts.slice(1).join(" ").trim();

    try {
      const config = await ReactionRole.findOne({ messageId });
      if (!config) {
        await message.reply(
          "❌ Aucune config trouvée pour ce message."
        );
        return;
      }

      const reactionIndex = config.reactions.findIndex((r) => r.emoji === emoji);
      if (reactionIndex === -1) {
        await message.reply("❌ Cet emoji n'est pas configuré sur ce message.");
        return;
      }

      const removed = config.reactions.splice(reactionIndex, 1)[0];
      await config.save();

      // Remove reaction from Discord message
      const channel = message.guild.channels.cache.get(config.channelId);
      if (channel) {
        try {
          const targetMsg = await channel.messages.fetch(messageId);
          const customId = emoji.match(/<a?:\w+:(\d+)>/);
          const emojiKey = customId ? customId[1] : emoji;
          const messageReaction = targetMsg.reactions.cache.find(
            (r) => (r.emoji.id && emoji.includes(r.emoji.id)) || r.emoji.name === emoji
          );
          if (messageReaction) await messageReaction.remove();

          // Update embed
          await this.updateReactionRoleEmbed(targetMsg, config);
        } catch (e) {
          Logger.warn(`[REACTION_ROLE] Impossible de retirer la réaction du message: ${e.message}`);
        }
      }

      await message.reply(
        `✅ ${emoji} → **${removed.roleName}** retiré du message \`${messageId}\`.`
      );
    } catch (error) {
      Logger.error(`[REACTION_ROLE] Erreur remove: ${error.message}`);
      await message.reply("❌ Erreur lors de la suppression.");
    }
  }

  // ─── Update embed after add/remove ──────────────────────────────────

  async updateReactionRoleEmbed(discordMessage, config) {
    if (config.reactions.length === 0) return;

    const reactionListText = config.reactions
      .map((r) => `${r.emoji} → <@&${r.roleId}>`)
      .join("\n");

    const oldEmbed = discordMessage.embeds[0];
    const descriptionBase = oldEmbed?.description?.split("\n\n")[0] || "";

    const updatedEmbed = new EmbedBuilder()
      .setDescription(`${descriptionBase}\n\n${reactionListText}`)
      .setColor("#2ecc71")
      .setFooter({ text: "Réagissez pour obtenir le rôle correspondant" });

    if (config.title) updatedEmbed.setTitle(config.title);

    await discordMessage.edit({ embeds: [updatedEmbed] });
  }

  // ─── List all reaction roles ────────────────────────────────────────

  async listReactionRoles(message) {
    try {
      const configs = await ReactionRole.find({
        guildId: message.guild.id,
      }).sort({ createdAt: -1 });

      if (configs.length === 0) {
        await message.reply("Aucun reaction role configuré sur ce serveur.");
        return;
      }

      const embed = new EmbedBuilder()
        .setTitle("📋 Reaction Roles configurés")
        .setColor("#3498db");

      for (const config of configs) {
        const reactionList = config.reactions
          .map((r) => `${r.emoji} → ${r.roleName}`)
          .join(", ");

        embed.addFields({
          name: `${config.title || "Sans titre"} — <#${config.channelId}>`,
          value: `ID : \`${config.messageId}\`\n${reactionList}`,
          inline: false,
        });
      }

      await message.reply({ embeds: [embed] });
    } catch (error) {
      Logger.error(`[REACTION_ROLE] Erreur list: ${error.message}`);
      await message.reply("❌ Erreur lors de la récupération.");
    }
  }

  // ─── Delete a reaction role config ──────────────────────────────────

  async deleteReactionRole(message) {
    const messageId = message.content.replace("!rr delete ", "").trim();
    if (!messageId) {
      await message.reply("Usage : `!rr delete <messageId>`");
      return;
    }

    try {
      const config = await ReactionRole.findOne({ messageId });
      if (!config) {
        await message.reply(
          "❌ Aucune config trouvée pour ce message."
        );
        return;
      }

      // Try to delete the Discord message
      try {
        const channel = message.guild.channels.cache.get(config.channelId);
        if (channel) {
          const targetMsg = await channel.messages.fetch(messageId);
          await targetMsg.delete();
        }
      } catch (e) {
        Logger.warn(
          `[REACTION_ROLE] Impossible de supprimer le message Discord: ${e.message}`
        );
      }

      await ReactionRole.deleteOne({ messageId });
      await message.reply(
        `✅ Reaction role \`${messageId}\` supprimé.`
      );
    } catch (error) {
      Logger.error(`[REACTION_ROLE] Erreur delete: ${error.message}`);
      await message.reply("❌ Erreur lors de la suppression.");
    }
  }

  // ─── Runtime: Reaction Add ──────────────────────────────────────────

  async handleReactionAdd(reaction, user) {
    if (reaction.partial) {
      try {
        await reaction.fetch();
      } catch (error) {
        Logger.error(
          `[REACTION_ROLE] Erreur fetch reaction: ${error.message}`
        );
        return;
      }
    }

    if (user.bot) return;

    const config = await ReactionRole.findOne({
      messageId: reaction.message.id,
    });
    if (!config) return;

    // Match emoji
    const reactionConfig = config.reactions.find((r) => {
      if (reaction.emoji.id) {
        return r.emoji.includes(reaction.emoji.id);
      }
      return r.emoji === reaction.emoji.name;
    });

    if (!reactionConfig) return;

    try {
      const guild = reaction.message.guild;
      const member = await guild.members.fetch(user.id);
      await member.roles.add(reactionConfig.roleId);
      Logger.info(
        `[REACTION_ROLE] +${reactionConfig.roleName} → ${user.tag}`
      );
    } catch (error) {
      Logger.error(`[REACTION_ROLE] Erreur ajout rôle: ${error.message}`);
    }
  }

  // ─── Runtime: Reaction Remove ───────────────────────────────────────

  async handleReactionRemove(reaction, user) {
    if (reaction.partial) {
      try {
        await reaction.fetch();
      } catch (error) {
        Logger.error(
          `[REACTION_ROLE] Erreur fetch reaction: ${error.message}`
        );
        return;
      }
    }

    if (user.bot) return;

    const config = await ReactionRole.findOne({
      messageId: reaction.message.id,
    });
    if (!config) return;

    // Match emoji
    const reactionConfig = config.reactions.find((r) => {
      if (reaction.emoji.id) {
        return r.emoji.includes(reaction.emoji.id);
      }
      return r.emoji === reaction.emoji.name;
    });

    if (!reactionConfig) return;

    try {
      const guild = reaction.message.guild;
      const member = await guild.members.fetch(user.id);
      await member.roles.remove(reactionConfig.roleId);
      Logger.info(
        `[REACTION_ROLE] -${reactionConfig.roleName} → ${user.tag}`
      );
    } catch (error) {
      Logger.error(`[REACTION_ROLE] Erreur retrait rôle: ${error.message}`);
    }
  }
}
