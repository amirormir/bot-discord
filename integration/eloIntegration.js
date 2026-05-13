import { EloController } from "../controllers/eloController.js";
import { Logger } from "../utils/logger.js";

/**
 * Integration layer between the bot's game flow and the rating system.
 * Class name kept (EloIntegration) for backward compatibility with imports.
 */
export class EloIntegration {
  constructor() {
    this.eloController = new EloController();
    this.ratingService = this.eloController.getRatingService();
  }

  async resolveMatchWithElo(gameResult, resolvedBy) {
    try {
      Logger.info(
        `[RATING_INTEGRATION] Résolution match par ${resolvedBy}`
      );
      const matchData = await this.convertGameResultToMatchData(gameResult);
      const result = await this.eloController.resolveMatch(matchData, resolvedBy);
      Logger.info(`[RATING_INTEGRATION] Match résolu: ${result.matchId}`);
      return result;
    } catch (error) {
      Logger.error(`[RATING_INTEGRATION] Erreur résolution: ${error.message}`);
      throw error;
    }
  }

  async convertGameResultToMatchData(gameResult) {
    const { team1, team2, winner } = gameResult;
    const { PlayerStats } = await import("../models/PlayerStats.js");

    const enrich = async (player) => {
      let playerStats = await PlayerStats.findOne({ userId: player.userId });
      if (!playerStats) {
        const defaults = this.ratingService.defaultPlayerFields();
        playerStats = await PlayerStats.create({
          userId: player.userId,
          username: player.username,
          ...defaults,
        });
      }
      return {
        userId: player.userId,
        username: player.username,
        rating: playerStats.rating,
        rd: playerStats.rd,
        volatility: playerStats.volatility,
        gamesPlayed: playerStats.gamesPlayed,
        cost: player.selectedCost,
        role: player.assignedRole,
      };
    };

    return {
      team1: { players: await Promise.all(team1.players.map(enrich)) },
      team2: { players: await Promise.all(team2.players.map(enrich)) },
      winner,
      mvpUserId: gameResult.mvpUserId || null,
      aceUserId: gameResult.aceUserId || null,
      duration: gameResult.duration || null,
      victoryMargin: gameResult.victoryMargin || null,
    };
  }

  async getPlayerEloStats(userId) {
    return await this.eloController.getPlayerStats(userId);
  }

  async getEloLeaderboard(limit = 50) {
    return await this.eloController.getLeaderboard(limit);
  }

  updateEloConfig(config) {
    this.eloController.updateEloConfig(config);
  }

  getEloConfig() {
    return this.eloController.getEloConfig();
  }
}
