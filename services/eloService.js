import { Logger } from "../utils/logger.js";

export class EloService {
  constructor() {
    // Configuration des paramètres Elo
    this.config = {
      // Facteurs K dynamiques
      kFactors: {
        newbie: 40, // < 10 games
        standard: 24, // 10-2000 Elo
        expert: 16, // > 2000 Elo
      },

      // Bornes pour les changements d'Elo
      minChange: -40,
      maxChange: 40,

      // Bonus/malus pour performance personnelle
      personalPerformanceBonus: 5,
    };
  }

  /**
   * Calcule l'expected individuel pour un joueur basé sur son Elo vs l'Elo moyen adverse
   * @param {number} playerElo - Elo du joueur
   * @param {number} enemyAvgElo - Elo moyen de l'équipe adverse
   * @returns {number} - Expected (probabilité de victoire entre 0 et 1)
   */
  calculateExpectedPlayerElo(playerElo, enemyAvgElo) {
    const expected = 1 / (1 + Math.pow(10, (enemyAvgElo - playerElo) / 400));

    Logger.info(
      `[ELO_SERVICE] Expected individuel - Player Elo: ${playerElo.toFixed(
        1
      )}, Enemy Avg Elo: ${enemyAvgElo.toFixed(
        1
      )}, Expected: ${expected.toFixed(3)}`
    );

    return expected;
  }

  /**
   * Détermine le facteur K basé sur l'Elo et le nombre de parties
   * @param {number} elo - Elo du joueur
   * @param {number} gamesPlayed - Nombre de parties jouées
   * @returns {number} - Facteur K
   */
  getKFactor(elo, gamesPlayed) {
    let kFactor;

    if (gamesPlayed < 10) {
      kFactor = this.config.kFactors.newbie;
    } else if (elo > 2000) {
      kFactor = this.config.kFactors.expert;
    } else {
      kFactor = this.config.kFactors.standard;
    }

    Logger.info(
      `[ELO_SERVICE] K Factor: ${kFactor} (Elo: ${elo}, Games: ${gamesPlayed})`
    );

    return kFactor;
  }

  /**
   * Calcule le bonus/malus de performance personnelle
   * @param {Object} player - Données du joueur
   * @param {string} result - "win" ou "loss"
   * @param {Object} matchData - Données du match
   * @returns {number} - Bonus/malus (-5 à +5)
   */
  calculatePersonalPerformanceBonus(player, result, matchData) {
    // Pour l'instant, on retourne 0 (peut être étendu plus tard)
    // Exemples d'extensions possibles :
    // - MVP du match : +5
    // - Performance exceptionnelle : +3
    // - Performance décevante : -2
    // - etc.

    return 0;
  }

  /**
   * Calcule le changement d'Elo pour un joueur
   * @param {Object} player - Données du joueur
   * @param {string} result - "win" ou "loss"
   * @param {number} playerExpected - Expected individuel du joueur (probabilité de victoire)
   * @param {Object} matchData - Données du match
   * @returns {Object} - {change, kFactor, expected, personalBonus}
   */
  calculateEloChange(player, result, playerExpected, matchData) {
    const kFactor = this.getKFactor(player.elo, player.gamesPlayed);
    const personalBonus = this.calculatePersonalPerformanceBonus(
      player,
      result,
      matchData
    );

    // Score : 1 pour victoire, 0 pour défaite
    const score = result === "win" ? 1 : 0;

    // Calcul du changement d'Elo
    let change = kFactor * (score - playerExpected) + personalBonus;

    // Appliquer les bornes
    change = Math.max(
      this.config.minChange,
      Math.min(this.config.maxChange, change)
    );

    Logger.info(
      `[ELO_SERVICE] Elo Change pour ${player.username}: ${change.toFixed(
        1
      )} (K: ${kFactor}, Score: ${score}, Expected: ${playerExpected.toFixed(
        3
      )}, Bonus: ${personalBonus})`
    );
    Logger.info(
      `[ELO_SERVICE] Calcul détaillé: ${kFactor} * (${score} - ${playerExpected.toFixed(
        3
      )}) + ${personalBonus} = ${change.toFixed(1)}`
    );

    return {
      change: Math.round(change),
      kFactor,
      expected: playerExpected,
      personalBonus,
    };
  }

  /**
   * Calcule les changements d'Elo pour tous les joueurs d'un match
   * @param {Object} matchData - Données du match
   * @returns {Object} - Résultats des calculs pour chaque joueur
   */
  calculateMatchEloChanges(matchData) {
    const { team1, team2, winner } = matchData;

    // Calculer les moyennes d'Elo et de coût (le cost est gardé pour le matchmaking, pas pour le calcul Elo)
    const team1AverageElo =
      team1.players.reduce((sum, p) => sum + p.elo, 0) / team1.players.length;
    const team2AverageElo =
      team2.players.reduce((sum, p) => sum + p.elo, 0) / team2.players.length;
    const team1AverageCost =
      team1.players.reduce((sum, p) => sum + p.cost, 0) / team1.players.length;
    const team2AverageCost =
      team2.players.reduce((sum, p) => sum + p.cost, 0) / team2.players.length;

    Logger.info(
      `[ELO_SERVICE] Match Data - Team1: Elo ${team1AverageElo.toFixed(
        1
      )}, Cost ${team1AverageCost.toFixed(
        2
      )} | Team2: Elo ${team2AverageElo.toFixed(
        1
      )}, Cost ${team2AverageCost.toFixed(2)}`
    );
    Logger.info(
      `[ELO_SERVICE] Différence Elo: ${(
        team1AverageElo - team2AverageElo
      ).toFixed(1)} (Elo-only expected)`
    );

    // Calculer les changements pour chaque joueur
    const results = {
      team1: [],
      team2: [],
      matchSummary: {
        team1AverageElo,
        team2AverageElo,
        team1AverageCost,
        team2AverageCost,
        winner,
      },
    };

    Logger.info(`[ELO_SERVICE] Winner: ${winner}`);

    // Traiter l'équipe 1 - calculer un expected individuel pour chaque joueur
    team1.players.forEach((player) => {
      const result = winner === "team1" ? "win" : "loss";
      // Expected individuel : Elo du joueur vs Elo moyen de l'équipe adverse
      const playerExpected = this.calculateExpectedPlayerElo(
        player.elo,
        team2AverageElo
      );

      Logger.info(
        `[ELO_SERVICE] Team1 - ${
          player.username
        }: result=${result} (winner=${winner}), Elo: ${player.elo.toFixed(
          1
        )}, Expected: ${playerExpected.toFixed(3)}`
      );

      const eloChange = this.calculateEloChange(
        { ...player, teamId: 1 },
        result,
        playerExpected,
        matchData
      );

      results.team1.push({
        ...player,
        result,
        eloChange,
      });
    });

    // Traiter l'équipe 2 - calculer un expected individuel pour chaque joueur
    team2.players.forEach((player) => {
      const result = winner === "team2" ? "win" : "loss";
      // Expected individuel : Elo du joueur vs Elo moyen de l'équipe adverse
      const playerExpected = this.calculateExpectedPlayerElo(
        player.elo,
        team1AverageElo
      );

      Logger.info(
        `[ELO_SERVICE] Team2 - ${
          player.username
        }: result=${result} (winner=${winner}), Elo: ${player.elo.toFixed(
          1
        )}, Expected: ${playerExpected.toFixed(3)}`
      );

      const eloChange = this.calculateEloChange(
        { ...player, teamId: 2 },
        result,
        playerExpected,
        matchData
      );

      results.team2.push({
        ...player,
        result,
        eloChange,
      });
    });

    return results;
  }

  /**
   * Met à jour la configuration du service
   * @param {Object} newConfig - Nouvelle configuration
   */
  updateConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
    Logger.info(`[ELO_SERVICE] Configuration mise à jour:`, this.config);
  }

  /**
   * Obtient la configuration actuelle
   * @returns {Object} - Configuration actuelle
   */
  getConfig() {
    return { ...this.config };
  }
}
