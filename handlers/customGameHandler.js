import { Logger } from "../utils/logger.js";
import { Player } from "../models/Player.js";
import { Queue } from "../models/Queue.js";
import { TeamBuilder } from "../utils/teamBuilder.js";
import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  StringSelectMenuBuilder,
  ButtonStyle,
} from "discord.js";

export class CustomGameHandler {
  constructor() {
    this.currentQueue = null;
    this.roleSelectionTimeouts = new Map();
    this.costSelectionTimeouts = new Map();
  }

  async getOrCreateQueue() {
    let queue = await Queue.findOne({ isActive: true });
    if (!queue) {
      queue = await Queue.create({ isActive: true });
    }
    return queue;
  }

  async startCustomGame(message) {
    try {
      // Vérifier si une queue est déjà active
      const existingQueue = await Queue.findOne({ isActive: true });
      if (existingQueue) {
        await message.reply(
          "❌ Une queue 5v5 est déjà active ! Utilisez `!custom stop` pour l'arrêter."
        );
        return;
      }

      // Créer une nouvelle queue
      const queue = await Queue.create({ isActive: true });
      this.currentQueue = queue;

      // Créer l'embed de la queue
      const embed = new EmbedBuilder()
        .setTitle("🎮 Queue 5v5 Custom")
        .setDescription("Rejoignez la queue pour participer à une partie 5v5 !")
        .addFields(
          { name: "Joueurs", value: "0/10", inline: true },
          { name: "Statut", value: "En attente", inline: true },
          { name: "Phase", value: "Recrutement", inline: true }
        )
        .setColor("#00ff00")
        .setTimestamp();

      // Créer le bouton pour rejoindre
      const joinButton = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("join_queue")
          .setLabel("Rejoindre la Queue")
          .setStyle(ButtonStyle.Primary)
          .setEmoji("🎮")
      );

      await message.reply({
        embeds: [embed],
        components: [joinButton],
      });

      Logger.info(`[CUSTOM_GAME] Queue 5v5 démarrée par ${message.author.tag}`);
    } catch (error) {
      Logger.error(`[CUSTOM_GAME] Erreur démarrage queue: ${error.message}`);
      await message.reply("❌ Erreur lors du démarrage de la queue.");
    }
  }

  async joinQueue(interaction) {
    try {
      const queue = await this.getOrCreateQueue();
      const playerCount = await Player.countDocuments({ queueId: queue._id });

      if (playerCount >= 10) {
        await interaction.reply({
          content: "❌ La queue est pleine !",
          ephemeral: true,
        });
        return;
      }

      // Vérifier si le joueur est déjà dans la queue
      const existingPlayer = await Player.findOne({
        userId: interaction.user.id,
        queueId: queue._id,
      });

      if (existingPlayer) {
        await interaction.reply({
          content: "❌ Vous êtes déjà dans la queue !",
          ephemeral: true,
        });
        return;
      }

      // Ajouter le joueur à la queue (sans selectedRole et selectedCost pour l'instant)
      await Player.create({
        userId: interaction.user.id,
        username: interaction.user.username,
        queueId: queue._id,
      });

      await interaction.reply({
        content: "✅ Vous avez rejoint la queue !",
        ephemeral: true,
      });

      // Vérifier si la queue est pleine
      const newPlayerCount = await Player.countDocuments({
        queueId: queue._id,
      });
      if (newPlayerCount === 10) {
        await this.startRoleSelection(interaction.channel, queue);
      } else {
        await this.updateQueueEmbed(interaction.channel, queue);
      }
    } catch (error) {
      Logger.error(`[CUSTOM_GAME] Erreur join queue: ${error.message}`);
      await interaction.reply({
        content: "❌ Erreur lors de la rejointe de la queue.",
        ephemeral: true,
      });
    }
  }

  async startRoleSelection(channel, queue) {
    try {
      // Mettre à jour la phase
      queue.currentPhase = "role_selection";
      await queue.save();

      const players = await Player.find({ queueId: queue._id });

      // Créer l'embed de sélection de rôle
      const embed = new EmbedBuilder()
        .setTitle("🎭 Sélection des Rôles")
        .setDescription("Chaque joueur doit choisir son rôle préféré.")
        .addFields(
          { name: "Joueurs", value: `${players.length}/10`, inline: true },
          { name: "Phase", value: "Sélection des rôles", inline: true },
          { name: "Temps", value: "60 secondes", inline: true }
        )
        .setColor("#ffaa00")
        .setTimestamp();

      // Créer le sélecteur de rôle
      const roleSelect = new StringSelectMenuBuilder()
        .setCustomId("role_selection")
        .setPlaceholder("Choisissez votre rôle")
        .addOptions([
          { label: "Top", value: "Top", description: "Top Lane" },
          { label: "Jungle", value: "Jungle", description: "Jungle" },
          { label: "Mid", value: "Mid", description: "Mid Lane" },
          { label: "ADC", value: "ADC", description: "ADC" },
          { label: "Support", value: "Support", description: "Support" },
          { label: "Fill", value: "Fill", description: "Rôle flexible" },
        ]);

      const row = new ActionRowBuilder().addComponents(roleSelect);

      await channel.send({
        content: `<@${players
          .map((p) => p.userId)
          .join("> <@")}> Sélectionnez vos rôles !`,
        embeds: [embed],
        components: [row],
      });

      // Démarrer le timer pour la sélection de rôle
      setTimeout(() => this.handleRoleSelectionTimeout(channel, queue), 60000);
    } catch (error) {
      Logger.error(`[CUSTOM_GAME] Erreur sélection rôle: ${error.message}`);
    }
  }

  async handleRoleSelection(interaction) {
    try {
      const role = interaction.values[0];
      const queue = await this.getOrCreateQueue();

      // Mettre à jour le rôle du joueur
      await Player.findOneAndUpdate(
        { userId: interaction.user.id, queueId: queue._id },
        { selectedRole: role }
      );

      await interaction.reply({
        content: `✅ Rôle sélectionné : **${role}**`,
        ephemeral: true,
      });

      // Vérifier si tous les joueurs ont sélectionné leur rôle
      const players = await Player.find({ queueId: queue._id });
      const playersWithRole = players.filter((p) => p.selectedRole);

      if (playersWithRole.length === 10) {
        await this.startCostSelection(interaction.channel, queue);
      }
    } catch (error) {
      Logger.error(`[CUSTOM_GAME] Erreur sélection rôle: ${error.message}`);
      await interaction.reply({
        content: "❌ Erreur lors de la sélection du rôle.",
        ephemeral: true,
      });
    }
  }

  async startCostSelection(channel, queue) {
    try {
      queue.currentPhase = "cost_selection";
      await queue.save();

      const players = await Player.find({ queueId: queue._id });

      const embed = new EmbedBuilder()
        .setTitle("📊 Sélection du Niveau (Cost)")
        .setDescription("Attribuez un cost de 1 à 5 représentant votre niveau.")
        .addFields(
          { name: "1", value: "Débutant", inline: true },
          { name: "2", value: "Intermédiaire", inline: true },
          { name: "3", value: "Bon", inline: true },
          { name: "4", value: "Très bon", inline: true },
          { name: "5", value: "Excellent", inline: true }
        )
        .setColor("#ffaa00")
        .setTimestamp();

      const costSelect = new StringSelectMenuBuilder()
        .setCustomId("cost_selection")
        .setPlaceholder("Choisissez votre cost (1-5)")
        .addOptions([
          { label: "Cost 1 - Débutant", value: "1" },
          { label: "Cost 2 - Intermédiaire", value: "2" },
          { label: "Cost 3 - Bon", value: "3" },
          { label: "Cost 4 - Très bon", value: "4" },
          { label: "Cost 5 - Excellent", value: "5" },
        ]);

      const row = new ActionRowBuilder().addComponents(costSelect);

      await channel.send({
        content: `<@${players
          .map((p) => p.userId)
          .join("> <@")}> Sélectionnez vos costs !`,
        embeds: [embed],
        components: [row],
      });

      setTimeout(() => this.handleCostSelectionTimeout(channel, queue), 60000);
    } catch (error) {
      Logger.error(`[CUSTOM_GAME] Erreur sélection cost: ${error.message}`);
    }
  }

  async handleCostSelection(interaction) {
    try {
      const cost = parseInt(interaction.values[0]);
      const queue = await this.getOrCreateQueue();

      await Player.findOneAndUpdate(
        { userId: interaction.user.id, queueId: queue._id },
        { selectedCost: cost }
      );

      await interaction.reply({
        content: `✅ Cost sélectionné : **${cost}**`,
        ephemeral: true,
      });

      const players = await Player.find({ queueId: queue._id });
      const playersWithCost = players.filter((p) => p.selectedCost);

      if (playersWithCost.length === 10) {
        await this.buildTeams(interaction.channel, queue);
      }
    } catch (error) {
      Logger.error(`[CUSTOM_GAME] Erreur sélection cost: ${error.message}`);
      await interaction.reply({
        content: "❌ Erreur lors de la sélection du cost.",
        ephemeral: true,
      });
    }
  }

  async buildTeams(channel, queue) {
    try {
      queue.currentPhase = "team_building";
      await queue.save();

      const players = await Player.find({ queueId: queue._id });
      const result = TeamBuilder.buildTeams(players);

      if (!result) {
        await channel.send(
          "❌ Impossible de créer des équipes équilibrées. Réessayez avec `!custom reroll`."
        );
        return;
      }

      // Sauvegarder les équipes
      for (const player of result.team1) {
        await Player.findOneAndUpdate(
          { userId: player.userId, queueId: queue._id },
          { assignedRole: player.assignedRole, teamId: player.teamId }
        );
      }

      for (const player of result.team2) {
        await Player.findOneAndUpdate(
          { userId: player.userId, queueId: queue._id },
          { assignedRole: player.assignedRole, teamId: player.teamId }
        );
      }

      await this.displayTeams(channel, result, queue);
    } catch (error) {
      Logger.error(
        `[CUSTOM_GAME] Erreur construction équipes: ${error.message}`
      );
    }
  }

  async displayTeams(channel, result, queue) {
    const team1Embed = new EmbedBuilder()
      .setTitle("🔵 Équipe 1")
      .setColor("#0066ff")
      .addFields(
        result.team1.map((player) => ({
          name: player.assignedRole,
          value: `<@${player.userId}> (Cost: ${player.selectedCost})`,
          inline: true,
        }))
      )
      .setFooter({ text: `Cost moyen: ${result.team1Cost.toFixed(2)}` });

    const team2Embed = new EmbedBuilder()
      .setTitle("🔴 Équipe 2")
      .setColor("#ff0000")
      .addFields(
        result.team2.map((player) => ({
          name: player.assignedRole,
          value: `<@${player.userId}> (Cost: ${player.selectedCost})`,
          inline: true,
        }))
      )
      .setFooter({ text: `Cost moyen: ${result.team2Cost.toFixed(2)}` });

    const summaryEmbed = new EmbedBuilder()
      .setTitle("🎮 Équipes Créées !")
      .setDescription(`Écart de cost: **${result.costDifference.toFixed(2)}**`)
      .setColor("#00ff00")
      .setTimestamp();

    await channel.send({
      content: `<@${result.team1
        .map((p) => p.userId)
        .join("> <@")}> <@${result.team2.map((p) => p.userId).join("> <@")}>`,
      embeds: [summaryEmbed, team1Embed, team2Embed],
    });

    queue.currentPhase = "completed";
    await queue.save();
  }

  async stopCustomGame(message) {
    try {
      await Queue.updateMany({ isActive: true }, { isActive: false });
      await Player.deleteMany({});

      this.currentQueue = null;
      this.roleSelectionTimeouts.clear();
      this.costSelectionTimeouts.clear();

      await message.reply("✅ Queue 5v5 arrêtée et vidée.");
      Logger.info(`[CUSTOM_GAME] Queue arrêtée par ${message.author.tag}`);
    } catch (error) {
      Logger.error(`[CUSTOM_GAME] Erreur arrêt queue: ${error.message}`);
      await message.reply("❌ Erreur lors de l'arrêt de la queue.");
    }
  }

  async resetCustomGame(message) {
    try {
      await Player.deleteMany({});
      const queue = await this.getOrCreateQueue();
      queue.currentPhase = "waiting";
      await queue.save();

      await message.reply("✅ Queue vidée et remise à zéro.");
      Logger.info(`[CUSTOM_GAME] Queue reset par ${message.author.tag}`);
    } catch (error) {
      Logger.error(`[CUSTOM_GAME] Erreur reset queue: ${error.message}`);
      await message.reply("❌ Erreur lors du reset de la queue.");
    }
  }

  async rerollTeams(message) {
    try {
      const queue = await this.getOrCreateQueue();
      const players = await Player.find({ queueId: queue._id });

      if (players.length !== 10) {
        await message.reply(
          "❌ Il faut exactement 10 joueurs pour refaire les équipes."
        );
        return;
      }

      await this.buildTeams(message.channel, queue);
      Logger.info(`[CUSTOM_GAME] Reroll équipes par ${message.author.tag}`);
    } catch (error) {
      Logger.error(`[CUSTOM_GAME] Erreur reroll: ${error.message}`);
      await message.reply("❌ Erreur lors du reroll des équipes.");
    }
  }

  async updateQueueEmbed(channel, queue) {
    // Cette méthode mettrait à jour l'embed de la queue
    // Implémentation simplifiée pour l'exemple
  }

  async handleRoleSelectionTimeout(channel, queue) {
    // Gérer le timeout de sélection de rôle
    Logger.info(`[CUSTOM_GAME] Timeout sélection rôle`);
  }

  async handleCostSelectionTimeout(channel, queue) {
    // Gérer le timeout de sélection de cost
    Logger.info(`[CUSTOM_GAME] Timeout sélection cost`);
  }
}
