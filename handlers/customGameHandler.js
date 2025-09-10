import { Logger } from "../utils/logger.js";
import { Player } from "../models/Player.js";
import { Queue } from "../models/Queue.js";
import { PlayerStats } from "../models/PlayerStats.js";
import { GameResult } from "../models/GameResult.js";
import { TeamBuilder } from "../utils/teamBuilder.js";
import { EloIntegration } from "../integration/eloIntegration.js";
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
    this.eloIntegration = new EloIntegration(); // Intégration du système Elo
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
        playerStats = await PlayerStats.create({
          userId: interaction.user.id,
          username: interaction.user.username,
          elo: 1000,
          gamesPlayed: 0,
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

  async startRoleSelection(channel, queue) {
    // Cette méthode n'est plus utilisée - supprimée
  }

  async startCostSelection(channel, queue) {
    // Cette méthode n'est plus utilisée - supprimée
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
      // Récupérer les Elo des joueurs pour l'affichage
      const team1WithElo = await Promise.all(
        result.team1.map(async (p) => {
          const playerStats = await PlayerStats.findOne({ userId: p.userId });
          const elo = playerStats ? playerStats.elo : 1000;
          return { ...p, elo };
        })
      );

      const team2WithElo = await Promise.all(
        result.team2.map(async (p) => {
          const playerStats = await PlayerStats.findOne({ userId: p.userId });
          const elo = playerStats ? playerStats.elo : 1000;
          return { ...p, elo };
        })
      );

      const detailsEmbed = new EmbedBuilder()
        .setTitle("📋 Détails des Choix")
        .setDescription("Rôles demandés vs rôles assignés")
        .setColor("#ffff00")
        .addFields(
          {
            name: "🔵 Équipe 1",
            value: team1WithElo
              .map(
                (p) =>
                  `<@${p.userId}>: **${p.selectedRole}** → **${p.assignedRole}** (Niveau ${p.selectedCost} - Elo ${p.elo})`
              )
              .join("\n"),
            inline: false,
          },
          {
            name: "🔴 Équipe 2",
            value: team2WithElo
              .map(
                (p) =>
                  `<@${p.userId}>: **${p.selectedRole}** → **${p.assignedRole}** (Niveau ${p.selectedCost} - Elo ${p.elo})`
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

      // Stocker le résultat de la partie en cours
      this.currentGameResult = {
        team1: {
          players: result.team1,
          averageCost: result.team1Cost,
        },
        team2: {
          players: result.team2,
          averageCost: result.team2Cost,
        },
        costDifference: result.costDifference,
      };

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

      this.currentQueue = null;
      this.queueMessage = null; // Reset de l'embed
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

      // Mettre à jour l'embed
      await this.updateQueueEmbed(message.channel, queue);

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

      // Ajouter les joueurs complets avec leur Elo
      if (completePlayers.length > 0) {
        const completeList = await Promise.all(
          completePlayers.map(async (p) => {
            const playerStats = await PlayerStats.findOne({ userId: p.userId });
            const elo = playerStats ? playerStats.elo : 1000;
            return `• ${p.username} (${p.selectedRole} - Niveau ${p.selectedCost}) - Elo: ${elo}`;
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

  // Nouvelles méthodes pour gérer les résultats des parties

  async handleGameResult(interaction) {
    try {
      // Vérifier que l'utilisateur est admin
      if (!interaction.member.permissions.has("Administrator")) {
        await interaction.reply({
          content:
            "❌ Seuls les administrateurs peuvent déclarer le gagnant d'une partie.",
          ephemeral: true,
        });
        return;
      }

      if (!this.currentGameResult) {
        await interaction.reply({
          content: "❌ Aucune partie en cours à terminer.",
          ephemeral: true,
        });
        return;
      }

      const winner = interaction.customId === "team1_win" ? "team1" : "team2";
      const winnerTeam = this.currentGameResult[winner];
      const loserTeam =
        this.currentGameResult[winner === "team1" ? "team2" : "team1"];

      Logger.info(
        `[CUSTOM_GAME] Déclaration de victoire par ${interaction.user.tag} - Gagnant: ${winner}`
      );

      // Sauvegarder le résultat de la partie
      const gameResult = await GameResult.create({
        gameId: `game_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        winner: winner,
        team1: this.currentGameResult.team1,
        team2: this.currentGameResult.team2,
        costDifference: this.currentGameResult.costDifference,
        endedBy: interaction.user.id,
      });

      Logger.info(
        `[CUSTOM_GAME] Résultat sauvegardé avec ID: ${gameResult.gameId}`
      );

      // Mettre à jour les statistiques des joueurs (ancien système)
      await this.updatePlayerStats(winnerTeam, loserTeam, true);
      await this.updatePlayerStats(loserTeam, winnerTeam, false);

      // Intégrer le système Elo
      try {
        const eloResult = await this.eloIntegration.resolveMatchWithElo(
          this.currentGameResult,
          interaction.user.id
        );

        // Afficher les changements d'Elo dans l'embed
        const eloEmbed = this.createEloResultEmbed(eloResult);
        await interaction.followUp({ embeds: [eloEmbed] });
      } catch (error) {
        Logger.error(`[CUSTOM_GAME] Erreur système Elo: ${error.message}`);
        // Continuer sans le système Elo si erreur
      }

      // Créer l'embed de résultat
      const resultEmbed = new EmbedBuilder()
        .setTitle("🏆 Résultat de la Partie")
        .setDescription(
          `**${
            winner === "team1" ? "🔵 Équipe 1" : "🔴 Équipe 2"
          }** remporte la victoire !`
        )
        .addFields(
          {
            name: "🔵 Équipe 1",
            value: `Cost moyen: ${this.currentGameResult.team1.averageCost.toFixed(
              2
            )}`,
            inline: true,
          },
          {
            name: "🔴 Équipe 2",
            value: `Cost moyen: ${this.currentGameResult.team2.averageCost.toFixed(
              2
            )}`,
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

      await interaction.reply({
        content: "✅ Résultat enregistré !",
        embeds: [resultEmbed],
      });

      // Réinitialiser le résultat de la partie en cours
      this.currentGameResult = null;

      Logger.info(
        `[CUSTOM_GAME] Partie terminée - Gagnant: ${winner} par ${interaction.user.tag}`
      );
    } catch (error) {
      Logger.error(`[CUSTOM_GAME] Erreur gestion résultat: ${error.message}`);
      await interaction.reply({
        content: "❌ Erreur lors de l'enregistrement du résultat.",
        ephemeral: true,
      });
    }
  }

  createEloResultEmbed(eloResult) {
    const embed = new EmbedBuilder()
      .setTitle("🏆 Changements d'Elo")
      .setColor("#ffd700")
      .setTimestamp();

    // Ajouter les changements pour chaque joueur
    Object.values(eloResult.updatedPlayers).forEach((player) => {
      const changeText =
        player.change > 0 ? `+${player.change}` : `${player.change}`;
      const emoji = player.result === "win" ? "🟢" : "🔴";

      embed.addFields({
        name: `${emoji} ${player.username}`,
        value: `${player.oldElo} → ${player.newElo} (${changeText})`,
        inline: true,
      });
    });

    return embed;
  }

  async updatePlayerStats(team, opponentTeam, isWin) {
    try {
      const opponentCost = opponentTeam.averageCost;

      Logger.info(
        `[CUSTOM_GAME] Mise à jour stats pour équipe ${
          isWin ? "gagnante" : "perdante"
        } (${team.players.length} joueurs)`
      );

      for (const player of team.players) {
        Logger.info(
          `[CUSTOM_GAME] Traitement joueur: ${player.username} (${player.userId})`
        );

        // Trouver ou créer les statistiques du joueur
        let playerStats = await PlayerStats.findOne({ userId: player.userId });

        if (!playerStats) {
          Logger.info(
            `[CUSTOM_GAME] Création nouvelle fiche stats pour ${player.username}`
          );
          playerStats = await PlayerStats.create({
            userId: player.userId,
            username: player.username,
            wins: 0,
            losses: 0,
            totalGames: 0,
            avgOpponentCostWhenWin: 0,
            avgOpponentCostWhenLose: 0,
            winsByOpponentCost: new Map(),
            lossesByOpponentCost: new Map(),
          });
        }

        // Mettre à jour les statistiques manuellement pour éviter les problèmes avec les méthodes virtuelles
        playerStats.totalGames++;

        if (isWin) {
          playerStats.wins++;
          // Mettre à jour le coût moyen des adversaires quand on gagne
          if (playerStats.wins === 1) {
            playerStats.avgOpponentCostWhenWin = opponentCost;
          } else {
            const totalCostWhenWin =
              playerStats.avgOpponentCostWhenWin * (playerStats.wins - 1) +
              opponentCost;
            playerStats.avgOpponentCostWhenWin =
              totalCostWhenWin / playerStats.wins;
          }

          // Incrémenter le compteur de victoires pour ce coût d'adversaire (utiliser un entier)
          const costKey = Math.round(opponentCost).toString(); // Arrondir à l'entier le plus proche
          const currentWins = playerStats.winsByOpponentCost.get(costKey) || 0;
          playerStats.winsByOpponentCost.set(costKey, currentWins + 1);

          Logger.info(
            `[CUSTOM_GAME] Victoire pour ${
              player.username
            } contre cost ${opponentCost.toFixed(2)} (clé: ${costKey})`
          );
        } else {
          playerStats.losses++;
          // Mettre à jour le coût moyen des adversaires quand on perd
          if (playerStats.losses === 1) {
            playerStats.avgOpponentCostWhenLose = opponentCost;
          } else {
            const totalCostWhenLose =
              playerStats.avgOpponentCostWhenLose * (playerStats.losses - 1) +
              opponentCost;
            playerStats.avgOpponentCostWhenLose =
              totalCostWhenLose / playerStats.losses;
          }

          // Incrémenter le compteur de défaites pour ce coût d'adversaire (utiliser un entier)
          const costKey = Math.round(opponentCost).toString(); // Arrondir à l'entier le plus proche
          const currentLosses =
            playerStats.lossesByOpponentCost.get(costKey) || 0;
          playerStats.lossesByOpponentCost.set(costKey, currentLosses + 1);

          Logger.info(
            `[CUSTOM_GAME] Défaite pour ${
              player.username
            } contre cost ${opponentCost.toFixed(2)} (clé: ${costKey})`
          );
        }

        playerStats.lastUpdated = new Date();

        // Sauvegarder les modifications
        await playerStats.save();

        Logger.info(
          `[CUSTOM_GAME] Stats mises à jour pour ${player.username}: ${playerStats.wins}W/${playerStats.losses}L (${playerStats.totalGames} parties total)`
        );
      }
    } catch (error) {
      Logger.error(`[CUSTOM_GAME] Erreur mise à jour stats: ${error.message}`);
      throw error; // Propager l'erreur pour la gestion en amont
    }
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
      const playerStats = await PlayerStats.find({}).sort({
        elo: -1,
        gamesPlayed: -1,
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
        .setDescription(`Top ${playerStats.length} des joueurs par Elo`)
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

        leaderboardText += `${medal} **${stats.username}**\n`;
        leaderboardText += `   🏆 Elo: ${stats.elo}\n`;
        leaderboardText += `   📊 ${stats.wins}W/${stats.losses}L (${winrate}%)\n`;
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

      // Calculer le winrate manuellement
      const winrate =
        playerStats.totalGames > 0
          ? ((playerStats.wins / playerStats.totalGames) * 100).toFixed(1)
          : "0.0";

      const statsEmbed = new EmbedBuilder()
        .setTitle(`📊 Statistiques de ${playerStats.username}`)
        .setColor("#00ff00")
        .addFields(
          {
            name: "📈 Général",
            value: `Parties: ${playerStats.totalGames}\nVictoires: ${playerStats.wins}\nDéfaites: ${playerStats.losses}\nWinrate: ${winrate}%`,
            inline: true,
          },
          {
            name: "🎯 Victoires",
            value: `Cost moyen adversaires: ${playerStats.avgOpponentCostWhenWin.toFixed(
              2
            )}`,
            inline: true,
          },
          {
            name: "💀 Défaites",
            value: `Cost moyen adversaires: ${playerStats.avgOpponentCostWhenLose.toFixed(
              2
            )}`,
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
      const playerStats = await PlayerStats.find({}).sort({
        wins: -1,
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
      const playerStats = await PlayerStats.find({}).sort({
        elo: -1,
        gamesPlayed: -1,
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
        .setDescription(`Top ${playerStats.length} des joueurs par Elo`)
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

        leaderboardText += `${medal} **${stats.username}**\n`;
        leaderboardText += `   🏆 Elo: ${stats.elo}\n`;
        leaderboardText += `   📊 ${stats.wins}W/${stats.losses}L (${winrate}%)\n`;
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
