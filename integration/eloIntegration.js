import { EloController } from "../controllers/eloController.js";
import { Logger } from "../utils/logger.js";

/**
 * Intégration du système Elo avec le bot Discord existant
 * Ce fichier montre comment intégrer le système Elo dans le CustomGameHandler
 */
export class EloIntegration {
  constructor() {
    this.eloController = new EloController();
  }

  /**
   * Intègre la résolution d'un match avec le système Elo
   * À appeler depuis CustomGameHandler.handleGameResult()
   *
   * @param {Object} gameResult - Résultat du match depuis CustomGameHandler
   * @param {string} resolvedBy - ID de l'admin qui résout le match
   * @returns {Object} - Résultat de la résolution Elo
   */
  async resolveMatchWithElo(gameResult, resolvedBy) {
    try {
      Logger.info(
        `[ELO_INTEGRATION] Résolution match avec système Elo par ${resolvedBy}`
      );

      // Convertir le format du CustomGameHandler vers le format Elo
      const matchData = await this.convertGameResultToMatchData(gameResult);

      // Résoudre le match avec le système Elo
      const eloResult = await this.eloController.resolveMatch(
        matchData,
        resolvedBy
      );

      Logger.info(
        `[ELO_INTEGRATION] Match résolu avec succès: ${eloResult.matchId}`
      );

      return eloResult;
    } catch (error) {
      Logger.error(
        `[ELO_INTEGRATION] Erreur résolution match: ${error.message}`
      );
      throw error;
    }
  }

  /**
   * Convertit le format du CustomGameHandler vers le format Elo
   * @param {Object} gameResult - Résultat depuis CustomGameHandler
   * @returns {Object} - Données de match pour le système Elo
   */
  async convertGameResultToMatchData(gameResult) {
    const { team1, team2, winner } = gameResult;

    Logger.info(`[ELO_INTEGRATION] Conversion - Winner reçu: ${winner}`);
    Logger.info(
      `[ELO_INTEGRATION] Team1 players: ${team1.players
        .map((p) => p.username)
        .join(", ")}`
    );
    Logger.info(
      `[ELO_INTEGRATION] Team2 players: ${team2.players
        .map((p) => p.username)
        .join(", ")}`
    );

    // Récupérer les Elos depuis PlayerStats si non présents
    const { PlayerStats } = await import("../models/PlayerStats.js");

    const matchData = {
      team1: {
        players: await Promise.all(
          team1.players.map(async (player) => {
            // Récupérer PlayerStats une seule fois
            const playerStats = await PlayerStats.findOne({
              userId: player.userId,
            });

            let elo = player.elo;
            // Si l'Elo n'est pas présent (undefined ou null), le récupérer depuis PlayerStats
            if (elo === undefined || elo === null) {
              elo = playerStats ? playerStats.elo : 1000;
              Logger.info(
                `[ELO_INTEGRATION] Elo récupéré depuis PlayerStats pour ${player.username}: ${elo}`
              );
            }
            // Récupérer aussi gamesPlayed pour le calcul du K factor
            const gamesPlayed = playerStats ? playerStats.gamesPlayed : 0;

            return {
              userId: player.userId,
              username: player.username,
              elo: elo,
              cost: player.selectedCost,
              role: player.assignedRole,
              gamesPlayed: gamesPlayed,
            };
          })
        ),
      },
      team2: {
        players: await Promise.all(
          team2.players.map(async (player) => {
            // Récupérer PlayerStats une seule fois
            const playerStats = await PlayerStats.findOne({
              userId: player.userId,
            });

            let elo = player.elo;
            // Si l'Elo n'est pas présent (undefined ou null), le récupérer depuis PlayerStats
            if (elo === undefined || elo === null) {
              elo = playerStats ? playerStats.elo : 1000;
              Logger.info(
                `[ELO_INTEGRATION] Elo récupéré depuis PlayerStats pour ${player.username}: ${elo}`
              );
            }
            // Récupérer aussi gamesPlayed pour le calcul du K factor
            const gamesPlayed = playerStats ? playerStats.gamesPlayed : 0;

            return {
              userId: player.userId,
              username: player.username,
              elo: elo,
              cost: player.selectedCost,
              role: player.assignedRole,
              gamesPlayed: gamesPlayed,
            };
          })
        ),
      },
      winner:
        winner === "team1" ? "team1" : winner === "team2" ? "team2" : winner,
      duration: gameResult.duration || null,
      victoryMargin: gameResult.victoryMargin || null,
    };

    Logger.info(
      `[ELO_INTEGRATION] Match data créé - Winner: ${matchData.winner}`
    );
    Logger.info(
      `[ELO_INTEGRATION] Team1 Elos: ${matchData.team1.players
        .map((p) => `${p.username}:${p.elo}`)
        .join(", ")}`
    );
    Logger.info(
      `[ELO_INTEGRATION] Team2 Elos: ${matchData.team2.players
        .map((p) => `${p.username}:${p.elo}`)
        .join(", ")}`
    );
    return matchData;
  }

  /**
   * Obtient les statistiques Elo d'un joueur
   * @param {string} userId - ID du joueur
   * @returns {Object} - Statistiques Elo du joueur
   */
  async getPlayerEloStats(userId) {
    try {
      return await this.eloController.getPlayerStats(userId);
    } catch (error) {
      Logger.error(
        `[ELO_INTEGRATION] Erreur récupération stats joueur: ${error.message}`
      );
      throw error;
    }
  }

  /**
   * Obtient le classement Elo
   * @param {number} limit - Nombre de joueurs à retourner
   * @returns {Array} - Classement des joueurs
   */
  async getEloLeaderboard(limit = 50) {
    try {
      return await this.eloController.getLeaderboard(limit);
    } catch (error) {
      Logger.error(
        `[ELO_INTEGRATION] Erreur récupération classement: ${error.message}`
      );
      throw error;
    }
  }

  /**
   * Met à jour la configuration du système Elo
   * @param {Object} config - Nouvelle configuration
   */
  updateEloConfig(config) {
    this.eloController.updateEloConfig(config);
    Logger.info(`[ELO_INTEGRATION] Configuration Elo mise à jour`);
  }

  /**
   * Obtient la configuration actuelle du système Elo
   * @returns {Object} - Configuration actuelle
   */
  getEloConfig() {
    return this.eloController.getEloConfig();
  }
}

/**
 * Exemple d'intégration dans CustomGameHandler
 *
 * 1. Ajouter l'import dans customGameHandler.js :
 *    import { EloIntegration } from "../integration/eloIntegration.js";
 *
 * 2. Initialiser dans le constructeur :
 *    this.eloIntegration = new EloIntegration();
 *
 * 3. Modifier handleGameResult() :
 *    async handleGameResult(interaction) {
 *      // ... code existant ...
 *
 *      // Intégrer le système Elo
 *      try {
 *        const eloResult = await this.eloIntegration.resolveMatchWithElo(
 *          this.currentGameResult,
 *          interaction.user.id
 *        );
 *
 *        // Afficher les changements d'Elo dans l'embed
 *        const eloEmbed = this.createEloResultEmbed(eloResult);
 *        await interaction.followUp({ embeds: [eloEmbed] });
 *
 *      } catch (error) {
 *        Logger.error(`Erreur système Elo: ${error.message}`);
 *        // Continuer sans le système Elo si erreur
 *      }
 *
 *      // ... reste du code existant ...
 *    }
 *
 * 4. Ajouter une méthode pour créer l'embed des résultats Elo :
 *    createEloResultEmbed(eloResult) {
 *      const embed = new EmbedBuilder()
 *        .setTitle("🏆 Changements d'Elo")
 *        .setColor("#ffd700")
 *        .setTimestamp();
 *
 *      // Ajouter les changements pour chaque joueur
 *      Object.values(eloResult.updatedPlayers).forEach(player => {
 *        const changeText = player.change > 0 ? `+${player.change}` : `${player.change}`;
 *        const emoji = player.result === "win" ? "🟢" : "🔴";
 *
 *        embed.addFields({
 *          name: `${emoji} ${player.username}`,
 *          value: `${player.oldElo} → ${player.newElo} (${changeText})`,
 *          inline: true,
 *        });
 *      });
 *
 *      return embed;
 *    }
 *
 * 5. Ajouter des commandes Discord pour le système Elo :
 *    // Dans messageHandler.js
 *    if (message.content === "!eloleaderboard") {
 *      const leaderboard = await this.eloIntegration.getEloLeaderboard(10);
 *      // Afficher le classement Elo
 *    }
 *
 *    if (message.content.startsWith("!elostats ")) {
 *      const userId = parseDiscordId(message.content.split(" ")[1]);
 *      const stats = await this.eloIntegration.getPlayerEloStats(userId);
 *      // Afficher les stats Elo du joueur
 *    }
 */
