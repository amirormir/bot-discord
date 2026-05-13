import express from "express";
import { Logger } from "../utils/logger.js";
import { EloController } from "../controllers/eloController.js";

const router = express.Router();
const eloController = new EloController();

/**
 * POST /matches/resolve
 * Résout un match et met à jour les Elo des joueurs
 */
router.post("/matches/resolve", async (req, res) => {
  try {
    const { matchData, resolvedBy } = req.body;

    if (!matchData || !resolvedBy) {
      return res.status(400).json({
        success: false,
        error: "Données manquantes: matchData et resolvedBy requis",
      });
    }

    Logger.info(`[ELO_ROUTES] Résolution match demandée par ${resolvedBy}`);

    const result = await eloController.resolveMatch(matchData, resolvedBy);

    res.status(200).json({
      success: true,
      message: "Match résolu avec succès",
      data: result,
    });
  } catch (error) {
    Logger.error(`[ELO_ROUTES] Erreur résolution match: ${error.message}`);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /players/:userId/stats
 * Obtient les statistiques d'un joueur
 */
router.get("/players/:userId/stats", async (req, res) => {
  try {
    const { userId } = req.params;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: "userId requis",
      });
    }

    const playerStats = await eloController.getPlayerStats(userId);

    if (!playerStats) {
      return res.status(404).json({
        success: false,
        error: "Joueur non trouvé",
      });
    }

    res.status(200).json({
      success: true,
      data: playerStats,
    });
  } catch (error) {
    Logger.error(
      `[ELO_ROUTES] Erreur récupération stats joueur: ${error.message}`
    );
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /leaderboard
 * Obtient le classement des joueurs
 */
router.get("/leaderboard", async (req, res) => {
  try {
    const { limit = 50 } = req.query;
    const limitNum = parseInt(limit);

    if (isNaN(limitNum) || limitNum < 1 || limitNum > 100) {
      return res.status(400).json({
        success: false,
        error: "Limit doit être un nombre entre 1 et 100",
      });
    }

    const leaderboard = await eloController.getLeaderboard(limitNum);

    res.status(200).json({
      success: true,
      data: {
        leaderboard,
        total: leaderboard.length,
      },
    });
  } catch (error) {
    Logger.error(
      `[ELO_ROUTES] Erreur récupération classement: ${error.message}`
    );
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /config
 * Obtient la configuration actuelle du système Elo
 */
router.get("/config", async (req, res) => {
  try {
    const config = eloController.getEloConfig();

    res.status(200).json({
      success: true,
      data: config,
    });
  } catch (error) {
    Logger.error(`[ELO_ROUTES] Erreur récupération config: ${error.message}`);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * PUT /config
 * Met à jour la configuration du système Elo
 */
router.put("/config", async (req, res) => {
  try {
    const { config } = req.body;

    if (!config || typeof config !== "object") {
      return res.status(400).json({
        success: false,
        error: "Configuration invalide",
      });
    }

    // Valider les paramètres (Glicko-2)
    const validParams = [
      "tau",
      "defaultRating",
      "defaultRD",
      "defaultVolatility",
      "minRD",
      "maxRD",
      "displayMin",
      "displayMax",
      "decayC",
      "decayGracePeriodDays",
      "decayPeriodDays",
      "leaderboardMinGames",
      "leaderboardMaxRD",
      "leaderboardDropRD",
    ];

    const invalidParams = Object.keys(config).filter(
      (key) => !validParams.includes(key)
    );
    if (invalidParams.length > 0) {
      return res.status(400).json({
        success: false,
        error: `Paramètres invalides: ${invalidParams.join(", ")}`,
      });
    }

    eloController.updateEloConfig(config);

    res.status(200).json({
      success: true,
      message: "Configuration mise à jour avec succès",
      data: eloController.getEloConfig(),
    });
  } catch (error) {
    Logger.error(`[ELO_ROUTES] Erreur mise à jour config: ${error.message}`);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /health
 * Endpoint de santé pour vérifier que l'API fonctionne
 */
router.get("/health", (req, res) => {
  res.status(200).json({
    success: true,
    message: "API Elo fonctionnelle",
    timestamp: new Date().toISOString(),
  });
});

export default router;
