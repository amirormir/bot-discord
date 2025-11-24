import { Logger } from "../utils/logger.js";
import { TeamService } from "../services/teamService.js";
import { EmbedBuilder } from "discord.js";

export class TeamCommandHandler {
  constructor() {
    this.teamService = new TeamService();
  }

  /**
   * Vérifie si l'utilisateur a les permissions admin
   * @param {GuildMember} member - Le membre Discord
   * @returns {boolean}
   */
  hasAdminPermission(member) {
    return member.permissions.has("Administrator");
  }

  /**
   * Gère la commande /team create
   * @param {ChatInputCommandInteraction} interaction - L'interaction Discord
   */
  async handleCreate(interaction) {
    try {
      // Vérifier les permissions
      if (!this.hasAdminPermission(interaction.member)) {
        await interaction.reply({
          content:
            "❌ Vous devez avoir la permission **Administrateur** pour utiliser cette commande.",
          ephemeral: true,
        });
        return;
      }

      const name = interaction.options.getString("name", true);
      const tag = interaction.options.getString("tag", false);

      // Validation basique
      if (!name || name.trim().length === 0) {
        await interaction.reply({
          content: "❌ Le nom de la team ne peut pas être vide.",
          ephemeral: true,
        });
        return;
      }

      if (name.length > 50) {
        await interaction.reply({
          content: "❌ Le nom de la team ne peut pas dépasser 50 caractères.",
          ephemeral: true,
        });
        return;
      }

      if (tag && tag.length > 10) {
        await interaction.reply({
          content: "❌ Le tag ne peut pas dépasser 10 caractères.",
          ephemeral: true,
        });
        return;
      }

      // Créer la team
      const team = await this.teamService.createTeam(
        interaction.guildId,
        name,
        tag
      );

      // Créer l'embed de réponse
      const embed = new EmbedBuilder()
        .setTitle("✅ Team créée avec succès")
        .setDescription(`La team **${team.name}** a été créée.`)
        .addFields(
          {
            name: "Nom",
            value: team.name,
            inline: true,
          },
          {
            name: "Tag",
            value: team.tag || "Aucun",
            inline: true,
          },
          {
            name: "Joueurs",
            value: `${team.players.length}/∞`,
            inline: true,
          }
        )
        .setColor("#00ff00")
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });

      Logger.info(
        `[TEAM_COMMAND] Team créée par ${interaction.user.tag} - Name: ${team.name}`
      );
    } catch (error) {
      Logger.error(
        `[TEAM_COMMAND] Erreur lors de la création de la team: ${error.message}`
      );

      await interaction.reply({
        content: `❌ Erreur: ${error.message}`,
        ephemeral: true,
      });
    }
  }

  /**
   * Gère la commande /team add-player
   * @param {ChatInputCommandInteraction} interaction - L'interaction Discord
   */
  async handleAddPlayer(interaction) {
    try {
      // Vérifier les permissions
      if (!this.hasAdminPermission(interaction.member)) {
        await interaction.reply({
          content:
            "❌ Vous devez avoir la permission **Administrateur** pour utiliser cette commande.",
          ephemeral: true,
        });
        return;
      }

      const teamOption = interaction.options.getString("team", true);
      const user = interaction.options.getUser("user", true);
      const pseudo = interaction.options.getString("pseudo", true);

      // Validation
      if (!pseudo || pseudo.trim().length === 0) {
        await interaction.reply({
          content: "❌ Le pseudo ne peut pas être vide.",
          ephemeral: true,
        });
        return;
      }

      if (pseudo.length > 50) {
        await interaction.reply({
          content: "❌ Le pseudo ne peut pas dépasser 50 caractères.",
          ephemeral: true,
        });
        return;
      }

      // Récupérer la team (peut être un ID ou un nom)
      let team;
      if (teamOption.match(/^[0-9a-fA-F]{24}$/)) {
        // C'est un ID MongoDB
        team = await this.teamService.getTeamById(teamOption);
      } else {
        // C'est probablement un nom, chercher dans le serveur
        const teams = await this.teamService.getTeamsByGuild(
          interaction.guildId
        );
        team = teams.find(
          (t) => t.name.toLowerCase() === teamOption.toLowerCase()
        );
      }

      if (!team) {
        await interaction.reply({
          content: "❌ Team non trouvée. Vérifiez le nom ou l'ID de la team.",
          ephemeral: true,
        });
        return;
      }

      // Vérifier que la team appartient bien au serveur
      if (team.guildId !== interaction.guildId) {
        await interaction.reply({
          content: "❌ Cette team n'appartient pas à ce serveur.",
          ephemeral: true,
        });
        return;
      }

      // Ajouter le joueur
      const updatedTeam = await this.teamService.addPlayer(
        team._id.toString(),
        user.id,
        pseudo
      );

      // Créer l'embed de réponse
      const embed = new EmbedBuilder()
        .setTitle("✅ Joueur ajouté avec succès")
        .setDescription(
          `**${user.tag}** (${pseudo}) a été ajouté à la team **${updatedTeam.name}**.`
        )
        .addFields(
          {
            name: "Team",
            value: updatedTeam.name,
            inline: true,
          },
          {
            name: "Joueurs",
            value: `${updatedTeam.players.length}/∞`,
            inline: true,
          }
        )
        .setColor("#00ff00")
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });

      Logger.info(
        `[TEAM_COMMAND] Joueur ajouté par ${interaction.user.tag} - Team: ${updatedTeam.name}, User: ${user.tag}`
      );
    } catch (error) {
      Logger.error(
        `[TEAM_COMMAND] Erreur lors de l'ajout du joueur: ${error.message}`
      );

      await interaction.reply({
        content: `❌ Erreur: ${error.message}`,
        ephemeral: true,
      });
    }
  }

  /**
   * Gère la commande /team view (accessible à tous)
   * @param {ChatInputCommandInteraction} interaction - L'interaction Discord
   */
  async handleView(interaction) {
    try {
      // Pas de vérification de permission - accessible à tous pour voir les teams
      const teamOption = interaction.options.getString("team", true);

      // Récupérer la team (peut être un ID ou un nom)
      let team;
      if (teamOption.match(/^[0-9a-fA-F]{24}$/)) {
        // C'est un ID MongoDB
        team = await this.teamService.getTeamById(teamOption);
      } else {
        // C'est probablement un nom, chercher dans le serveur
        const teams = await this.teamService.getTeamsByGuild(
          interaction.guildId
        );
        team = teams.find(
          (t) => t.name.toLowerCase() === teamOption.toLowerCase()
        );
      }

      if (!team) {
        await interaction.reply({
          content: "❌ Team non trouvée. Vérifiez le nom ou l'ID de la team.",
          ephemeral: true,
        });
        return;
      }

      // Vérifier que la team appartient bien au serveur
      if (team.guildId !== interaction.guildId) {
        await interaction.reply({
          content: "❌ Cette team n'appartient pas à ce serveur.",
          ephemeral: true,
        });
        return;
      }

      // Créer l'embed avec les informations de la team
      const embed = new EmbedBuilder()
        .setTitle(`📋 Team: ${team.name}`)
        .setDescription(
          team.tag ? `Tag: **${team.tag}**` : "Aucun tag défini"
        )
        .addFields(
          {
            name: "ID",
            value: team._id.toString(),
            inline: true,
          },
          {
            name: "Joueurs",
            value: `${team.players.length}`,
            inline: true,
          },
          {
            name: "Créée le",
            value: `<t:${Math.floor(team.createdAt.getTime() / 1000)}:F>`,
            inline: true,
          }
        )
        .setColor("#0099ff")
        .setTimestamp();

      // Ajouter la liste des joueurs si il y en a
      if (team.players.length > 0) {
        const playersList = team.players
          .map(
            (player, index) =>
              `${index + 1}. <@${player.discordUserId}> - **${player.pseudo}**`
          )
          .join("\n");

        // Discord limite les fields à 1024 caractères, donc on peut avoir besoin de tronquer
        const maxLength = 1024;
        const truncatedList =
          playersList.length > maxLength
            ? playersList.substring(0, maxLength - 3) + "..."
            : playersList;

        embed.addFields({
          name: "👥 Joueurs",
          value: truncatedList || "Aucun joueur",
          inline: false,
        });
      } else {
        embed.addFields({
          name: "👥 Joueurs",
          value: "Aucun joueur dans cette team pour le moment.",
          inline: false,
        });
      }

      await interaction.reply({ embeds: [embed] });

      Logger.info(
        `[TEAM_COMMAND] Team consultée par ${interaction.user.tag} - Team: ${team.name}`
      );
    } catch (error) {
      Logger.error(
        `[TEAM_COMMAND] Erreur lors de la consultation de la team: ${error.message}`
      );

      await interaction.reply({
        content: `❌ Erreur: ${error.message}`,
        ephemeral: true,
      });
    }
  }

  /**
   * Gère l'autocomplete pour le champ "team"
   * @param {AutocompleteInteraction} interaction - L'interaction d'autocomplete
   */
  async handleAutocomplete(interaction) {
    try {
      const focusedValue = interaction.options.getFocused();
      const guildId = interaction.guildId;

      if (!guildId) {
        await interaction.respond([]);
        return;
      }

      // Récupérer toutes les teams du serveur
      const teams = await this.teamService.getTeamsByGuild(guildId);

      // Filtrer selon la valeur saisie
      const filtered = teams
        .filter((team) => {
          const nameMatch = team.name
            .toLowerCase()
            .includes(focusedValue.toLowerCase());
          const tagMatch = team.tag
            ? team.tag.toLowerCase().includes(focusedValue.toLowerCase())
            : false;
          const idMatch = team._id.toString().startsWith(focusedValue);

          return nameMatch || tagMatch || idMatch;
        })
        .slice(0, 25); // Discord limite à 25 choix

      // Formater les réponses pour l'autocomplete
      const choices = filtered.map((team) => ({
        name: `${team.name}${team.tag ? ` [${team.tag}]` : ""} (${team.players.length} joueur${team.players.length > 1 ? "s" : ""})`,
        value: team._id.toString(), // Utiliser l'ID pour une recherche plus fiable
      }));

      await interaction.respond(choices);
    } catch (error) {
      Logger.error(
        `[TEAM_COMMAND] Erreur lors de l'autocomplete: ${error.message}`
      );
      await interaction.respond([]);
    }
  }
}

