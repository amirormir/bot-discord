import { Logger } from "../utils/logger.js";
import { EloService } from "../services/eloService.js";
import { PlayerStats } from "../models/PlayerStats.js";
import { Match } from "../models/Match.js";

export class EloController {
  constructor() {
    this.eloService = new EloService();
  }

  /**
   * Résout un match et met à jour les Elo de tous les joueurs
   * @param {Object} matchData - Données du match
   * @param {string} resolvedBy - ID de l'utilisateur qui résout le match
   * @returns {Object} - Résultat de la résolution
   */
  async resolveMatch(matchData, resolvedBy) {
    try {
      Logger.info(`[ELO_CONTROLLER] Résolution du match par ${resolvedBy}`);

      // Valider les données du match
      const validation = this.validateMatchData(matchData);
      if (!validation.valid) {
        throw new Error(`Données de match invalides: ${validation.error}`);
      }

      // Générer un ID unique pour le match
      const matchId = `match_${Date.now()}_${Math.random()
        .toString(36)
        .substr(2, 9)}`;

      // Récupérer ou créer les statistiques des joueurs
      const playersStats = await this.getOrCreatePlayersStats(matchData);

      // Calculer les changements d'Elo
      const eloCalculations =
        this.eloService.calculateMatchEloChanges(matchData);

      // Mettre à jour les Elo des joueurs
      const updatedPlayers = await this.updatePlayersElo(
        playersStats,
        eloCalculations,
        matchId
      );

      // Sauvegarder le match
      const savedMatch = await this.saveMatch(
        matchData,
        eloCalculations,
        matchId,
        resolvedBy
      );

      Logger.info(`[ELO_CONTROLLER] Match résolu avec succès: ${matchId}`);

      return {
        success: true,
        matchId,
        match: savedMatch,
        updatedPlayers,
        eloCalculations: eloCalculations.matchSummary,
      };
    } catch (error) {
      Logger.error(
        `[ELO_CONTROLLER] Erreur résolution match: ${error.message}`
      );
      throw error;
    }
  }

  /**
   * Valide les données du match
   * @param {Object} matchData - Données du match
   * @returns {Object} - {valid: boolean, error?: string}
   */
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

    // Valider que chaque joueur a les données requises
    const allPlayers = [...matchData.team1.players, ...matchData.team2.players];
    for (const player of allPlayers) {
      if (!player.userId || !player.username || !player.elo || !player.cost) {
        return {
          valid: false,
          error: `Données joueur incomplètes: ${player.username || "Unknown"}`,
        };
      }
    }

    return { valid: true };
  }

  /**
   * Récupère ou crée les statistiques des joueurs
   * @param {Object} matchData - Données du match
   * @returns {Object} - Statistiques des joueurs
   */
  async getOrCreatePlayersStats(matchData) {
    const allPlayers = [...matchData.team1.players, ...matchData.team2.players];
    const playersStats = {};

    for (const player of allPlayers) {
      let playerStats = await PlayerStats.findOne({ userId: player.userId });

      if (!playerStats) {
        // Créer de nouvelles statistiques pour le joueur
        playerStats = await PlayerStats.create({
          userId: player.userId,
          username: player.username,
          elo: player.elo || 1000,
          gamesPlayed: 0,
        });

        Logger.info(
          `[ELO_CONTROLLER] Nouvelles statistiques créées pour ${player.username}`
        );
      }

      playersStats[player.userId] = playerStats;
    }

    return playersStats;
  }

  /**
   * Met à jour les Elo des joueurs
   * @param {Object} playersStats - Statistiques des joueurs
   * @param {Object} eloCalculations - Calculs d'Elo
   * @param {string} matchId - ID du match
   * @returns {Object} - Joueurs mis à jour
   */
  async updatePlayersElo(playersStats, eloCalculations, matchId) {
    const updatedPlayers = {};

    // Mettre à jour l'équipe 1
    for (const playerResult of eloCalculations.team1) {
      const playerStats = playersStats[playerResult.userId];
      const oldElo = playerStats.elo;
      const newElo = oldElo + playerResult.eloChange.change;

      // Mettre à jour les statistiques
      playerStats.elo = newElo;
      playerStats.gamesPlayed++;
      playerStats.totalGames++;

      if (playerResult.result === "win") {
        playerStats.wins++;
      } else {
        playerStats.losses++;
      }

      // Ajouter à l'historique Elo
      playerStats.eloHistory.push({
        elo: newElo,
        change: playerResult.eloChange.change,
        matchId,
        date: new Date(),
      });

      // Limiter l'historique à 50 entrées
      if (playerStats.eloHistory.length > 50) {
        playerStats.eloHistory = playerStats.eloHistory.slice(-50);
      }

      playerStats.lastUpdated = new Date();
      await playerStats.save();

      updatedPlayers[playerResult.userId] = {
        username: playerResult.username,
        oldElo,
        newElo,
        change: playerResult.eloChange.change,
        result: playerResult.result,
      };

      Logger.info(
        `[ELO_CONTROLLER] ${playerResult.username}: ${oldElo} → ${newElo} (${
          playerResult.eloChange.change > 0 ? "+" : ""
        }${playerResult.eloChange.change})`
      );
    }

    // Mettre à jour l'équipe 2
    for (const playerResult of eloCalculations.team2) {
      const playerStats = playersStats[playerResult.userId];
      const oldElo = playerStats.elo;
      const newElo = oldElo + playerResult.eloChange.change;

      // Mettre à jour les statistiques
      playerStats.elo = newElo;
      playerStats.gamesPlayed++;
      playerStats.totalGames++;

      if (playerResult.result === "win") {
        playerStats.wins++;
      } else {
        playerStats.losses++;
      }

      // Ajouter à l'historique Elo
      playerStats.eloHistory.push({
        elo: newElo,
        change: playerResult.eloChange.change,
        matchId,
        date: new Date(),
      });

      // Limiter l'historique à 50 entrées
      if (playerStats.eloHistory.length > 50) {
        playerStats.eloHistory = playerStats.eloHistory.slice(-50);
      }

      playerStats.lastUpdated = new Date();
      await playerStats.save();

      updatedPlayers[playerResult.userId] = {
        username: playerResult.username,
        oldElo,
        newElo,
        change: playerResult.eloChange.change,
        result: playerResult.result,
      };

      Logger.info(
        `[ELO_CONTROLLER] ${playerResult.username}: ${oldElo} → ${newElo} (${
          playerResult.eloChange.change > 0 ? "+" : ""
        }${playerResult.eloChange.change})`
      );
    }

    return updatedPlayers;
  }

  /**
   * Sauvegarde le match en base
   * @param {Object} matchData - Données du match
   * @param {Object} eloCalculations - Calculs d'Elo
   * @param {string} matchId - ID du match
   * @param {string} resolvedBy - ID de l'utilisateur qui résout le match
   * @returns {Object} - Match sauvegardé
   */
  async saveMatch(matchData, eloCalculations, matchId, resolvedBy) {
    const match = new Match({
      matchId,
      team1: {
        players: matchData.team1.players,
        averageElo: eloCalculations.matchSummary.team1AverageElo,
        averageCost: eloCalculations.matchSummary.team1AverageCost,
      },
      team2: {
        players: matchData.team2.players,
        averageElo: eloCalculations.matchSummary.team2AverageElo,
        averageCost: eloCalculations.matchSummary.team2AverageCost,
      },
      winner: matchData.winner,
      duration: matchData.duration || null,
      victoryMargin: matchData.victoryMargin || null,
      eloCalculations: {
        team1Expected:
          eloCalculations.matchSummary.blendedExpected.team1Expected,
        team2Expected:
          eloCalculations.matchSummary.blendedExpected.team2Expected,
        team1Change: eloCalculations.team1.reduce(
          (sum, p) => sum + p.eloChange.change,
          0
        ),
        team2Change: eloCalculations.team2.reduce(
          (sum, p) => sum + p.eloChange.change,
          0
        ),
        kFactor: eloCalculations.team1[0]?.eloChange.kFactor || 24,
        lambda: this.eloService.getConfig().lambda,
      },
      resolvedBy,
    });

    await match.save();
    return match;
  }

  /**
   * Obtient les statistiques d'un joueur
   * @param {string} userId - ID du joueur
   * @returns {Object} - Statistiques du joueur
   */
  async getPlayerStats(userId) {
    try {
      const playerStats = await PlayerStats.findOne({ userId });

      if (!playerStats) {
        return null;
      }

      return {
        userId: playerStats.userId,
        username: playerStats.username,
        elo: playerStats.elo,
        gamesPlayed: playerStats.gamesPlayed,
        wins: playerStats.wins,
        losses: playerStats.losses,
        totalGames: playerStats.totalGames,
        winrate:
          playerStats.totalGames > 0
            ? ((playerStats.wins / playerStats.totalGames) * 100).toFixed(1)
            : 0,
        eloHistory: playerStats.eloHistory.slice(-10), // 10 dernières parties
        lastUpdated: playerStats.lastUpdated,
      };
    } catch (error) {
      Logger.error(
        `[ELO_CONTROLLER] Erreur récupération stats joueur: ${error.message}`
      );
      throw error;
    }
  }

  /**
   * Obtient le classement des joueurs
   * @param {number} limit - Nombre de joueurs à retourner
   * @returns {Array} - Classement des joueurs
   */
  async getLeaderboard(limit = 50) {
    try {
      const players = await PlayerStats.find({})
        .sort({ elo: -1, gamesPlayed: -1 })
        .limit(limit);

      return players.map((player, index) => ({
        rank: index + 1,
        userId: player.userId,
        username: player.username,
        elo: player.elo,
        gamesPlayed: player.gamesPlayed,
        wins: player.wins,
        losses: player.losses,
        winrate:
          player.totalGames > 0
            ? ((player.wins / player.totalGames) * 100).toFixed(1)
            : 0,
      }));
    } catch (error) {
      Logger.error(
        `[ELO_CONTROLLER] Erreur récupération classement: ${error.message}`
      );
      throw error;
    }
  }

  /**
   * Met à jour la configuration du service Elo
   * @param {Object} newConfig - Nouvelle configuration
   */
  updateEloConfig(newConfig) {
    this.eloService.updateConfig(newConfig);
    Logger.info(`[ELO_CONTROLLER] Configuration Elo mise à jour`);
  }

  /**
   * Obtient la configuration actuelle du service Elo
   * @returns {Object} - Configuration actuelle
   */
  getEloConfig() {
    return this.eloService.getConfig();
  }
}
