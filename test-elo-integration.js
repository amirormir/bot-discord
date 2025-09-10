// Test d'intégration du système Elo
import { EloIntegration } from "./integration/eloIntegration.js";
import { Logger } from "./utils/logger.js";

async function testEloIntegration() {
  try {
    console.log("🧪 Test d'intégration du système Elo...");

    const eloIntegration = new EloIntegration();

    // Test de résolution d'un match
    const testGameResult = {
      team1: {
        players: [
          {
            userId: "test1",
            username: "TestPlayer1",
            selectedCost: 3,
            assignedRole: "Top",
          },
          {
            userId: "test2",
            username: "TestPlayer2",
            selectedCost: 4,
            assignedRole: "Jungle",
          },
          {
            userId: "test3",
            username: "TestPlayer3",
            selectedCost: 2,
            assignedRole: "Mid",
          },
          {
            userId: "test4",
            username: "TestPlayer4",
            selectedCost: 5,
            assignedRole: "ADC",
          },
          {
            userId: "test5",
            username: "TestPlayer5",
            selectedCost: 3,
            assignedRole: "Support",
          },
        ],
      },
      team2: {
        players: [
          {
            userId: "test6",
            username: "TestPlayer6",
            selectedCost: 2,
            assignedRole: "Top",
          },
          {
            userId: "test7",
            username: "TestPlayer7",
            selectedCost: 3,
            assignedRole: "Jungle",
          },
          {
            userId: "test8",
            username: "TestPlayer8",
            selectedCost: 4,
            assignedRole: "Mid",
          },
          {
            userId: "test9",
            username: "TestPlayer9",
            selectedCost: 3,
            assignedRole: "ADC",
          },
          {
            userId: "test10",
            username: "TestPlayer10",
            selectedCost: 2,
            assignedRole: "Support",
          },
        ],
      },
      winner: "team1",
    };

    console.log("📊 Résolution du match de test...");
    const result = await eloIntegration.resolveMatchWithElo(
      testGameResult,
      "admin_test"
    );

    console.log("✅ Match résolu avec succès !");
    console.log("📈 Résultats :");
    console.log(`   - Match ID: ${result.matchId}`);
    console.log(
      `   - Joueurs mis à jour: ${Object.keys(result.updatedPlayers).length}`
    );

    Object.values(result.updatedPlayers).forEach((player) => {
      console.log(
        `   - ${player.username}: ${player.oldElo} → ${player.newElo} (${
          player.change > 0 ? "+" : ""
        }${player.change})`
      );
    });

    console.log("🎯 Test d'intégration réussi !");
  } catch (error) {
    console.error("❌ Erreur lors du test :", error.message);
  }
}

// Exécuter le test si ce fichier est lancé directement
if (import.meta.url === `file://${process.argv[1]}`) {
  testEloIntegration();
}

export { testEloIntegration };
