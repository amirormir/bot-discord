import { Logger } from "../utils/logger.js";

export class EloService {
  constructor() {
    // Configuration des paramètres Elo
    this.config = {
      // Facteur de conversion Cost vers Elo (1 cost = 60 Elo par défaut)
      costToElo: 60,

      // Poids entre Elo attendu et Cost attendu (0.7 = 70% Elo, 30% Cost)
      lambda: 0.7,

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
   * Calcule l'Elo attendu classique entre deux équipes
   * @param {number} team1Elo - Elo moyen de l'équipe 1
   * @param {number} team2Elo - Elo moyen de l'équipe 2
   * @returns {Object} - {team1Expected, team2Expected}
   */
  calculateExpectedElo(team1Elo, team2Elo) {
    const team1Expected = 1 / (1 + Math.pow(10, (team2Elo - team1Elo) / 400));
    const team2Expected = 1 - team1Expected;

    Logger.info(
      `[ELO_SERVICE] Expected Elo - Team1: ${team1Expected.toFixed(
        3
      )}, Team2: ${team2Expected.toFixed(3)}`
    );

    return { team1Expected, team2Expected };
  }

  /**
   * Calcule l'expected basé sur le coût des équipes
   * @param {number} team1Cost - Coût moyen de l'équipe 1
   * @param {number} team2Cost - Coût moyen de l'équipe 2
   * @returns {Object} - {team1Expected, team2Expected}
   */
  calculateExpectedCost(team1Cost, team2Cost) {
    // Convertir l'écart de coût en équivalent Elo
    const costDifference = (team1Cost - team2Cost) * this.config.costToElo;

    const team1Expected = 1 / (1 + Math.pow(10, -costDifference / 400));
    const team2Expected = 1 - team1Expected;

    Logger.info(
      `[ELO_SERVICE] Expected Cost - Team1: ${team1Expected.toFixed(
        3
      )}, Team2: ${team2Expected.toFixed(3)} (diff: ${costDifference.toFixed(
        1
      )} Elo)`
    );

    return { team1Expected, team2Expected };
  }

  /**
   * Calcule l'expected blendé entre Elo et Cost
   * @param {Object} eloExpected - Expected basé sur l'Elo
   * @param {Object} costExpected - Expected basé sur le coût
   * @returns {Object} - {team1Expected, team2Expected}
   */
  calculateBlendedExpected(eloExpected, costExpected) {
    const lambda = this.config.lambda;

    const team1Expected =
      lambda * eloExpected.team1Expected +
      (1 - lambda) * costExpected.team1Expected;
    const team2Expected =
      lambda * eloExpected.team2Expected +
      (1 - lambda) * costExpected.team2Expected;

    Logger.info(
      `[ELO_SERVICE] Blended Expected (λ=${lambda}) - Team1: ${team1Expected.toFixed(
        3
      )}, Team2: ${team2Expected.toFixed(3)}`
    );

    return { team1Expected, team2Expected };
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
   * @param {Object} expected - Expected blendé
   * @param {Object} matchData - Données du match
   * @returns {Object} - {change, kFactor, expected, personalBonus}
   */
  calculateEloChange(player, result, expected, matchData) {
    const kFactor = this.getKFactor(player.elo, player.gamesPlayed);
    const personalBonus = this.calculatePersonalPerformanceBonus(
      player,
      result,
      matchData
    );

    // Score : 1 pour victoire, 0 pour défaite
    const score = result === "win" ? 1 : 0;

    // Expected basé sur l'équipe du joueur
    const playerExpected =
      player.teamId === 1 ? expected.team1Expected : expected.team2Expected;

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

    // Calculer les moyennes d'Elo et de coût
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

    // Calculer les expected
    const eloExpected = this.calculateExpectedElo(
      team1AverageElo,
      team2AverageElo
    );
    const costExpected = this.calculateExpectedCost(
      team1AverageCost,
      team2AverageCost
    );
    const blendedExpected = this.calculateBlendedExpected(
      eloExpected,
      costExpected
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
        eloExpected,
        costExpected,
        blendedExpected,
        winner,
      },
    };

    // Traiter l'équipe 1
    team1.players.forEach((player) => {
      const result = winner === "team1" ? "win" : "loss";
      const eloChange = this.calculateEloChange(
        { ...player, teamId: 1 },
        result,
        blendedExpected,
        matchData
      );

      results.team1.push({
        ...player,
        result,
        eloChange,
      });
    });

    // Traiter l'équipe 2
    team2.players.forEach((player) => {
      const result = winner === "team2" ? "win" : "loss";
      const eloChange = this.calculateEloChange(
        { ...player, teamId: 2 },
        result,
        blendedExpected,
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
