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
    this.queueMessage = null; // Ajout de cette propriété
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

      Logger.info(`[CUSTOM_GAME] Queue 5v5 démarrée par ${message.author.tag}`);

      // Initialiser l'embed de la queue
      await this.updateQueueEmbed(message.channel, queue);

      await message.reply(
        "✅ Queue 5v5 démarrée ! Utilisez le bouton pour rejoindre."
      );
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

      // Rôles disponibles (max 2 par rôle)
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
        if (roleCounts[role.value] < 2) {
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

      // Vérifier si le rôle est locké
      if (roleCounts[selectedRole] >= 2) {
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
      const detailsEmbed = new EmbedBuilder()
        .setTitle("📋 Détails des Choix")
        .setDescription("Rôles demandés vs rôles assignés")
        .setColor("#ffff00")
        .addFields(
          {
            name: "🔵 Équipe 1",
            value: result.team1
              .map(
                (p) =>
                  `<@${p.userId}>: **${p.selectedRole}** → **${p.assignedRole}** (Niveau ${p.selectedCost})`
              )
              .join("\n"),
            inline: false,
          },
          {
            name: "🔴 Équipe 2",
            value: result.team2
              .map(
                (p) =>
                  `<@${p.userId}>: **${p.selectedRole}** → **${p.assignedRole}** (Niveau ${p.selectedCost})`
              )
              .join("\n"),
            inline: false,
          }
        );

      await channel.send({
        content: `<@${result.team1
          .map((p) => p.userId)
          .join("> <@")}> <@${result.team2.map((p) => p.userId).join("> <@")}>`,
        embeds: [summaryEmbed, team1Embed, team2Embed, detailsEmbed],
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
        .setColor("#00ff00")
        .setTimestamp();

      // Ajouter les rôles lockés
      if (lockedRoles.length > 0) {
        embed.addFields({
          name: "🔒 Rôles lockés",
          value: lockedRoles.join(", "),
          inline: false,
        });
      }

      // Ajouter la liste des joueurs complets avec leurs infos
      if (completePlayers.length > 0) {
        const playerList = completePlayers
          .map(
            (p) =>
              `<@${p.userId}> - **${p.selectedRole}** (Niveau ${p.selectedCost})`
          )
          .join("\n");
        embed.addFields({
          name: "Joueurs inscrits",
          value: playerList,
          inline: false,
        });
      }

      // Ajouter la liste des joueurs incomplets
      if (incompletePlayers.length > 0) {
        const incompleteList = incompletePlayers
          .map((p) => `<@${p.userId}> - En cours de sélection`)
          .join("\n");
        embed.addFields({
          name: "En cours de sélection",
          value: incompleteList,
          inline: false,
        });
      }

      // Créer le bouton de rejointe
      const joinButton = new ButtonBuilder()
        .setCustomId("join_queue")
        .setLabel("Rejoindre la Queue")
        .setStyle(ButtonStyle.Primary)
        .setEmoji("➕");

      // Créer le bouton de quitte
      const leaveButton = new ButtonBuilder()
        .setCustomId("leave_queue")
        .setLabel("Quitter la Queue")
        .setStyle(ButtonStyle.Danger)
        .setEmoji("➖");

      const row = new ActionRowBuilder().addComponents(joinButton, leaveButton);

      // Envoyer ou mettre à jour l'embed
      if (this.queueMessage) {
        await this.queueMessage.edit({ embeds: [embed], components: [row] });
      } else {
        this.queueMessage = await channel.send({
          embeds: [embed],
          components: [row],
        });
      }
    } catch (error) {
      Logger.error(`[CUSTOM_GAME] Erreur update embed: ${error.message}`);
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
}
