import { Logger } from "../utils/logger.js";
import { Player } from "../models/Player.js";
import { Queue } from "../models/Queue.js";
import { PlayerStats } from "../models/PlayerStats.js";
import { ActiveCustomGame } from "../models/ActiveCustomGame.js";
import { TeamBuilder } from "../utils/teamBuilder.js";
import { EloIntegration } from "../integration/eloIntegration.js";
import { RatingService } from "../services/ratingService.js";
import { tierColor, formatTier } from "../services/tiers.js";
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
    this.queueMessage = null; // Ajout de cette propriété
    this.currentGameResult = null; // Stocke le résultat de la partie en cours
    this.eloIntegration = new EloIntegration(); // Intégration du système rating
    this.ratingService = new RatingService();
  }

  _serializeActivePlayers(players) {
    return players.map((player) => ({
      userId: player.userId,
      username: player.username,
      selectedRole: player.selectedRole,
      assignedRole: player.assignedRole,
      selectedCost: player.selectedCost,
      rating: player.rating,
      rd: player.rd,
      volatility: player.volatility,
      tierLabel: player.tierLabel,
    }));
  }

  async syncActiveCustomGame(status, overrides = {}) {
    if (!this.currentGameResult) return;

    const payload = {
      key: "current",
      status,
      queueId: overrides.queueId ?? this.currentGameResult.queueId ?? null,
      team1: {
        players: this._serializeActivePlayers(this.currentGameResult.team1.players),
        averageCost: this.currentGameResult.team1.averageCost,
      },
      team2: {
        players: this._serializeActivePlayers(this.currentGameResult.team2.players),
        averageCost: this.currentGameResult.team2.averageCost,
      },
      costDifference: this.currentGameResult.costDifference,
      winner: overrides.winner ?? this.currentGameResult.winner ?? null,
      mvpUserId: overrides.mvpUserId ?? this.currentGameResult.mvpUserId ?? null,
      aceUserId: overrides.aceUserId ?? this.currentGameResult.aceUserId ?? null,
      sourceMatchId: overrides.sourceMatchId ?? null,
      startedAt: overrides.startedAt ?? this.currentGameResult.startedAt ?? new Date(),
      finalizedAt: overrides.finalizedAt ?? null,
      updatedAt: new Date(),
    };

    await ActiveCustomGame.findOneAndUpdate(
      { key: "current" },
      payload,
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  }

  async clearActiveCustomGame() {
    await ActiveCustomGame.deleteOne({ key: "current" });
  }

  _displayLabel(playerStats) {
    if (!playerStats) return "—";
    const score = this.ratingService.getDisplayScore(playerStats);
    const tier = this.ratingService.getTier(playerStats);
    if (tier.tier === "Placements") {
      return `Placements (${tier.placementsRemaining} restantes)`;
    }
    return `${tier.tier}${tier.subDivision ? " " + tier.subDivision : ""} (${score}/100)`;
  }

  /** True iff the member can act as referee (admin or "arbitre" role). */
  _isReferee(member) {
    if (!member) return false;
    if (member.permissions?.has?.("Administrator")) return true;
    return member.roles?.cache?.some?.(
      (role) => role.name.toLowerCase() === "arbitre"
    ) ?? false;
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
      await this.clearActiveCustomGame();
      const queue = await this.getOrCreateQueue();
      queue.isActive = true;
      queue.currentPhase = "waiting";
      await queue.save();

      await this.updateQueueEmbed(message.channel, queue);
      await message.reply("✅ Queue 5v5 démarrée !");

      // Mettre à jour le Rich Presence
      if (message.client.richPresence) {
        message.client.updateRichPresenceForQueue(0, 10);
      }

      Logger.info(`[CUSTOM_GAME] Queue 5v5 démarrée par ${message.author.tag}`);
    } catch (error) {
      Logger.error(`[CUSTOM_GAME] Erreur démarrage queue: ${error.message}`);
      await message.reply("❌ Erreur lors du démarrage de la queue.");
    }
  }

  async joinQueue(interaction) {
    try {
      const queue = await this.getOrCreateQueue();
      Logger.info(`[CUSTOM_GAME] Queue ID: ${queue._id}`);

      const playerCount = await Player.countDocuments({ queueId: queue._id });

      Logger.info(
        `[CUSTOM_GAME] Tentative de rejointe par ${interaction.user.tag} (${interaction.user.id})`
      );
      Logger.info(`[CUSTOM_GAME] Nombre actuel de joueurs: ${playerCount}`);

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
        Logger.info(
          `[CUSTOM_GAME] Joueur ${interaction.user.tag} déjà dans la queue`
        );
        await interaction.reply({
          content: "❌ Vous êtes déjà dans la queue !",
          ephemeral: true,
        });
        return;
      }

      // Récupérer ou créer les statistiques du joueur pour obtenir son Elo
      let playerStats = await PlayerStats.findOne({
        userId: interaction.user.id,
      });
      if (!playerStats) {
        const defaults = this.ratingService.defaultPlayerFields();
        playerStats = await PlayerStats.create({
          userId: interaction.user.id,
          username: interaction.user.username,
          ...defaults,
        });
      }

      // Créer le joueur avec des valeurs temporaires
      const newPlayer = await Player.create({
        userId: interaction.user.id,
        username: interaction.user.username,
        queueId: queue._id,
        selectedRole: null,
        selectedCost: null,
      });

      Logger.info(
        `[CUSTOM_GAME] Joueur ${interaction.user.tag} (${interaction.user.id}) créé avec ID: ${newPlayer._id}`
      );

      // Afficher le menu de sélection de rôle et cost
      await this.showRoleAndCostSelection(interaction, newPlayer);
    } catch (error) {
      Logger.error(`[CUSTOM_GAME] Erreur join queue: ${error.message}`);
      await interaction.reply({
        content: "❌ Erreur lors de la rejointe de la queue.",
        ephemeral: true,
      });
    }
  }

  async showRoleAndCostSelection(interaction, player) {
    try {
      const queue = await Queue.findById(player.queueId);
      const players = await Player.find({
        queueId: player.queueId,
        selectedRole: { $ne: null },
      });

      // Vérifier les locks de rôles
      const roleCounts = {
        Top: 0,
        Jungle: 0,
        Mid: 0,
        ADC: 0,
        Support: 0,
        Fill: 0,
      };

      players.forEach((p) => {
        if (p.selectedRole && roleCounts[p.selectedRole] !== undefined) {
          roleCounts[p.selectedRole]++;
        }
      });

      Logger.info(
        `[CUSTOM_GAME] Compteurs de rôles: ${JSON.stringify(roleCounts)}`
      );

      // Rôles disponibles (max 2 par rôle, sauf Fill qui n'a pas de limite)
      const availableRoles = [];
      const roleOptions = [
        { label: "Top", value: "Top", description: "Top Lane" },
        { label: "Jungle", value: "Jungle", description: "Jungle" },
        { label: "Mid", value: "Mid", description: "Mid Lane" },
        { label: "ADC", value: "ADC", description: "ADC" },
        { label: "Support", value: "Support", description: "Support" },
        { label: "Fill", value: "Fill", description: "Rôle flexible" },
      ];

      roleOptions.forEach((role) => {
        if (role.value === "Fill" || roleCounts[role.value] < 2) {
          availableRoles.push(role);
        } else {
          Logger.info(
            `[CUSTOM_GAME] Rôle ${role.value} locké (${
              roleCounts[role.value]
            }/2)`
          );
        }
      });

      const embed = new EmbedBuilder()
        .setTitle("🎭 Sélection Rôle et Niveau")
        .setDescription(
          `Bienvenue ${interaction.user.username} ! Choisissez votre rôle et votre niveau.`
        )
        .addFields(
          {
            name: "Rôle",
            value: "Choisissez votre rôle préféré",
            inline: true,
          },
          {
            name: "Niveau (1-5)",
            value: "1 = Débutant, 5 = Expert",
            inline: true,
          }
        )
        .setColor("#ffaa00")
        .setTimestamp();

      // Ajouter les rôles lockés dans l'embed
      const lockedRoles = roleOptions.filter(
        (role) => roleCounts[role.value] >= 2
      );
      if (lockedRoles.length > 0) {
        embed.addFields({
          name: "🔒 Rôles lockés",
          value: lockedRoles
            .map((role) => `${role.label} (${roleCounts[role.value]}/2)`)
            .join(", "),
          inline: false,
        });
      }

      // Créer le sélecteur de rôle avec seulement les rôles disponibles
      const roleSelect = new StringSelectMenuBuilder()
        .setCustomId(`role_selection_${player._id}`)
        .setPlaceholder("Choisissez votre rôle")
        .addOptions(availableRoles);

      // Créer le sélecteur de cost
      const costSelect = new StringSelectMenuBuilder()
        .setCustomId(`cost_selection_${player._id}`)
        .setPlaceholder("Choisissez votre niveau (1-5)")
        .addOptions([
          { label: "Niveau 1", value: "1", description: "Débutant" },
          { label: "Niveau 2", value: "2", description: "Intermédiaire" },
          { label: "Niveau 3", value: "3", description: "Bon" },
          { label: "Niveau 4", value: "4", description: "Très bon" },
          { label: "Niveau 5", value: "5", description: "Expert" },
        ]);

      const row1 = new ActionRowBuilder().addComponents(roleSelect);
      const row2 = new ActionRowBuilder().addComponents(costSelect);

      await interaction.reply({
        content:
          "✅ Vous avez rejoint la queue ! Choisissez maintenant votre rôle et niveau :",
        embeds: [embed],
        components: [row1, row2],
        ephemeral: true,
      });
    } catch (error) {
      Logger.error(
        `[CUSTOM_GAME] Erreur affichage sélection: ${error.message}`
      );
    }
  }

  async handleRoleSelection(interaction) {
    try {
      const playerId = interaction.customId.split("_")[2];
      const selectedRole = interaction.values[0];

      const player = await Player.findById(playerId);
      if (!player) {
        await interaction.reply({
          content: "❌ Joueur non trouvé.",
          ephemeral: true,
        });
        return;
      }

      // Vérifier si le rôle est toujours disponible
      const players = await Player.find({
        queueId: player.queueId,
        selectedRole: { $ne: null },
      });

      const roleCounts = {
        Top: 0,
        Jungle: 0,
        Mid: 0,
        ADC: 0,
        Support: 0,
        Fill: 0,
      };

      players.forEach((p) => {
        if (p.selectedRole && roleCounts[p.selectedRole] !== undefined) {
          roleCounts[p.selectedRole]++;
        }
      });

      // Vérifier si le rôle est locké (sauf Fill qui n'a pas de limite)
      if (selectedRole !== "Fill" && roleCounts[selectedRole] >= 2) {
        Logger.info(
          `[CUSTOM_GAME] Rôle ${selectedRole} locké par ${interaction.user.tag}`
        );
        await interaction.reply({
          content: `❌ Le rôle **${selectedRole}** est maintenant locké (${roleCounts[selectedRole]}/2). Veuillez choisir un autre rôle.`,
          ephemeral: true,
        });

        // Afficher à nouveau le menu de sélection avec les rôles disponibles
        await this.showRoleAndCostSelection(interaction, player);
        return;
      }

      // Mettre à jour le rôle
      player.selectedRole = selectedRole;
      await player.save();

      Logger.info(
        `[CUSTOM_GAME] Joueur ${interaction.user.tag} a choisi le rôle: ${selectedRole}`
      );

      await interaction.reply({
        content: `✅ Rôle sélectionné: **${selectedRole}**\nMaintenant choisissez votre niveau !`,
        ephemeral: true,
      });

      // Vérifier si le joueur a déjà choisi son cost
      if (player.selectedCost) {
        await this.checkQueueFull(interaction.channel, player.queueId);
      }
    } catch (error) {
      Logger.error(`[CUSTOM_GAME] Erreur sélection rôle: ${error.message}`);
      await interaction.reply({
        content: "❌ Erreur lors de la sélection du rôle.",
        ephemeral: true,
      });
    }
  }

  async handleCostSelection(interaction) {
    try {
      const playerId = interaction.customId.split("_")[2];
      const selectedCost = parseInt(interaction.values[0]);

      const player = await Player.findById(playerId);
      if (!player) {
        await interaction.reply({
          content: "❌ Joueur non trouvé.",
          ephemeral: true,
        });
        return;
      }

      // Mettre à jour le cost
      player.selectedCost = selectedCost;
      await player.save();

      Logger.info(
        `[CUSTOM_GAME] Joueur ${interaction.user.tag} a choisi le niveau: ${selectedCost}`
      );

      await interaction.reply({
        content: `✅ Niveau sélectionné: **${selectedCost}**\nVous êtes maintenant dans la queue !`,
        ephemeral: true,
      });

      // Vérifier si le joueur a déjà choisi son rôle
      if (player.selectedRole) {
        await this.checkQueueFull(interaction.channel, player.queueId);
      }
    } catch (error) {
      Logger.error(`[CUSTOM_GAME] Erreur sélection cost: ${error.message}`);
      await interaction.reply({
        content: "❌ Erreur lors de la sélection du niveau.",
        ephemeral: true,
      });
    }
  }

  async checkQueueFull(channel, queueId) {
    try {
      const queue = await Queue.findById(queueId);
      const players = await Player.find({
        queueId: queueId,
        selectedRole: { $ne: null },
        selectedCost: { $ne: null },
      });

      Logger.info(
        `[CUSTOM_GAME] Joueurs complets dans la queue: ${players.length}/10`
      );

      if (players.length === 10) {
        Logger.info(`[CUSTOM_GAME] Queue pleine, construction des équipes...`);
        await this.buildTeams(channel, queue);
      } else {
        await this.updateQueueEmbed(channel, queue);
      }
    } catch (error) {
      Logger.error(`[CUSTOM_GAME] Erreur vérification queue: ${error.message}`);
    }
  }

  async buildTeams(channel, queue) {
    try {
      const players = await Player.find({
        queueId: queue._id,
        selectedRole: { $ne: null },
        selectedCost: { $ne: null },
      });

      Logger.info(
        `[CUSTOM_GAME] Construction des équipes avec ${players.length} joueurs`
      );

      if (players.length !== 10) {
        await channel.send(
          `❌ Il faut exactement 10 joueurs pour créer les équipes. Actuellement: ${players.length}`
        );
        return;
      }

      // Convertir les documents Mongoose en objets simples
      const playersArray = players.map((player) => ({
        userId: player.userId,
        username: player.username,
        selectedRole: player.selectedRole,
        selectedCost: player.selectedCost,
      }));

      const result = TeamBuilder.buildTeams(playersArray);

      if (!result) {
        await channel.send("❌ Erreur lors de la construction des équipes.");
        return;
      }

      Logger.info(`[CUSTOM_GAME] Équipes construites avec succès`);
      await this.displayTeams(channel, result, queue);
    } catch (error) {
      Logger.error(
        `[CUSTOM_GAME] Erreur construction équipes: ${error.message}`
      );
      await channel.send("❌ Erreur lors de la construction des équipes.");
    }
  }

  async displayTeams(channel, result, queue) {
    try {
      const team1Embed = new EmbedBuilder()
        .setTitle("🔵 Équipe 1")
        .setColor("#0066ff")
        .addFields(
          result.team1.map((player) => ({
            name: `${player.assignedRole} (Demandé: ${player.selectedRole})`,
            value: `<@${player.userId}> - Niveau ${player.selectedCost}`,
            inline: true,
          }))
        )
        .setFooter({ text: `Cost moyen: ${result.team1Cost.toFixed(2)}` });

      const team2Embed = new EmbedBuilder()
        .setTitle("🔴 Équipe 2")
        .setColor("#ff0000")
        .addFields(
          result.team2.map((player) => ({
            name: `${player.assignedRole} (Demandé: ${player.selectedRole})`,
            value: `<@${player.userId}> - Niveau ${player.selectedCost}`,
            inline: true,
          }))
        )
        .setFooter({ text: `Cost moyen: ${result.team2Cost.toFixed(2)}` });

      const summaryEmbed = new EmbedBuilder()
        .setTitle("🎮 Équipes Créées !")
        .setDescription(
          `Écart de cost: **${result.costDifference.toFixed(2)}**`
        )
        .addFields(
          {
            name: "🔵 Équipe 1",
            value: `Cost moyen: ${result.team1Cost.toFixed(2)}`,
            inline: true,
          },
          {
            name: "🔴 Équipe 2",
            value: `Cost moyen: ${result.team2Cost.toFixed(2)}`,
            inline: true,
          },
          {
            name: "Équilibrage",
            value:
              result.costDifference <= 1 ? "✅ Équilibré" : "⚠️ Déséquilibré",
            inline: true,
          }
        )
        .setColor("#00ff00")
        .setTimestamp();

      // Créer un embed détaillé avec tous les choix
      // Récupérer les ratings + tier des joueurs pour l'affichage
      const enrichWithRating = async (p) => {
        const playerStats = await PlayerStats.findOne({ userId: p.userId });
        const defaults = this.ratingService.defaultPlayerFields();
        const rating = playerStats ? playerStats.rating : defaults.rating;
        const rd = playerStats ? playerStats.rd : defaults.rd;
        const volatility = playerStats ? playerStats.volatility : defaults.volatility;
        const tierLabel = this._displayLabel(playerStats);
        return { ...p, rating, rd, volatility, tierLabel };
      };

      const team1WithRating = await Promise.all(result.team1.map(enrichWithRating));
      const team2WithRating = await Promise.all(result.team2.map(enrichWithRating));

      const detailsEmbed = new EmbedBuilder()
        .setTitle("📋 Détails des Choix")
        .setDescription("Rôles demandés vs rôles assignés")
        .setColor("#ffff00")
        .addFields(
          {
            name: "🔵 Équipe 1",
            value: team1WithRating
              .map(
                (p) =>
                  `<@${p.userId}>: **${p.selectedRole}** → **${p.assignedRole}** (Niveau ${p.selectedCost} - ${p.tierLabel})`
              )
              .join("\n"),
            inline: false,
          },
          {
            name: "🔴 Équipe 2",
            value: team2WithRating
              .map(
                (p) =>
                  `<@${p.userId}>: **${p.selectedRole}** → **${p.assignedRole}** (Niveau ${p.selectedCost} - ${p.tierLabel})`
              )
              .join("\n"),
            inline: false,
          }
        );

      // Créer les boutons pour déclarer le gagnant
      const team1WinButton = new ButtonBuilder()
        .setCustomId("team1_win")
        .setLabel("Équipe 1 Gagne")
        .setStyle(ButtonStyle.Success)
        .setEmoji("🔵");

      const team2WinButton = new ButtonBuilder()
        .setCustomId("team2_win")
        .setLabel("Équipe 2 Gagne")
        .setStyle(ButtonStyle.Danger)
        .setEmoji("🔴");

      const cancelButton = new ButtonBuilder()
        .setCustomId("cancel_game")
        .setLabel("Annuler")
        .setStyle(ButtonStyle.Secondary)
        .setEmoji("❌");

      const buttonRow = new ActionRowBuilder().addComponents(
        team1WinButton,
        team2WinButton,
        cancelButton
      );

      await channel.send({
        content: `<@${result.team1
          .map((p) => p.userId)
          .join("> <@")}> <@${result.team2.map((p) => p.userId).join("> <@")}>`,
        embeds: [detailsEmbed],
        components: [buttonRow],
      });

      // Stocker le résultat de la partie en cours avec les ratings
      this.currentGameResult = {
        team1: {
          players: team1WithRating,
          averageCost: result.team1Cost,
        },
        team2: {
          players: team2WithRating,
          averageCost: result.team2Cost,
        },
        costDifference: result.costDifference,
        queueId: String(queue._id),
        startedAt: new Date(),
      };

      await this.syncActiveCustomGame("awaiting_winner", {
        queueId: String(queue._id),
        startedAt: this.currentGameResult.startedAt,
      });

      queue.currentPhase = "completed";
      await queue.save();

      Logger.info(`[CUSTOM_GAME] Équipes affichées avec succès`);
    } catch (error) {
      Logger.error(`[CUSTOM_GAME] Erreur affichage équipes: ${error.message}`);
    }
  }

  async stopCustomGame(message) {
    try {
      // Supprimer le message de la queue s'il existe
      if (this.queueMessage) {
        try {
          await this.queueMessage.delete();
          Logger.info(`[CUSTOM_GAME] Message de queue supprimé`);
        } catch (error) {
          Logger.error(
            `[CUSTOM_GAME] Erreur suppression message: ${error.message}`
          );
        }
      }

      await Queue.updateMany({ isActive: true }, { isActive: false });
      await Player.deleteMany({});
      await this.clearActiveCustomGame();

      this.currentQueue = null;
      this.queueMessage = null;
      this.roleSelectionTimeouts.clear();
      this.costSelectionTimeouts.clear();
      this.currentGameResult = null; // Reset du résultat de partie

      await message.reply("✅ Queue 5v5 arrêtée, vidée et reset complet.");
      Logger.info(
        `[CUSTOM_GAME] Queue arrêtée et reset par ${message.author.tag}`
      );
    } catch (error) {
      Logger.error(`[CUSTOM_GAME] Erreur arrêt queue: ${error.message}`);
      await message.reply("❌ Erreur lors de l'arrêt de la queue.");
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
    try {
      const players = await Player.find({ queueId: queue._id });
      const completePlayers = players.filter(
        (p) => p.selectedRole && p.selectedCost
      );
      const incompletePlayers = players.filter(
        (p) => !p.selectedRole || !p.selectedCost
      );

      // Calculer les compteurs de rôles
      const roleCounts = {
        Top: 0,
        Jungle: 0,
        Mid: 0,
        ADC: 0,
        Support: 0,
        Fill: 0,
      };

      completePlayers.forEach((p) => {
        if (p.selectedRole && roleCounts[p.selectedRole] !== undefined) {
          roleCounts[p.selectedRole]++;
        }
      });

      const lockedRoles = Object.entries(roleCounts)
        .filter(([role, count]) => count >= 2)
        .map(([role, count]) => `${role} (${count}/2)`);

      // Logs détaillés
      Logger.info(`[CUSTOM_GAME] Nombre total de joueurs: ${players.length}`);
      Logger.info(`[CUSTOM_GAME] Joueurs complets: ${completePlayers.length}`);
      Logger.info(
        `[CUSTOM_GAME] Joueurs incomplets: ${incompletePlayers.length}`
      );
      Logger.info(
        `[CUSTOM_GAME] Compteurs de rôles: ${JSON.stringify(roleCounts)}`
      );
      Logger.info(`[CUSTOM_GAME] Rôles lockés: ${lockedRoles.join(", ")}`);

      const embed = new EmbedBuilder()
        .setTitle("🎮 Queue 5v5 Custom")
        .setDescription("Rejoignez la queue pour participer à une partie 5v5 !")
        .addFields(
          {
            name: "Joueurs complets",
            value: `${completePlayers.length}/10`,
            inline: true,
          },
          {
            name: "Phase",
            value:
              queue.currentPhase === "waiting"
                ? "En attente"
                : queue.currentPhase,
            inline: true,
          },
          {
            name: "Status",
            value: queue.isActive ? "🟢 Active" : "🔴 Inactive",
            inline: true,
          }
        )
        .setColor(queue.isActive ? "#00ff00" : "#ff0000")
        .setTimestamp();

      // Ajouter les joueurs complets avec leur tier
      if (completePlayers.length > 0) {
        const completeList = await Promise.all(
          completePlayers.map(async (p) => {
            const playerStats = await PlayerStats.findOne({ userId: p.userId });
            return `• ${p.username} (${p.selectedRole} - Niveau ${p.selectedCost}) - ${this._displayLabel(playerStats)}`;
          })
        );

        embed.addFields({
          name: "✅ Joueurs complets",
          value: completeList.join("\n"),
          inline: false,
        });
      }

      // Ajouter les joueurs incomplets
      if (incompletePlayers.length > 0) {
        const incompleteList = incompletePlayers
          .map((p) => `• ${p.username} (En cours de sélection)`)
          .join("\n");
        embed.addFields({
          name: "⏳ Joueurs en cours",
          value: incompleteList,
          inline: false,
        });
      }

      // Ajouter les rôles lockés
      if (lockedRoles.length > 0) {
        embed.addFields({
          name: "🔒 Rôles lockés",
          value: lockedRoles.join(", "),
          inline: false,
        });
      }

      // Créer les boutons
      const joinButton = new ButtonBuilder()
        .setCustomId("join_queue")
        .setLabel("Rejoindre la Queue")
        .setStyle(ButtonStyle.Success)
        .setEmoji("🎮");

      const leaveButton = new ButtonBuilder()
        .setCustomId("leave_queue")
        .setLabel("Quitter la Queue")
        .setStyle(ButtonStyle.Danger)
        .setEmoji("🚪");

      const buttonRow = new ActionRowBuilder().addComponents(
        joinButton,
        leaveButton
      );

      // Supprimer l'ancien message s'il existe
      if (this.queueMessage) {
        try {
          await this.queueMessage.delete();
        } catch (error) {
          Logger.info("[CUSTOM_GAME] Ancien message de queue introuvable");
        }
      }

      // Envoyer le nouveau message
      this.queueMessage = await channel.send({
        embeds: [embed],
        components: [buttonRow],
      });

      // Mettre à jour le Rich Presence avec le nombre de joueurs
      if (channel.client && channel.client.updateRichPresenceForQueue) {
        channel.client.updateRichPresenceForQueue(completePlayers.length, 10);
      }
    } catch (error) {
      Logger.error(`[CUSTOM_GAME] Erreur mise à jour embed: ${error.message}`);
    }
  }

  async leaveQueue(interaction) {
    try {
      const queue = await this.getOrCreateQueue();

      // Vérifier si le joueur est dans la queue
      const player = await Player.findOne({
        userId: interaction.user.id,
        queueId: queue._id,
      });

      if (!player) {
        await interaction.reply({
          content: "❌ Vous n'êtes pas dans la queue !",
          ephemeral: true,
        });
        return;
      }

      // Supprimer le joueur
      await Player.findByIdAndDelete(player._id);

      Logger.info(
        `[CUSTOM_GAME] Joueur ${interaction.user.tag} (${interaction.user.id}) a quitté la queue`
      );

      await interaction.reply({
        content: "✅ Vous avez quitté la queue !",
        ephemeral: true,
      });

      // Mettre à jour l'embed
      await this.updateQueueEmbed(interaction.channel, queue);
    } catch (error) {
      Logger.error(`[CUSTOM_GAME] Erreur leave queue: ${error.message}`);
      await interaction.reply({
        content: "❌ Erreur lors de la sortie de la queue.",
        ephemeral: true,
      });
    }
  }

  async handleRoleSelectionTimeout(channel, queue) {
    // Gérer le timeout de sélection de rôle
    Logger.info(`[CUSTOM_GAME] Timeout sélection rôle`);
  }

  async handleCostSelectionTimeout(channel, queue) {
    // Gérer le timeout de sélection de cost
    Logger.info(`[CUSTOM_GAME] Timeout sélection cost`);
  }

  async simulateTestPlayers(message) {
    try {
      const queue = await this.getOrCreateQueue();

      // Vérifier si il y a déjà des joueurs
      const existingPlayers = await Player.countDocuments({
        queueId: queue._id,
      });
      if (existingPlayers > 0) {
        await message.reply(
          "❌ Il y a déjà des joueurs dans la queue. Utilisez `!custom reset` d'abord."
        );
        return;
      }

      // Créer 10 joueurs de test avec des rôles et niveaux différents pour tester l'algorithme
      const testPlayers = [
        { username: "TestPlayer1", selectedRole: "Top", selectedCost: 1 },
        { username: "TestPlayer2", selectedRole: "Jungle", selectedCost: 2 },
        { username: "TestPlayer3", selectedRole: "Mid", selectedCost: 3 },
        { username: "TestPlayer4", selectedRole: "ADC", selectedCost: 4 },
        { username: "TestPlayer5", selectedRole: "Support", selectedCost: 5 },
        { username: "TestPlayer6", selectedRole: "Top", selectedCost: 2 },
        { username: "TestPlayer7", selectedRole: "Jungle", selectedCost: 3 },
        { username: "TestPlayer8", selectedRole: "Mid", selectedCost: 4 },
        { username: "TestPlayer9", selectedRole: "Fill", selectedCost: 1 },
        { username: "TestPlayer10", selectedRole: "Fill", selectedCost: 5 },
      ];

      // Créer les joueurs dans la DB
      for (const testPlayer of testPlayers) {
        await Player.create({
          userId: `test_${Date.now()}_${Math.random()
            .toString(36)
            .substr(2, 9)}`,
          username: testPlayer.username,
          queueId: queue._id,
          selectedRole: testPlayer.selectedRole,
          selectedCost: testPlayer.selectedCost,
        });
      }

      Logger.info(
        `[CUSTOM_GAME] 10 joueurs de test créés par ${message.author.tag}`
      );

      // Mettre à jour l'embed
      await this.updateQueueEmbed(message.channel, queue);

      await message.reply(
        "✅ 10 joueurs de test créés ! Les équipes vont se construire automatiquement."
      );

      // Construire automatiquement les équipes
      setTimeout(async () => {
        await this.buildTeams(message.channel, queue);
      }, 2000);
    } catch (error) {
      Logger.error(`[CUSTOM_GAME] Erreur simulation joueurs: ${error.message}`);
      await message.reply("❌ Erreur lors de la création des joueurs de test.");
    }
  }

  async simulateRandomPlayers(message) {
    try {
      const queue = await this.getOrCreateQueue();

      // Vérifier si il y a déjà des joueurs
      const existingPlayers = await Player.countDocuments({
        queueId: queue._id,
      });
      if (existingPlayers > 0) {
        await message.reply(
          "❌ Il y a déjà des joueurs dans la queue. Utilisez `!custom reset` d'abord."
        );
        return;
      }

      const roles = ["Top", "Jungle", "Mid", "ADC", "Support", "Fill"];
      const testPlayers = [];

      // Créer 10 joueurs avec des rôles et niveaux aléatoires
      for (let i = 1; i <= 10; i++) {
        const randomRole = roles[Math.floor(Math.random() * roles.length)];
        const randomCost = Math.floor(Math.random() * 5) + 1; // 1-5

        testPlayers.push({
          username: `RandomPlayer${i}`,
          selectedRole: randomRole,
          selectedCost: randomCost,
        });
      }

      // Créer les joueurs dans la DB
      for (const testPlayer of testPlayers) {
        await Player.create({
          userId: `random_${Date.now()}_${Math.random()
            .toString(36)
            .substr(2, 9)}`,
          username: testPlayer.username,
          queueId: queue._id,
          selectedRole: testPlayer.selectedRole,
          selectedCost: testPlayer.selectedCost,
        });
      }

      Logger.info(
        `[CUSTOM_GAME] 10 joueurs aléatoires créés par ${message.author.tag}`
      );

      // Mettre à jour l'embed
      await this.updateQueueEmbed(message.channel, queue);

      await message.reply(
        "✅ 10 joueurs aléatoires créés ! Les équipes vont se construire automatiquement."
      );

      // Construire automatiquement les équipes
      setTimeout(async () => {
        await this.buildTeams(message.channel, queue);
      }, 2000);
    } catch (error) {
      Logger.error(
        `[CUSTOM_GAME] Erreur simulation joueurs aléatoires: ${error.message}`
      );
      await message.reply(
        "❌ Erreur lors de la création des joueurs aléatoires."
      );
    }
  }

  async simulateTestEloPlayers(message) {
    try {
      const queue = await this.getOrCreateQueue();

      // Vérifier si il y a déjà des joueurs
      const existingPlayers = await Player.countDocuments({
        queueId: queue._id,
      });
      if (existingPlayers > 0) {
        await message.reply(
          "❌ Il y a déjà des joueurs dans la queue. Utilisez `!custom reset` d'abord."
        );
        return;
      }

      const roles = ["Top", "Jungle", "Mid", "ADC", "Support", "Fill"];
      const testPlayers = [];

      // Garantir qu'on a au moins 2 joueurs de chaque rôle principal (pour pouvoir créer 2 équipes)
      // Stratégie : créer 2 joueurs de chaque rôle principal, puis 0 Fill
      const requiredRoles = ["Top", "Jungle", "Mid", "ADC", "Support"];
      const roleCounts = {
        Top: 0,
        Jungle: 0,
        Mid: 0,
        ADC: 0,
        Support: 0,
        Fill: 0,
      };

      // Créer 2 joueurs de chaque rôle principal (10 joueurs au total)
      for (let i = 0; i < requiredRoles.length; i++) {
        for (let j = 0; j < 2; j++) {
          const role = requiredRoles[i];
          const randomCost = Math.floor(Math.random() * 5) + 1; // 1-5
          const randomRating = Math.floor(Math.random() * 401) + 800; // 800-1200
          const randomRD = Math.floor(Math.random() * 120) + 80; // 80-200

          testPlayers.push({
            username: `TestPlayer${testPlayers.length + 1}`,
            selectedRole: role,
            selectedCost: randomCost,
            rating: randomRating,
            rd: randomRD,
          });
          roleCounts[role]++;
        }
      }

      Logger.info(
        `[CUSTOM_GAME] Distribution des rôles garantie: ${JSON.stringify(roleCounts)}`
      );

      // Créer les joueurs et leurs statistiques dans la DB
      const baseTimestamp = Date.now();
      for (let i = 0; i < testPlayers.length; i++) {
        const testPlayer = testPlayers[i];
        const userId = `test_${baseTimestamp}_${i}_${Math.random()
          .toString(36)
          .substr(2, 9)}`;

        await Player.create({
          userId: userId,
          username: testPlayer.username,
          queueId: queue._id,
          selectedRole: testPlayer.selectedRole,
          selectedCost: testPlayer.selectedCost,
        });

        const games = Math.floor(Math.random() * 20);
        let playerStats = await PlayerStats.findOne({ userId: userId });
        if (!playerStats) {
          playerStats = await PlayerStats.create({
            userId: userId,
            username: testPlayer.username,
            rating: testPlayer.rating,
            rd: testPlayer.rd,
            volatility: 0.06,
            gamesPlayed: games,
            totalGames: games,
          });
        } else {
          playerStats.rating = testPlayer.rating;
          playerStats.rd = testPlayer.rd;
          await playerStats.save();
        }

        Logger.info(
          `[CUSTOM_GAME] Joueur test créé: ${testPlayer.username} - Rating: ${testPlayer.rating} (RD ${testPlayer.rd}), Cost: ${testPlayer.selectedCost}, Role: ${testPlayer.selectedRole}`
        );
      }

      Logger.info(
        `[CUSTOM_GAME] 10 joueurs de test créés par ${message.author.tag}`
      );

      await this.updateQueueEmbed(message.channel, queue);

      const summaryEmbed = new EmbedBuilder()
        .setTitle("✅ 10 Joueurs de Test Créés")
        .setDescription(
          "Les joueurs ont été créés avec des ratings aléatoires entre 800 et 1200.\nLes équipes vont se construire automatiquement."
        )
        .addFields(
          testPlayers.map((p) => ({
            name: `${p.username}`,
            value: `Rating: **${p.rating}** (RD ${p.rd}) | Cost: ${p.selectedCost} | Role: ${p.selectedRole}`,
            inline: true,
          }))
        )
        .setColor("#00ff00")
        .setTimestamp();

      await message.reply({ embeds: [summaryEmbed] });

      // Construire automatiquement les équipes
      setTimeout(async () => {
        await this.buildTeams(message.channel, queue);
      }, 2000);
    } catch (error) {
      Logger.error(
        `[CUSTOM_GAME] Erreur simulation joueurs test Elo: ${error.message}`
      );
      Logger.error(`[CUSTOM_GAME] Stack trace:`, error.stack);
      await message.reply(
        "❌ Erreur lors de la création des joueurs de test avec Elo."
      );
    }
  }

  // Nouvelles méthodes pour gérer les résultats des parties

  /**
   * Helper pour répondre à une interaction de manière sécurisée
   * @param {Interaction} interaction - L'interaction Discord
   * @param {Object} options - Options pour la réponse
   * @param {boolean} forceReply - Forcer l'utilisation de reply (pour la première réponse)
   * @returns {Promise<void>}
   */
  async safeReply(interaction, options, forceReply = false) {
    try {
      if (forceReply || (!interaction.replied && !interaction.deferred)) {
        await interaction.reply(options);
      } else {
        await interaction.followUp(options);
      }
    } catch (error) {
      // Si l'interaction a expiré ou est invalide, on log juste l'erreur
      if (error.code === 10062 || error.message.includes("Unknown interaction")) {
        Logger.warning(
          `[CUSTOM_GAME] Interaction expirée ou invalide: ${error.message}`
        );
      } else {
        throw error;
      }
    }
  }

  async handleGameResult(interaction) {
    let hasReplied = false;
    try {
      await interaction.deferReply();
      hasReplied = true;
    } catch (error) {
      Logger.error(`[CUSTOM_GAME] Erreur defer: ${error.message}`);
      return;
    }

    try {
      if (!this._isReferee(interaction.member)) {
        await interaction.editReply({
          content:
            "❌ Seuls les administrateurs et les utilisateurs avec le rôle **Arbitre** peuvent déclarer le gagnant d'une partie.",
        });
        return;
      }

      if (!this.currentGameResult) {
        await interaction.editReply({
          content: "❌ Aucune partie en cours à terminer.",
        });
        return;
      }

      const winner = interaction.customId === "team1_win" ? "team1" : "team2";
      this.currentGameResult.winner = winner;
      this.currentGameResult.mvpUserId = null;
      this.currentGameResult.aceUserId = null;
      await this.syncActiveCustomGame("awaiting_performance", {
        winner,
        mvpUserId: null,
        aceUserId: null,
      });

      Logger.info(
        `[CUSTOM_GAME] Victoire déclarée par ${interaction.user.tag} → ${winner}`
      );

      const resultEmbed = new EmbedBuilder()
        .setTitle("🏆 Résultat de la Partie")
        .setDescription(
          `**${winner === "team1" ? "🔵 Équipe 1" : "🔴 Équipe 2"}** remporte la victoire !\n\n` +
            `**Arbitre** : sélectionne un **MVP** (équipe gagnante) et un **ACE** (équipe perdante), puis clique sur **Confirmer**.\n` +
            `Tu peux aussi cliquer sur **Passer** pour appliquer le rating sans bonus.`
        )
        .addFields(
          {
            name: "🔵 Équipe 1",
            value: `Cost moyen: ${this.currentGameResult.team1.averageCost.toFixed(2)}`,
            inline: true,
          },
          {
            name: "🔴 Équipe 2",
            value: `Cost moyen: ${this.currentGameResult.team2.averageCost.toFixed(2)}`,
            inline: true,
          },
          {
            name: "Écart de cost",
            value: `${this.currentGameResult.costDifference.toFixed(2)}`,
            inline: true,
          }
        )
        .setColor(winner === "team1" ? "#0066ff" : "#ff0000")
        .setTimestamp();

      const components = this._buildPerformanceSelectionComponents();

      await interaction.editReply({
        content: "✅ Victoire enregistrée. Sélection MVP / ACE en attente.",
        embeds: [resultEmbed],
        components,
      });
    } catch (error) {
      Logger.error(`[CUSTOM_GAME] Erreur gestion résultat: ${error.message}`);
      Logger.error(`[CUSTOM_GAME] Stack trace:`, error.stack);
      if (hasReplied) {
        try {
          await interaction.editReply({
            content: "❌ Erreur lors de l'enregistrement du résultat.",
          });
        } catch (editError) {
          Logger.error(
            `[CUSTOM_GAME] Impossible de mettre à jour la réponse: ${editError.message}`
          );
        }
      }
    }
  }

  /**
   * Build the MVP / ACE select menus + Confirm / Skip buttons based on
   * the current game result. Returns the array of ActionRows ready to
   * be attached to the result message.
   */
  _buildPerformanceSelectionComponents() {
    const winnerKey = this.currentGameResult.winner;
    const loserKey = winnerKey === "team1" ? "team2" : "team1";
    const winners = this.currentGameResult[winnerKey].players;
    const losers = this.currentGameResult[loserKey].players;
    const mvpUserId = this.currentGameResult.mvpUserId;
    const aceUserId = this.currentGameResult.aceUserId;

    const truncate = (s, n) => (s && s.length > n ? s.slice(0, n - 1) + "…" : s || "Joueur");

    const mvpMenu = new StringSelectMenuBuilder()
      .setCustomId("mvp_select")
      .setPlaceholder(
        mvpUserId
          ? `🌟 MVP : ${truncate(winners.find((p) => p.userId === mvpUserId)?.username, 90)}`
          : "🌟 Choisir le MVP (équipe gagnante) — +10% rating"
      )
      .setMinValues(1)
      .setMaxValues(1)
      .addOptions(
        winners.map((p) => ({
          label: truncate(p.username, 100),
          value: p.userId,
          description: `${p.assignedRole || p.selectedRole || ""}`.slice(0, 100) || undefined,
          default: p.userId === mvpUserId,
          emoji: p.userId === mvpUserId ? "🌟" : undefined,
        }))
      );

    const aceMenu = new StringSelectMenuBuilder()
      .setCustomId("ace_select")
      .setPlaceholder(
        aceUserId
          ? `💀 ACE : ${truncate(losers.find((p) => p.userId === aceUserId)?.username, 90)}`
          : "💀 Choisir l'ACE (équipe perdante) — -10% de perte"
      )
      .setMinValues(1)
      .setMaxValues(1)
      .addOptions(
        losers.map((p) => ({
          label: truncate(p.username, 100),
          value: p.userId,
          description: `${p.assignedRole || p.selectedRole || ""}`.slice(0, 100) || undefined,
          default: p.userId === aceUserId,
          emoji: p.userId === aceUserId ? "💀" : undefined,
        }))
      );

    const confirmBtn = new ButtonBuilder()
      .setCustomId("confirm_match_result")
      .setLabel("Confirmer")
      .setStyle(ButtonStyle.Success)
      .setEmoji("✅");

    const skipBtn = new ButtonBuilder()
      .setCustomId("skip_mvp_ace")
      .setLabel("Passer (pas de MVP / ACE)")
      .setStyle(ButtonStyle.Secondary)
      .setEmoji("⏭️");

    return [
      new ActionRowBuilder().addComponents(mvpMenu),
      new ActionRowBuilder().addComponents(aceMenu),
      new ActionRowBuilder().addComponents(confirmBtn, skipBtn),
    ];
  }

  /**
   * Handles MVP select menu interactions. Only the referee may pick.
   */
  async handleMvpSelection(interaction) {
    await this._handlePerformanceSelection(interaction, "mvp");
  }

  /**
   * Handles ACE select menu interactions. Only the referee may pick.
   */
  async handleAceSelection(interaction) {
    await this._handlePerformanceSelection(interaction, "ace");
  }

  async _handlePerformanceSelection(interaction, kind) {
    try {
      if (!this._isReferee(interaction.member)) {
        await interaction.reply({
          content: "❌ Seul l'arbitre peut désigner le MVP / ACE.",
          ephemeral: true,
        });
        return;
      }
      if (!this.currentGameResult || !this.currentGameResult.winner) {
        await interaction.reply({
          content: "❌ Aucune partie en attente de validation.",
          ephemeral: true,
        });
        return;
      }
      const selectedUserId = interaction.values?.[0];
      if (kind === "mvp") {
        this.currentGameResult.mvpUserId = selectedUserId;
      } else {
        this.currentGameResult.aceUserId = selectedUserId;
      }
      await this.syncActiveCustomGame("awaiting_performance", {
        winner: this.currentGameResult.winner ?? null,
        mvpUserId: this.currentGameResult.mvpUserId ?? null,
        aceUserId: this.currentGameResult.aceUserId ?? null,
      });
      const components = this._buildPerformanceSelectionComponents();
      await interaction.update({ components });
      Logger.info(
        `[CUSTOM_GAME] ${kind.toUpperCase()} sélectionné par ${interaction.user.tag}: ${selectedUserId}`
      );
    } catch (error) {
      Logger.error(
        `[CUSTOM_GAME] Erreur sélection ${kind}: ${error.message}`
      );
    }
  }

  /**
   * Finalize the match: apply rating (with MVP / ACE modifiers if set)
   * and post the rating-change embed. Triggered by Confirm or Skip.
   */
  async finalizeMatchResult(interaction) {
    let deferred = false;
    try {
      await interaction.deferReply();
      deferred = true;
    } catch (error) {
      Logger.error(`[CUSTOM_GAME] Erreur defer finalize: ${error.message}`);
      return;
    }

    try {
      if (!this._isReferee(interaction.member)) {
        await interaction.editReply({
          content:
            "❌ Seuls les administrateurs et les utilisateurs avec le rôle **Arbitre** peuvent finaliser une partie.",
        });
        return;
      }
      if (!this.currentGameResult || !this.currentGameResult.winner) {
        await interaction.editReply({
          content: "❌ Aucune partie en attente de validation.",
        });
        return;
      }

      const isSkip = interaction.customId === "skip_mvp_ace";
      if (isSkip) {
        this.currentGameResult.mvpUserId = null;
        this.currentGameResult.aceUserId = null;
      }

      Logger.info(
        `[CUSTOM_GAME] Finalisation par ${interaction.user.tag} | winner=${this.currentGameResult.winner} mvp=${this.currentGameResult.mvpUserId} ace=${this.currentGameResult.aceUserId} skip=${isSkip}`
      );

      // Désactiver les composants de l'ancien message pour éviter une
      // double finalisation.
      try {
        if (interaction.message) {
          await interaction.message.edit({ components: [] });
        }
      } catch (editErr) {
        Logger.warning(
          `[CUSTOM_GAME] Impossible de retirer les composants: ${editErr.message}`
        );
      }

      const eloResult = await this.eloIntegration.resolveMatchWithElo(
        this.currentGameResult,
        interaction.user.id
      );
      await this.syncActiveCustomGame("completed", {
        winner: this.currentGameResult.winner ?? null,
        mvpUserId: this.currentGameResult.mvpUserId ?? null,
        aceUserId: this.currentGameResult.aceUserId ?? null,
        sourceMatchId: eloResult.matchId,
        finalizedAt: new Date(),
      });

      const eloEmbed = this.createEloResultEmbed(eloResult);
      await interaction.editReply({
        content: isSkip
          ? "✅ Match finalisé sans MVP / ACE."
          : `✅ Match finalisé. MVP / ACE désigné par ${interaction.user.tag}.`,
        embeds: [eloEmbed],
      });

      await this.clearActiveCustomGame();
      await this.clearActiveCustomGame();
      this.currentGameResult = null;
    } catch (error) {
      Logger.error(`[CUSTOM_GAME] Erreur finalisation: ${error.message}`);
      Logger.error(`[CUSTOM_GAME] Stack trace:`, error.stack);
      if (deferred) {
        try {
          await interaction.editReply({
            content: `❌ Erreur lors de la finalisation: ${error.message}`,
          });
        } catch (_) {
          // ignore
        }
      }
    }
  }

  /**
   * Cancel the current pending match. Only admins / arbitres may do this —
   * before this check, any player could click "Annuler" and silently wipe
   * the in-memory match state, forcing the points to be entered by hand.
   */
  async cancelGame(interaction) {
    try {
      if (!this._isReferee(interaction.member)) {
        await interaction.reply({
          content:
            "❌ Seuls les administrateurs et les utilisateurs avec le rôle **Arbitre** peuvent annuler une partie.",
          ephemeral: true,
        });
        return;
      }
      if (!this.currentGameResult) {
        await interaction.reply({
          content: "❌ Aucune partie à annuler.",
          ephemeral: true,
        });
        return;
      }

      this.currentGameResult = null;

      try {
        if (interaction.message) {
          await interaction.message.edit({ components: [] });
        }
      } catch (_) {
        // ignore
      }

      await interaction.reply({
        content: `❌ Partie annulée par ${interaction.user.tag}. Aucun rating n'a été appliqué.`,
      });
      Logger.info(`[CUSTOM_GAME] Partie annulée par ${interaction.user.tag}`);
    } catch (error) {
      Logger.error(`[CUSTOM_GAME] Erreur annulation: ${error.message}`);
    }
  }

  createEloResultEmbed(ratingResult) {
    const embed = new EmbedBuilder()
      .setTitle("🏆 Changements de Rating")
      .setColor("#ffd700")
      .setTimestamp();

    const winners = Object.values(ratingResult.updatedPlayers).filter(
      (p) => p.result === "win"
    );
    const losers = Object.values(ratingResult.updatedPlayers).filter(
      (p) => p.result === "loss"
    );

    const formatLine = (player) => {
      const delta = player.displayDelta;
      const sign = delta >= 0 ? "+" : "";
      const tierLabel = player.tier && player.tier.tier !== "Placements"
        ? `${player.tier.tier}${player.tier.subDivision ? " " + player.tier.subDivision : ""}`
        : `Placements (${player.tier?.placementsRemaining ?? 0})`;
      const badge =
        player.performanceRole === "MVP"
          ? "🌟 **MVP** "
          : player.performanceRole === "ACE"
          ? "💀 **ACE** "
          : "";
      return `${badge}**${player.username}**: ${player.displayBefore} → ${player.displayAfter} (${sign}${delta}) · ${tierLabel}`;
    };

    if (winners.length > 0) {
      embed.addFields({
        name: "🟢 Gagnants",
        value: winners.map((p) => `🟢 ${formatLine(p)}`).join("\n"),
        inline: false,
      });
    }

    if (losers.length > 0) {
      embed.addFields({
        name: "🔴 Perdants",
        value: losers.map((p) => `🔴 ${formatLine(p)}`).join("\n"),
        inline: false,
      });
    }

    const mvp = winners.find((p) => p.performanceRole === "MVP");
    const ace = losers.find((p) => p.performanceRole === "ACE");
    if (mvp || ace) {
      const parts = [];
      if (mvp) parts.push(`🌟 MVP : **${mvp.username}** (+10% rating)`);
      if (ace) parts.push(`💀 ACE : **${ace.username}** (-10% de perte)`);
      embed.addFields({ name: "Performances", value: parts.join("\n"), inline: false });
    }

    return embed;
  }

  async resetLeaderboard(message) {
    try {
      // Vérifier que l'utilisateur est admin
      if (!message.member.permissions.has("Administrator")) {
        await message.reply(
          "❌ Seuls les administrateurs peuvent réinitialiser le classement."
        );
        return;
      }

      // Supprimer toutes les stats
      const result = await PlayerStats.deleteMany({});

      Logger.info(
        `[CUSTOM_GAME] Classement réinitialisé par ${message.author.tag} - ${result.deletedCount} joueurs supprimés`
      );

      await message.reply(
        `✅ Classement réinitialisé ! ${result.deletedCount} joueurs supprimés du classement.`
      );
    } catch (error) {
      Logger.error(`[CUSTOM_GAME] Erreur reset classement: ${error.message}`);
      await message.reply(
        "❌ Erreur lors de la réinitialisation du classement."
      );
    }
  }

  async showLeaderboard(message, page = 0) {
    try {
      const playerStats = await PlayerStats.find({
        gamesPlayed: { $gte: this.ratingService.config.leaderboardMinGames },
        rd: { $lte: this.ratingService.config.leaderboardDropRD },
      }).sort({
        rating: -1,
        totalGames: -1,
      });

      Logger.info(
        `[CUSTOM_GAME] Affichage classement - ${playerStats.length} joueurs trouvés`
      );

      if (playerStats.length === 0) {
        await message.reply("📊 Aucune statistique disponible pour le moment.");
        return;
      }

      // Pagination : 5 joueurs par page
      const playersPerPage = 5;
      const totalPages = Math.ceil(playerStats.length / playersPerPage);
      const startIndex = page * playersPerPage;
      const endIndex = startIndex + playersPerPage;
      const currentPagePlayers = playerStats.slice(startIndex, endIndex);

      const leaderboardEmbed = new EmbedBuilder()
        .setTitle("🏆 Classement 5v5 Custom")
        .setDescription(`Top ${playerStats.length} des joueurs par rating (placements terminés)`)
        .setColor("#ffd700")
        .setFooter({
          text: `Page ${page + 1}/${totalPages} • ${
            playerStats.length
          } joueurs total`,
        })
        .setTimestamp();

      let leaderboardText = "";
      for (let i = 0; i < currentPagePlayers.length; i++) {
        const stats = currentPagePlayers[i];
        const globalIndex = startIndex + i;
        const medal =
          globalIndex === 0
            ? "🥇"
            : globalIndex === 1
            ? "🥈"
            : globalIndex === 2
            ? "🥉"
            : `**${globalIndex + 1}.**`;

        // Calculer le winrate manuellement
        const winrate =
          stats.totalGames > 0
            ? ((stats.wins / stats.totalGames) * 100).toFixed(1)
            : "0.0";

        const tierLabel = this._displayLabel(stats);
        leaderboardText += `${medal} **${stats.username}**\n`;
        leaderboardText += `   🏆 ${tierLabel} | 📊 ${stats.wins}W/${stats.losses}L (${winrate}%) | 🎮 ${stats.totalGames} | 🌟 ${stats.mvpCount || 0} / 💀 ${stats.aceCount || 0}\n`;
        leaderboardText += "\n";
      }

      leaderboardEmbed.addFields({
        name: `Classement (${startIndex + 1}-${Math.min(
          endIndex,
          playerStats.length
        )})`,
        value: leaderboardText.trim(),
        inline: false,
      });

      // Créer les boutons de navigation
      const buttons = [];

      // Bouton "Précédent"
      if (page > 0) {
        const prevButton = new ButtonBuilder()
          .setCustomId(`leaderboard_prev_${page}`)
          .setLabel("◀️ Précédent")
          .setStyle(ButtonStyle.Secondary);
        buttons.push(prevButton);
      }

      // Bouton "Suivant"
      if (page < totalPages - 1) {
        const nextButton = new ButtonBuilder()
          .setCustomId(`leaderboard_next_${page}`)
          .setLabel("Suivant ▶️")
          .setStyle(ButtonStyle.Primary);
        buttons.push(nextButton);
      }

      // Bouton "Première page"
      if (page > 0) {
        const firstButton = new ButtonBuilder()
          .setCustomId(`leaderboard_first`)
          .setLabel("🏠 Première")
          .setStyle(ButtonStyle.Secondary);
        buttons.push(firstButton);
      }

      // Bouton "Dernière page"
      if (page < totalPages - 1) {
        const lastButton = new ButtonBuilder()
          .setCustomId(`leaderboard_last_${totalPages - 1}`)
          .setLabel("🏁 Dernière")
          .setStyle(ButtonStyle.Secondary);
        buttons.push(lastButton);
      }

      const row = new ActionRowBuilder().addComponents(buttons);

      const replyOptions = { embeds: [leaderboardEmbed] };
      if (buttons.length > 0) {
        replyOptions.components = [row];
      }

      await message.reply(replyOptions);
      Logger.info(
        `[CUSTOM_GAME] Classement affiché par ${message.author.tag} (page ${
          page + 1
        }/${totalPages})`
      );
    } catch (error) {
      Logger.error(
        `[CUSTOM_GAME] Erreur affichage classement: ${error.message}`
      );
      await message.reply("❌ Erreur lors de l'affichage du classement.");
    }
  }

  async showPlayerStats(message, userId) {
    try {
      const playerStats = await PlayerStats.findOne({ userId: userId });

      if (!playerStats) {
        await message.reply("❌ Aucune statistique trouvée pour ce joueur.");
        return;
      }

      // Calculer le winrate
      const winrate =
        playerStats.totalGames > 0
          ? ((playerStats.wins / playerStats.totalGames) * 100).toFixed(1)
          : "0.0";

      const tierInfo = this.ratingService.getTier(playerStats);
      const displayScore = this.ratingService.getDisplayScore(playerStats);
      const color = tierColor(tierInfo.tier);
      const tierLine =
        tierInfo.tier === "Placements"
          ? formatTier(tierInfo)
          : `${formatTier(tierInfo)} — **${displayScore}/100**`;

      const statsEmbed = new EmbedBuilder()
        .setTitle(`📊 Statistiques de ${playerStats.username}`)
        .setDescription(tierLine)
        .setColor(color)
        .addFields(
          {
            name: "🏆 Rating (interne)",
            value: `${Math.round(playerStats.rating)} (RD ${Math.round(playerStats.rd)})`,
            inline: true,
          },
          {
            name: "📈 Parties",
            value: `${playerStats.totalGames}`,
            inline: true,
          },
          {
            name: "📊 W/L",
            value: `${playerStats.wins}W / ${playerStats.losses}L (${winrate}%)`,
            inline: true,
          },
          {
            name: "🌟 MVP / 💀 ACE",
            value: `${playerStats.mvpCount || 0} 🌟 / ${playerStats.aceCount || 0} 💀`,
            inline: true,
          },
          {
            name: "🎯 Cost moyen adversaires (V)",
            value: `${playerStats.avgOpponentCostWhenWin.toFixed(2)}`,
            inline: true,
          },
          {
            name: "💀 Cost moyen adversaires (D)",
            value: `${playerStats.avgOpponentCostWhenLose.toFixed(2)}`,
            inline: true,
          }
        )
        .setTimestamp();

      // Ajouter les détails par coût d'adversaire si disponibles
      if (
        playerStats.winsByOpponentCost.size > 0 ||
        playerStats.lossesByOpponentCost.size > 0
      ) {
        let costDetails = "";

        // Combiner tous les coûts uniques
        const allCosts = new Set([
          ...playerStats.winsByOpponentCost.keys(),
          ...playerStats.lossesByOpponentCost.keys(),
        ]);

        for (const cost of allCosts) {
          const wins = playerStats.winsByOpponentCost.get(cost) || 0;
          const losses = playerStats.lossesByOpponentCost.get(cost) || 0;
          const total = wins + losses;
          const winrate = total > 0 ? ((wins / total) * 100).toFixed(1) : "0.0";

          costDetails += `Cost ${cost}: ${wins}W/${losses}L (${winrate}%)\n`;
        }

        if (costDetails) {
          statsEmbed.addFields({
            name: "📊 Détails par coût d'adversaire",
            value: costDetails,
            inline: false,
          });
        }
      }

      await message.reply({ embeds: [statsEmbed] });
      Logger.info(
        `[CUSTOM_GAME] Stats affichées pour ${playerStats.username} par ${message.author.tag}`
      );
    } catch (error) {
      Logger.error(
        `[CUSTOM_GAME] Erreur affichage stats joueur: ${error.message}`
      );
      await message.reply("❌ Erreur lors de l'affichage des statistiques.");
    }
  }

  async handleLeaderboardNavigation(interaction) {
    try {
      const customId = interaction.customId;
      let targetPage = 0;

      if (customId === "leaderboard_first") {
        targetPage = 0;
      } else if (customId.startsWith("leaderboard_prev_")) {
        targetPage = parseInt(customId.split("_")[2]) - 1;
      } else if (customId.startsWith("leaderboard_next_")) {
        targetPage = parseInt(customId.split("_")[2]) + 1;
      } else if (customId.startsWith("leaderboard_last_")) {
        targetPage = parseInt(customId.split("_")[2]);
      }

      // Vérifier que la page est valide
      const playerStats = await PlayerStats.find({
        gamesPlayed: { $gte: this.ratingService.config.leaderboardMinGames },
        rd: { $lte: this.ratingService.config.leaderboardDropRD },
      }).sort({
        rating: -1,
        totalGames: -1,
      });
      const totalPages = Math.ceil(playerStats.length / 5);

      if (targetPage < 0 || targetPage >= totalPages) {
        await interaction.reply({
          content: "❌ Page invalide.",
          ephemeral: true,
        });
        return;
      }

      // Mettre à jour le message avec la nouvelle page
      await this.showLeaderboardPage(interaction, targetPage);
    } catch (error) {
      Logger.error(
        `[CUSTOM_GAME] Erreur navigation classement: ${error.message}`
      );
      await interaction.reply({
        content: "❌ Erreur lors de la navigation.",
        ephemeral: true,
      });
    }
  }

  async showLeaderboardPage(interaction, page) {
    try {
      const playerStats = await PlayerStats.find({
        gamesPlayed: { $gte: this.ratingService.config.leaderboardMinGames },
        rd: { $lte: this.ratingService.config.leaderboardDropRD },
      }).sort({
        rating: -1,
        totalGames: -1,
      });

      if (playerStats.length === 0) {
        await interaction.update({
          content: "📊 Aucune statistique disponible pour le moment.",
          embeds: [],
          components: [],
        });
        return;
      }

      // Pagination : 5 joueurs par page
      const playersPerPage = 5;
      const totalPages = Math.ceil(playerStats.length / playersPerPage);
      const startIndex = page * playersPerPage;
      const endIndex = startIndex + playersPerPage;
      const currentPagePlayers = playerStats.slice(startIndex, endIndex);

      const leaderboardEmbed = new EmbedBuilder()
        .setTitle("🏆 Classement 5v5 Custom")
        .setDescription(`Top ${playerStats.length} des joueurs par rating (placements terminés)`)
        .setColor("#ffd700")
        .setFooter({
          text: `Page ${page + 1}/${totalPages} • ${
            playerStats.length
          } joueurs total`,
        })
        .setTimestamp();

      let leaderboardText = "";
      for (let i = 0; i < currentPagePlayers.length; i++) {
        const stats = currentPagePlayers[i];
        const globalIndex = startIndex + i;
        const medal =
          globalIndex === 0
            ? "🥇"
            : globalIndex === 1
            ? "🥈"
            : globalIndex === 2
            ? "🥉"
            : `**${globalIndex + 1}.**`;

        // Calculer le winrate manuellement
        const winrate =
          stats.totalGames > 0
            ? ((stats.wins / stats.totalGames) * 100).toFixed(1)
            : "0.0";

        const tierLabel = this._displayLabel(stats);
        leaderboardText += `${medal} **${stats.username}**\n`;
        leaderboardText += `   🏆 ${tierLabel} | 📊 ${stats.wins}W/${stats.losses}L (${winrate}%) | 🎮 ${stats.totalGames} | 🌟 ${stats.mvpCount || 0} / 💀 ${stats.aceCount || 0}\n`;
        leaderboardText += "\n";
      }

      leaderboardEmbed.addFields({
        name: `Classement (${startIndex + 1}-${Math.min(
          endIndex,
          playerStats.length
        )})`,
        value: leaderboardText.trim(),
        inline: false,
      });

      // Créer les boutons de navigation
      const buttons = [];

      // Bouton "Précédent"
      if (page > 0) {
        const prevButton = new ButtonBuilder()
          .setCustomId(`leaderboard_prev_${page}`)
          .setLabel("◀️ Précédent")
          .setStyle(ButtonStyle.Secondary);
        buttons.push(prevButton);
      }

      // Bouton "Suivant"
      if (page < totalPages - 1) {
        const nextButton = new ButtonBuilder()
          .setCustomId(`leaderboard_next_${page}`)
          .setLabel("Suivant ▶️")
          .setStyle(ButtonStyle.Primary);
        buttons.push(nextButton);
      }

      // Bouton "Première page"
      if (page > 0) {
        const firstButton = new ButtonBuilder()
          .setCustomId(`leaderboard_first`)
          .setLabel("🏠 Première")
          .setStyle(ButtonStyle.Secondary);
        buttons.push(firstButton);
      }

      // Bouton "Dernière page"
      if (page < totalPages - 1) {
        const lastButton = new ButtonBuilder()
          .setCustomId(`leaderboard_last_${totalPages - 1}`)
          .setLabel("🏁 Dernière")
          .setStyle(ButtonStyle.Secondary);
        buttons.push(lastButton);
      }

      const row = new ActionRowBuilder().addComponents(buttons);

      const updateOptions = { embeds: [leaderboardEmbed] };
      if (buttons.length > 0) {
        updateOptions.components = [row];
      }

      await interaction.update(updateOptions);
      Logger.info(
        `[CUSTOM_GAME] Classement mis à jour vers page ${
          page + 1
        }/${totalPages}`
      );
    } catch (error) {
      Logger.error(
        `[CUSTOM_GAME] Erreur mise à jour classement: ${error.message}`
      );
      await interaction.reply({
        content: "❌ Erreur lors de la mise à jour du classement.",
        ephemeral: true,
      });
    }
  }
}
