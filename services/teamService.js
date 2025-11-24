import { Logger } from "../utils/logger.js";
import { Team } from "../models/Team.js";

export class TeamService {
  /**
   * Crée une nouvelle team
   * @param {string} guildId - ID du serveur Discord
   * @param {string} name - Nom de la team
   * @param {string|null} tag - Tag optionnel de la team
   * @returns {Promise<Object>} - La team créée
   * @throws {Error} - Si une team avec le même nom existe déjà sur le serveur
   */
  async createTeam(guildId, name, tag = null) {
    try {
      Logger.info(
        `[TEAM_SERVICE] Création d'une team - Guild: ${guildId}, Name: ${name}, Tag: ${tag || "aucun"}`
      );

      // Vérifier qu'il n'y a pas déjà une team avec le même nom sur ce serveur
      const existingTeam = await Team.findOne({
        guildId: guildId,
        name: { $regex: new RegExp(`^${name}$`, "i") }, // Case-insensitive
      });

      if (existingTeam) {
        Logger.warning(
          `[TEAM_SERVICE] Une team avec le nom "${name}" existe déjà sur ce serveur`
        );
        throw new Error(
          `Une team avec le nom "${name}" existe déjà sur ce serveur.`
        );
      }

      // Créer la team
      const team = await Team.create({
        guildId: guildId,
        name: name.trim(),
        tag: tag ? tag.trim() : null,
        players: [],
      });

      Logger.info(
        `[TEAM_SERVICE] Team créée avec succès - ID: ${team._id}, Name: ${team.name}`
      );

      return team;
    } catch (error) {
      Logger.error(
        `[TEAM_SERVICE] Erreur lors de la création de la team: ${error.message}`
      );

      // Si c'est une erreur de doublon MongoDB, relancer avec un message plus clair
      if (error.code === 11000) {
        throw new Error(
          `Une team avec le nom "${name}" existe déjà sur ce serveur.`
        );
      }

      throw error;
    }
  }

  /**
   * Ajoute un joueur à une team
   * @param {string} teamId - ID de la team
   * @param {string} discordUserId - ID Discord du joueur
   * @param {string} pseudo - Pseudo du joueur
   * @returns {Promise<Object>} - La team mise à jour
   * @throws {Error} - Si la team n'existe pas ou si le joueur est déjà présent
   */
  async addPlayer(teamId, discordUserId, pseudo) {
    try {
      Logger.info(
        `[TEAM_SERVICE] Ajout d'un joueur - Team ID: ${teamId}, User ID: ${discordUserId}, Pseudo: ${pseudo}`
      );

      // Récupérer la team
      const team = await Team.findById(teamId);

      if (!team) {
        Logger.warning(`[TEAM_SERVICE] Team non trouvée - ID: ${teamId}`);
        throw new Error("Team non trouvée.");
      }

      // Vérifier que le joueur n'est pas déjà dans la team
      const playerExists = team.players.some(
        (player) => player.discordUserId === discordUserId
      );

      if (playerExists) {
        Logger.warning(
          `[TEAM_SERVICE] Le joueur ${discordUserId} est déjà dans la team ${team.name}`
        );
        throw new Error("Ce joueur est déjà présent dans cette team.");
      }

      // Ajouter le joueur
      team.players.push({
        discordUserId: discordUserId,
        pseudo: pseudo.trim(),
        addedAt: new Date(),
      });

      await team.save();

      Logger.info(
        `[TEAM_SERVICE] Joueur ajouté avec succès - Team: ${team.name}, Joueur: ${pseudo}`
      );

      return team;
    } catch (error) {
      Logger.error(
        `[TEAM_SERVICE] Erreur lors de l'ajout du joueur: ${error.message}`
      );
      throw error;
    }
  }

  /**
   * Récupère une team par son ID
   * @param {string} teamId - ID de la team
   * @returns {Promise<Object|null>} - La team ou null si non trouvée
   */
  async getTeamById(teamId) {
    try {
      const team = await Team.findById(teamId);
      return team;
    } catch (error) {
      Logger.error(
        `[TEAM_SERVICE] Erreur lors de la récupération de la team: ${error.message}`
      );
      throw error;
    }
  }

  /**
   * Récupère toutes les teams d'un serveur
   * @param {string} guildId - ID du serveur Discord
   * @returns {Promise<Array>} - Liste des teams
   */
  async getTeamsByGuild(guildId) {
    try {
      const teams = await Team.find({ guildId: guildId }).sort({
        createdAt: -1,
      });
      return teams;
    } catch (error) {
      Logger.error(
        `[TEAM_SERVICE] Erreur lors de la récupération des teams: ${error.message}`
      );
      throw error;
    }
  }
}

