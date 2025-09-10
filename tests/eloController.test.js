import { EloController } from "../controllers/eloController.js";
import { PlayerStats } from "../models/PlayerStats.js";
import { Match } from "../models/Match.js";

// Mock des modèles
jest.mock("../models/PlayerStats.js");
jest.mock("../models/Match.js");

describe("EloController", () => {
  let eloController;

  beforeEach(() => {
    eloController = new EloController();
    jest.clearAllMocks();
  });

  describe("validateMatchData", () => {
    test("devrait valider des données de match correctes", () => {
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
            { userId: "6", username: "Player6", elo: 1000, cost: 3 },
            { userId: "7", username: "Player7", elo: 1000, cost: 3 },
            { userId: "8", username: "Player8", elo: 1000, cost: 3 },
            { userId: "9", username: "Player9", elo: 1000, cost: 3 },
            { userId: "10", username: "Player10", elo: 1000, cost: 3 },
          ],
        },
        winner: "team1",
      };

      const result = eloController.validateMatchData(matchData);
      expect(result.valid).toBe(true);
    });

    test("devrait rejeter des données de match invalides", () => {
      const invalidMatchData = {
        team1: { players: [] },
        team2: { players: [] },
        winner: "invalid",
      };

      const result = eloController.validateMatchData(invalidMatchData);
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    test("devrait rejeter des équipes avec un nombre incorrect de joueurs", () => {
      const matchData = {
        team1: {
          players: [{ userId: "1", username: "Player1", elo: 1000, cost: 3 }],
        },
        team2: {
          players: [{ userId: "2", username: "Player2", elo: 1000, cost: 3 }],
        },
        winner: "team1",
      };

      const result = eloController.validateMatchData(matchData);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("exactement 5 joueurs");
    });
  });

  describe("getOrCreatePlayersStats", () => {
    test("devrait créer de nouvelles statistiques pour des joueurs inexistants", async () => {
      const matchData = {
        team1: {
          players: [{ userId: "1", username: "Player1", elo: 1000, cost: 3 }],
        },
        team2: {
          players: [{ userId: "2", username: "Player2", elo: 1000, cost: 3 }],
        },
      };

      // Mock: aucun joueur existant
      PlayerStats.findOne.mockResolvedValue(null);
      PlayerStats.create.mockResolvedValue({
        userId: "1",
        username: "Player1",
        elo: 1000,
        gamesPlayed: 0,
      });

      const result = await eloController.getOrCreatePlayersStats(matchData);

      expect(PlayerStats.findOne).toHaveBeenCalledTimes(2);
      expect(PlayerStats.create).toHaveBeenCalledTimes(2);
      expect(result["1"]).toBeDefined();
      expect(result["2"]).toBeDefined();
    });

    test("devrait récupérer les statistiques existantes", async () => {
      const matchData = {
        team1: {
          players: [{ userId: "1", username: "Player1", elo: 1000, cost: 3 }],
        },
        team2: {
          players: [{ userId: "2", username: "Player2", elo: 1000, cost: 3 }],
        },
      };

      const existingStats = {
        userId: "1",
        username: "Player1",
        elo: 1200,
        gamesPlayed: 10,
      };

      PlayerStats.findOne.mockResolvedValue(existingStats);

      const result = await eloController.getOrCreatePlayersStats(matchData);

      expect(PlayerStats.findOne).toHaveBeenCalledTimes(2);
      expect(PlayerStats.create).not.toHaveBeenCalled();
      expect(result["1"]).toEqual(existingStats);
    });
  });

  describe("updatePlayersElo", () => {
    test("devrait mettre à jour les Elo des joueurs correctement", async () => {
      const playersStats = {
        1: {
          userId: "1",
          username: "Player1",
          elo: 1000,
          gamesPlayed: 0,
          totalGames: 0,
          wins: 0,
          losses: 0,
          eloHistory: [],
          save: jest.fn(),
        },
      };

      const eloCalculations = {
        team1: [
          {
            userId: "1",
            username: "Player1",
            result: "win",
            eloChange: { change: 20 },
          },
        ],
        team2: [],
      };

      const matchId = "test_match_123";

      const result = await eloController.updatePlayersElo(
        playersStats,
        eloCalculations,
        matchId
      );

      expect(result["1"].oldElo).toBe(1000);
      expect(result["1"].newElo).toBe(1020);
      expect(result["1"].change).toBe(20);
      expect(result["1"].result).toBe("win");
      expect(playersStats["1"].save).toHaveBeenCalled();
    });
  });

  describe("saveMatch", () => {
    test("devrait sauvegarder un match correctement", async () => {
      const matchData = {
        team1: {
          players: [{ userId: "1", username: "Player1", elo: 1000, cost: 3 }],
        },
        team2: {
          players: [{ userId: "2", username: "Player2", elo: 1000, cost: 3 }],
        },
        winner: "team1",
      };

      const eloCalculations = {
        matchSummary: {
          team1AverageElo: 1000,
          team2AverageElo: 1000,
          team1AverageCost: 3,
          team2AverageCost: 3,
          blendedExpected: { team1Expected: 0.5, team2Expected: 0.5 },
        },
        team1: [
          {
            userId: "1",
            username: "Player1",
            eloChange: { change: 20, kFactor: 24 },
          },
        ],
        team2: [
          {
            userId: "2",
            username: "Player2",
            eloChange: { change: -20, kFactor: 24 },
          },
        ],
      };

      const mockMatch = {
        matchId: "test_match_123",
        save: jest.fn(),
      };

      Match.mockImplementation(() => mockMatch);

      const result = await eloController.saveMatch(
        matchData,
        eloCalculations,
        "test_match_123",
        "admin_123"
      );

      expect(Match).toHaveBeenCalledWith(
        expect.objectContaining({
          matchId: "test_match_123",
          winner: "team1",
          resolvedBy: "admin_123",
        })
      );
      expect(mockMatch.save).toHaveBeenCalled();
      expect(result).toEqual(mockMatch);
    });
  });

  describe("getPlayerStats", () => {
    test("devrait retourner les statistiques d'un joueur existant", async () => {
      const mockPlayerStats = {
        userId: "1",
        username: "Player1",
        elo: 1200,
        gamesPlayed: 10,
        wins: 6,
        losses: 4,
        totalGames: 10,
        eloHistory: [
          { elo: 1200, change: 20, matchId: "match1", date: new Date() },
        ],
        lastUpdated: new Date(),
      };

      PlayerStats.findOne.mockResolvedValue(mockPlayerStats);

      const result = await eloController.getPlayerStats("1");

      expect(result).toEqual({
        userId: "1",
        username: "Player1",
        elo: 1200,
        gamesPlayed: 10,
        wins: 6,
        losses: 4,
        totalGames: 10,
        winrate: "60.0",
        eloHistory: mockPlayerStats.eloHistory,
        lastUpdated: mockPlayerStats.lastUpdated,
      });
    });

    test("devrait retourner null pour un joueur inexistant", async () => {
      PlayerStats.findOne.mockResolvedValue(null);

      const result = await eloController.getPlayerStats("nonexistent");

      expect(result).toBeNull();
    });
  });

  describe("getLeaderboard", () => {
    test("devrait retourner le classement des joueurs", async () => {
      const mockPlayers = [
        {
          userId: "1",
          username: "Player1",
          elo: 1500,
          gamesPlayed: 20,
          wins: 15,
          losses: 5,
          totalGames: 20,
        },
        {
          userId: "2",
          username: "Player2",
          elo: 1400,
          gamesPlayed: 15,
          wins: 10,
          losses: 5,
          totalGames: 15,
        },
      ];

      PlayerStats.find.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          limit: jest.fn().mockResolvedValue(mockPlayers),
        }),
      });

      const result = await eloController.getLeaderboard(10);

      expect(result).toHaveLength(2);
      expect(result[0].rank).toBe(1);
      expect(result[0].username).toBe("Player1");
      expect(result[0].elo).toBe(1500);
      expect(result[0].winrate).toBe("75.0");
    });
  });
});
