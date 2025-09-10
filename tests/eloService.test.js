import { EloService } from "../services/eloService.js";

describe("EloService", () => {
  let eloService;

  beforeEach(() => {
    eloService = new EloService();
  });

  describe("calculateExpectedElo", () => {
    test("devrait calculer l'expected Elo correctement pour des équipes équilibrées", () => {
      const result = eloService.calculateExpectedElo(1000, 1000);

      expect(result.team1Expected).toBeCloseTo(0.5, 3);
      expect(result.team2Expected).toBeCloseTo(0.5, 3);
    });

    test("devrait favoriser l'équipe avec le plus haut Elo", () => {
      const result = eloService.calculateExpectedElo(1200, 1000);

      expect(result.team1Expected).toBeGreaterThan(0.5);
      expect(result.team2Expected).toBeLessThan(0.5);
      expect(result.team1Expected + result.team2Expected).toBeCloseTo(1, 3);
    });

    test("devrait calculer correctement pour un grand écart d'Elo", () => {
      const result = eloService.calculateExpectedElo(1500, 1000);

      expect(result.team1Expected).toBeGreaterThan(0.8);
      expect(result.team2Expected).toBeLessThan(0.2);
    });
  });

  describe("calculateExpectedCost", () => {
    test("devrait calculer l'expected Cost correctement pour des coûts équilibrés", () => {
      const result = eloService.calculateExpectedCost(3, 3);

      expect(result.team1Expected).toBeCloseTo(0.5, 3);
      expect(result.team2Expected).toBeCloseTo(0.5, 3);
    });

    test("devrait favoriser l'équipe avec le plus haut coût", () => {
      const result = eloService.calculateExpectedCost(4, 2);

      expect(result.team1Expected).toBeGreaterThan(0.5);
      expect(result.team2Expected).toBeLessThan(0.5);
    });

    test("devrait utiliser le facteur costToElo correctement", () => {
      const result = eloService.calculateExpectedCost(5, 1);
      const costDifference = (5 - 1) * 60; // 240 Elo

      // L'équipe avec coût 5 devrait avoir un expected très élevé
      expect(result.team1Expected).toBeGreaterThan(0.9);
    });
  });

  describe("calculateBlendedExpected", () => {
    test("devrait combiner correctement Elo et Cost avec lambda", () => {
      const eloExpected = { team1Expected: 0.6, team2Expected: 0.4 };
      const costExpected = { team1Expected: 0.8, team2Expected: 0.2 };

      const result = eloService.calculateBlendedExpected(
        eloExpected,
        costExpected
      );

      // Avec lambda = 0.7: 0.7 * 0.6 + 0.3 * 0.8 = 0.42 + 0.24 = 0.66
      expect(result.team1Expected).toBeCloseTo(0.66, 3);
      expect(result.team2Expected).toBeCloseTo(0.34, 3);
    });
  });

  describe("getKFactor", () => {
    test("devrait retourner K=40 pour les nouveaux joueurs", () => {
      const kFactor = eloService.getKFactor(1000, 5);
      expect(kFactor).toBe(40);
    });

    test("devrait retourner K=24 pour les joueurs standards", () => {
      const kFactor = eloService.getKFactor(1500, 50);
      expect(kFactor).toBe(24);
    });

    test("devrait retourner K=16 pour les experts", () => {
      const kFactor = eloService.getKFactor(2100, 100);
      expect(kFactor).toBe(16);
    });

    test("devrait gérer la transition entre les seuils", () => {
      const kNewbie = eloService.getKFactor(1000, 9);
      const kStandard = eloService.getKFactor(1000, 10);

      expect(kNewbie).toBe(40);
      expect(kStandard).toBe(24);
    });
  });

  describe("calculateEloChange", () => {
    test("devrait calculer un gain positif pour une victoire", () => {
      const player = { elo: 1000, gamesPlayed: 50, teamId: 1 };
      const expected = { team1Expected: 0.3, team2Expected: 0.7 };
      const matchData = { winner: "team1" };

      const result = eloService.calculateEloChange(
        player,
        "win",
        expected,
        matchData
      );

      expect(result.change).toBeGreaterThan(0);
      expect(result.kFactor).toBe(24);
    });

    test("devrait calculer une perte pour une défaite", () => {
      const player = { elo: 1000, gamesPlayed: 50, teamId: 1 };
      const expected = { team1Expected: 0.3, team2Expected: 0.7 };
      const matchData = { winner: "team2" };

      const result = eloService.calculateEloChange(
        player,
        "loss",
        expected,
        matchData
      );

      expect(result.change).toBeLessThan(0);
    });

    test("devrait respecter les bornes de changement", () => {
      const player = { elo: 1000, gamesPlayed: 5, teamId: 1 }; // K=40
      const expected = { team1Expected: 0.1, team2Expected: 0.9 }; // Très désavantagé
      const matchData = { winner: "team1" };

      const result = eloService.calculateEloChange(
        player,
        "win",
        expected,
        matchData
      );

      // Même avec K=40 et une victoire surprise, le changement doit être borné
      expect(result.change).toBeLessThanOrEqual(40);
      expect(result.change).toBeGreaterThanOrEqual(-40);
    });

    test("devrait donner plus de points à un underdog qui gagne", () => {
      const underdog = { elo: 1000, gamesPlayed: 50, teamId: 1 };
      const favorite = { elo: 1200, gamesPlayed: 50, teamId: 2 };
      const expected = { team1Expected: 0.3, team2Expected: 0.7 };
      const matchData = { winner: "team1" };

      const underdogResult = eloService.calculateEloChange(
        underdog,
        "win",
        expected,
        matchData
      );
      const favoriteResult = eloService.calculateEloChange(
        favorite,
        "loss",
        expected,
        matchData
      );

      // L'underdog devrait gagner plus de points que le favori n'en perd
      expect(Math.abs(underdogResult.change)).toBeGreaterThan(
        Math.abs(favoriteResult.change)
      );
    });
  });

  describe("calculateMatchEloChanges", () => {
    test("devrait calculer les changements pour tous les joueurs d'un match", () => {
      const matchData = {
        team1: {
          players: [
            { userId: "1", username: "Player1", elo: 1000, cost: 3 },
            { userId: "2", username: "Player2", elo: 1000, cost: 3 },
            { userId: "3", username: "Player3", elo: 1000, cost: 3 },
            { userId: "4", username: "Player4", elo: 1000, cost: 3 },
            { userId: "5", username: "Player5", elo: 1000, cost: 3 },
          ],
        },
        team2: {
          players: [
            { userId: "6", username: "Player6", elo: 1200, cost: 4 },
            { userId: "7", username: "Player7", elo: 1200, cost: 4 },
            { userId: "8", username: "Player8", elo: 1200, cost: 4 },
            { userId: "9", username: "Player9", elo: 1200, cost: 4 },
            { userId: "10", username: "Player10", elo: 1200, cost: 4 },
          ],
        },
        winner: "team1",
      };

      const result = eloService.calculateMatchEloChanges(matchData);

      expect(result.team1).toHaveLength(5);
      expect(result.team2).toHaveLength(5);
      expect(result.matchSummary.winner).toBe("team1");

      // L'équipe 1 (gagnante) devrait avoir des changements positifs
      result.team1.forEach((player) => {
        expect(player.result).toBe("win");
        expect(player.eloChange.change).toBeGreaterThan(0);
      });

      // L'équipe 2 (perdante) devrait avoir des changements négatifs
      result.team2.forEach((player) => {
        expect(player.result).toBe("loss");
        expect(player.eloChange.change).toBeLessThan(0);
      });
    });

    test("devrait influencer l'expected par le coût des équipes", () => {
      const matchData = {
        team1: {
          players: [
            { userId: "1", username: "Player1", elo: 1000, cost: 1 },
            { userId: "2", username: "Player2", elo: 1000, cost: 1 },
            { userId: "3", username: "Player3", elo: 1000, cost: 1 },
            { userId: "4", username: "Player4", elo: 1000, cost: 1 },
            { userId: "5", username: "Player5", elo: 1000, cost: 1 },
          ],
        },
        team2: {
          players: [
            { userId: "6", username: "Player6", elo: 1000, cost: 5 },
            { userId: "7", username: "Player7", elo: 1000, cost: 5 },
            { userId: "8", username: "Player8", elo: 1000, cost: 5 },
            { userId: "9", username: "Player9", elo: 1000, cost: 5 },
            { userId: "10", username: "Player10", elo: 1000, cost: 5 },
          ],
        },
        winner: "team1",
      };

      const result = eloService.calculateMatchEloChanges(matchData);

      // L'équipe 1 (coût 1) qui bat l'équipe 2 (coût 5) devrait gagner beaucoup de points
      result.team1.forEach((player) => {
        expect(player.eloChange.change).toBeGreaterThan(15); // Gain significatif
      });

      // L'équipe 2 (coût 5) qui perd contre l'équipe 1 (coût 1) devrait perdre beaucoup de points
      result.team2.forEach((player) => {
        expect(player.eloChange.change).toBeLessThan(-15); // Perte significative
      });
    });
  });

  describe("Configuration", () => {
    test("devrait permettre de mettre à jour la configuration", () => {
      const newConfig = {
        costToElo: 80,
        lambda: 0.8,
        kFactors: { newbie: 50, standard: 30, expert: 20 },
      };

      eloService.updateConfig(newConfig);
      const config = eloService.getConfig();

      expect(config.costToElo).toBe(80);
      expect(config.lambda).toBe(0.8);
      expect(config.kFactors.newbie).toBe(50);
    });

    test("devrait conserver les valeurs par défaut pour les paramètres non spécifiés", () => {
      const newConfig = { costToElo: 100 };

      eloService.updateConfig(newConfig);
      const config = eloService.getConfig();

      expect(config.costToElo).toBe(100);
      expect(config.lambda).toBe(0.7); // Valeur par défaut conservée
    });
  });
});
