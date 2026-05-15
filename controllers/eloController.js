import { Logger } from "../utils/logger.js";
import { RatingService } from "../services/ratingService.js";
import { PlayerStats } from "../models/PlayerStats.js";
import { Match } from "../models/Match.js";

/**
 * Controller for the rating system (Glicko-2 + tiers).
 * Named EloController only for legacy import paths.
 */
export class EloController {
  constructor() {
    this.ratingService = new RatingService();
  }

  async resolveMatch(matchData, resolvedBy, options = {}) {
    try {
      const { sourceGameKey = null } = options;
      Logger.info(`[RATING_CONTROLLER] Résolution du match par ${resolvedBy}`);

      const validation = this.validateMatchData(matchData);
      if (!validation.valid) {
        throw new Error(`Données de match invalides: ${validation.error}`);
      }

      if (sourceGameKey) {
        const existingMatch = await Match.findOne({ sourceGameKey });
        if (existingMatch) {
          const duplicateError = new Error(
            `Cette partie a deja ete resolue (${existingMatch.matchId}).`
          );
          duplicateError.code = "MATCH_ALREADY_RESOLVED";
          throw duplicateError;
        }
      }

      const matchId = `match_${Date.now()}_${Math.random()
        .toString(36)
        .substr(2, 9)}`;

      const playersStats = await this.getOrCreatePlayersStats(matchData);

      const now = new Date();
      const inflatedMatchData = this._inflateRDs(matchData, playersStats, now);

      const ratingCalculations =
        this.ratingService.calculateMatchRatingChanges(inflatedMatchData);

      const updatedPlayers = await this.updatePlayersRating(
        playersStats,
        ratingCalculations,
        matchId,
        now
      );

      const savedMatch = await this.saveMatch(
        inflatedMatchData,
        ratingCalculations,
        matchId,
        resolvedBy,
        sourceGameKey
      );

      Logger.info(`[RATING_CONTROLLER] Match résolu avec succès: ${matchId}`);

      return {
        success: true,
        matchId,
        match: savedMatch,
        updatedPlayers,
        matchSummary: ratingCalculations.matchSummary,
      };
    } catch (error) {
      Logger.error(`[RATING_CONTROLLER] Erreur résolution match: ${error.message}`);
      throw error;
    }
  }

  validateMatchData(matchData) {
    if (!matchData.team1 || !matchData.team2) {
      return { valid: false, error: "Équipes manquantes" };
    }
    if (!matchData.team1.players || !matchData.team2.players) {
      return { valid: false, error: "Joueurs des équipes manquants" };
    }
    if (
      matchData.team1.players.length !== 5 ||
      matchData.team2.players.length !== 5
    ) {
      return {
        valid: false,
        error: "Chaque équipe doit avoir exactement 5 joueurs",
      };
    }
    if (!matchData.winner || !["team1", "team2"].includes(matchData.winner)) {
      return { valid: false, error: "Gagnant invalide" };
    }
    const allPlayers = [...matchData.team1.players, ...matchData.team2.players];
    for (const player of allPlayers) {
      if (!player.userId || !player.username || player.rating == null) {
        return {
          valid: false,
          error: `Données joueur incomplètes: ${player.username || "Unknown"}`,
        };
      }
    }
    return { valid: true };
  }

  async getOrCreatePlayersStats(matchData) {
    const allPlayers = [...matchData.team1.players, ...matchData.team2.players];
    const playersStats = {};

    for (const player of allPlayers) {
      let playerStats = await PlayerStats.findOne({ userId: player.userId });
      if (!playerStats) {
        const defaults = this.ratingService.defaultPlayerFields();
        playerStats = await PlayerStats.create({
          userId: player.userId,
          username: player.username,
          ...defaults,
        });
        Logger.info(
          `[RATING_CONTROLLER] Nouvelles statistiques créées pour ${player.username}`
        );
      }
      playersStats[player.userId] = playerStats;
    }
    return playersStats;
  }

  /**
   * Inflate each player's RD for inactivity BEFORE the match is computed.
   * Returns a new matchData with the inflated rd values; persists them on playersStats.
   */
  _inflateRDs(matchData, playersStats, now) {
    const inflate = (player) => {
      const stats = playersStats[player.userId];
      const inflatedRD = this.ratingService.inflateRDForInactivity(
        { rd: stats.rd, lastGameAt: stats.lastGameAt },
        now
      );
      if (inflatedRD !== stats.rd) {
        Logger.info(
          `[RATING_CONTROLLER] RD inflated for ${player.username}: ${stats.rd.toFixed(1)} → ${inflatedRD.toFixed(1)}`
        );
        stats.rd = inflatedRD;
      }
      return {
        userId: player.userId,
        username: player.username,
        rating: stats.rating,
        rd: stats.rd,
        volatility: stats.volatility,
        cost: player.cost,
        role: player.role,
      };
    };

    return {
      team1: { players: matchData.team1.players.map(inflate) },
      team2: { players: matchData.team2.players.map(inflate) },
      winner: matchData.winner,
      mvpUserId: matchData.mvpUserId || null,
      aceUserId: matchData.aceUserId || null,
      duration: matchData.duration,
      victoryMargin: matchData.victoryMargin,
    };
  }

  async updatePlayersRating(playersStats, ratingCalculations, matchId, now) {
    const updatedPlayers = {};

    const team1AvgCost = avgCost(ratingCalculations.team1);
    const team2AvgCost = avgCost(ratingCalculations.team2);

    const updatePlayer = async (playerResult, opponentAvgCost) => {
      const playerStats = playersStats[playerResult.userId];
      const change = playerResult.ratingChange;
      const isWin = playerResult.result === "win";

      playerStats.rating = change.ratingAfter;
      playerStats.rd = change.rdAfter;
      playerStats.volatility = change.volatilityAfter;
      playerStats.gamesPlayed = (playerStats.gamesPlayed || 0) + 1;
      playerStats.lastGameAt = now;
      playerStats.totalGames++;

      if (isWin) {
        playerStats.wins++;
      } else {
        playerStats.losses++;
      }

      if (playerResult.performanceRole === "MVP") {
        playerStats.mvpCount = (playerStats.mvpCount || 0) + 1;
      } else if (playerResult.performanceRole === "ACE") {
        playerStats.aceCount = (playerStats.aceCount || 0) + 1;
      }

      const costKey = Math.round(opponentAvgCost).toString();
      if (isWin) {
        const prevTotal =
          playerStats.avgOpponentCostWhenWin * (playerStats.wins - 1);
        playerStats.avgOpponentCostWhenWin =
          (prevTotal + opponentAvgCost) / playerStats.wins;
        playerStats.winsByOpponentCost.set(
          costKey,
          (playerStats.winsByOpponentCost.get(costKey) || 0) + 1
        );
      } else {
        const prevTotal =
          playerStats.avgOpponentCostWhenLose * (playerStats.losses - 1);
        playerStats.avgOpponentCostWhenLose =
          (prevTotal + opponentAvgCost) / playerStats.losses;
        playerStats.lossesByOpponentCost.set(
          costKey,
          (playerStats.lossesByOpponentCost.get(costKey) || 0) + 1
        );
      }

      playerStats.ratingHistory.push({
        rating: change.ratingAfter,
        rd: change.rdAfter,
        displayScore: change.displayAfter,
        ratingDelta: change.ratingDelta,
        displayDelta: change.displayDelta,
        matchId,
        date: now,
      });
      if (playerStats.ratingHistory.length > 50) {
        playerStats.ratingHistory = playerStats.ratingHistory.slice(-50);
      }

      playerStats.lastUpdated = now;
      await playerStats.save();

      const tierAfter = this.ratingService.getTier(playerStats);

      updatedPlayers[playerResult.userId] = {
        username: playerResult.username,
        ratingBefore: change.ratingBefore,
        ratingAfter: change.ratingAfter,
        ratingDelta: change.ratingDelta,
        displayBefore: change.displayBefore,
        displayAfter: change.displayAfter,
        displayDelta: change.displayDelta,
        result: playerResult.result,
        performanceRole: playerResult.performanceRole || null,
        tier: tierAfter,
      };

      Logger.info(
        `[RATING_CONTROLLER] ${playerResult.username}: display ${change.displayBefore} → ${change.displayAfter} (${change.displayDelta >= 0 ? "+" : ""}${change.displayDelta})`
      );
    };

    for (const playerResult of ratingCalculations.team1) {
      await updatePlayer(playerResult, team2AvgCost);
    }
    for (const playerResult of ratingCalculations.team2) {
      await updatePlayer(playerResult, team1AvgCost);
    }
    return updatedPlayers;
  }

  async saveMatch(
    inflatedMatchData,
    ratingCalculations,
    matchId,
    resolvedBy,
    sourceGameKey = null
  ) {
    const avg = (arr, key) =>
      arr.length === 0 ? 0 : arr.reduce((s, x) => s + (x[key] || 0), 0) / arr.length;

    const team1Players = ratingCalculations.team1.map((p) => ({
      userId: p.userId,
      username: p.username,
      ratingBefore: p.ratingChange.ratingBefore,
      ratingAfter: p.ratingChange.ratingAfter,
      rdBefore: p.ratingChange.rdBefore,
      rdAfter: p.ratingChange.rdAfter,
      volatilityBefore: p.ratingChange.volatilityBefore,
      volatilityAfter: p.ratingChange.volatilityAfter,
      ratingDelta: p.ratingChange.ratingDelta,
      displayBefore: p.ratingChange.displayBefore,
      displayAfter: p.ratingChange.displayAfter,
      displayDelta: p.ratingChange.displayDelta,
      cost: p.cost,
      role: p.role,
      result: p.result,
      performanceRole: p.performanceRole || null,
    }));
    const team2Players = ratingCalculations.team2.map((p) => ({
      userId: p.userId,
      username: p.username,
      ratingBefore: p.ratingChange.ratingBefore,
      ratingAfter: p.ratingChange.ratingAfter,
      rdBefore: p.ratingChange.rdBefore,
      rdAfter: p.ratingChange.rdAfter,
      volatilityBefore: p.ratingChange.volatilityBefore,
      volatilityAfter: p.ratingChange.volatilityAfter,
      ratingDelta: p.ratingChange.ratingDelta,
      displayBefore: p.ratingChange.displayBefore,
      displayAfter: p.ratingChange.displayAfter,
      displayDelta: p.ratingChange.displayDelta,
      cost: p.cost,
      role: p.role,
      result: p.result,
      performanceRole: p.performanceRole || null,
    }));

    const match = new Match({
      matchId,
      sourceGameKey,
      team1: {
        players: team1Players,
        averageRating: ratingCalculations.matchSummary.team1Avatar.rating,
        averageRD: ratingCalculations.matchSummary.team1Avatar.rd,
        averageCost: avg(inflatedMatchData.team1.players, "cost"),
      },
      team2: {
        players: team2Players,
        averageRating: ratingCalculations.matchSummary.team2Avatar.rating,
        averageRD: ratingCalculations.matchSummary.team2Avatar.rd,
        averageCost: avg(inflatedMatchData.team2.players, "cost"),
      },
      winner: inflatedMatchData.winner,
      mvpUserId: inflatedMatchData.mvpUserId || null,
      aceUserId: inflatedMatchData.aceUserId || null,
      duration: inflatedMatchData.duration || null,
      victoryMargin: inflatedMatchData.victoryMargin || null,
      resolvedBy,
    });

    await match.save();
    return match;
  }

  async getPlayerStats(userId) {
    try {
      const playerStats = await PlayerStats.findOne({ userId });
      if (!playerStats) return null;

      const tier = this.ratingService.getTier(playerStats);
      const displayScore = this.ratingService.getDisplayScore(playerStats);

      return {
        userId: playerStats.userId,
        username: playerStats.username,
        rating: playerStats.rating,
        rd: playerStats.rd,
        volatility: playerStats.volatility,
        displayScore,
        tier,
        gamesPlayed: playerStats.gamesPlayed,
        wins: playerStats.wins,
        losses: playerStats.losses,
        totalGames: playerStats.totalGames,
        mvpCount: playerStats.mvpCount || 0,
        aceCount: playerStats.aceCount || 0,
        winrate:
          playerStats.totalGames > 0
            ? ((playerStats.wins / playerStats.totalGames) * 100).toFixed(1)
            : 0,
        ratingHistory: playerStats.ratingHistory.slice(-10),
        lastUpdated: playerStats.lastUpdated,
        lastGameAt: playerStats.lastGameAt,
        avgOpponentCostWhenWin: playerStats.avgOpponentCostWhenWin,
        avgOpponentCostWhenLose: playerStats.avgOpponentCostWhenLose,
      };
    } catch (error) {
      Logger.error(`[RATING_CONTROLLER] Erreur stats joueur: ${error.message}`);
      throw error;
    }
  }

  async getLeaderboard(limit = 50) {
    try {
      const eligible = await PlayerStats.find({
        gamesPlayed: { $gte: this.ratingService.config.leaderboardMinGames },
        rd: { $lte: this.ratingService.config.leaderboardDropRD },
      })
        .sort({ rating: -1, totalGames: -1 })
        .limit(limit);

      return eligible.map((player, index) => {
        const tier = this.ratingService.getTier(player);
        return {
          rank: index + 1,
          userId: player.userId,
          username: player.username,
          rating: player.rating,
          rd: player.rd,
          displayScore: this.ratingService.getDisplayScore(player),
          tier,
          wins: player.wins,
          losses: player.losses,
          totalGames: player.totalGames,
          gamesPlayed: player.gamesPlayed,
          winrate:
            player.totalGames > 0
              ? ((player.wins / player.totalGames) * 100).toFixed(1)
              : 0,
        };
      });
    } catch (error) {
      Logger.error(`[RATING_CONTROLLER] Erreur classement: ${error.message}`);
      throw error;
    }
  }

  updateEloConfig(newConfig) {
    this.ratingService.updateConfig(newConfig);
  }

  getEloConfig() {
    return this.ratingService.getConfig();
  }

  getRatingService() {
    return this.ratingService;
  }
}

function avgCost(playerResults) {
  if (!playerResults.length) return 0;
  return (
    playerResults.reduce((s, p) => s + (p.cost || 0), 0) / playerResults.length
  );
}
