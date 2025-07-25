import { Logger } from "./logger.js";

export class TeamBuilder {
  static buildTeams(players) {
    Logger.info(
      `[TEAM_BUILDER] Construction d'équipes pour ${players.length} joueurs`
    );

    // Log des joueurs pour debug
    players.forEach((player, index) => {
      Logger.info(
        `[TEAM_BUILDER] Joueur ${index + 1}: ${player.username} - ${
          player.selectedRole
        } (Niveau ${player.selectedCost})`
      );
    });

    // Vérifier qu'on a bien 10 joueurs
    if (players.length !== 10) {
      Logger.error(
        `[TEAM_BUILDER] Nombre de joueurs incorrect: ${players.length}`
      );
      return null;
    }

    // Algorithme simple : alterner les joueurs par niveau
    // Trier les joueurs par niveau décroissant
    const sortedPlayers = [...players].sort(
      (a, b) => b.selectedCost - a.selectedCost
    );

    Logger.info(
      `[TEAM_BUILDER] Joueurs triés par niveau:`,
      sortedPlayers.map((p) => `${p.username} (${p.selectedCost})`)
    );

    const team1 = [];
    const team2 = [];

    // Distribuer les joueurs alternativement
    for (let i = 0; i < sortedPlayers.length; i++) {
      const player = sortedPlayers[i];

      if (i % 2 === 0) {
        team1.push({
          ...player,
          assignedRole:
            player.selectedRole === "Fill"
              ? this.assignFillRole(team1)
              : player.selectedRole,
          teamId: 1,
        });
      } else {
        team2.push({
          ...player,
          assignedRole:
            player.selectedRole === "Fill"
              ? this.assignFillRole(team2)
              : player.selectedRole,
          teamId: 2,
        });
      }
    }

    // Calculer les costs moyens
    const team1Cost =
      team1.reduce((sum, player) => sum + player.selectedCost, 0) / 5;
    const team2Cost =
      team2.reduce((sum, player) => sum + player.selectedCost, 0) / 5;
    const costDifference = Math.abs(team1Cost - team2Cost);

    Logger.info(
      `[TEAM_BUILDER] Équipe 1 (Cost: ${team1Cost.toFixed(2)}):`,
      team1.map((p) => `${p.username} - ${p.assignedRole}`)
    );
    Logger.info(
      `[TEAM_BUILDER] Équipe 2 (Cost: ${team2Cost.toFixed(2)}):`,
      team2.map((p) => `${p.username} - ${p.assignedRole}`)
    );

    return {
      team1,
      team2,
      team1Cost,
      team2Cost,
      costDifference,
    };
  }

  static assignFillRole(team) {
    // Rôles requis
    const requiredRoles = ["Top", "Jungle", "Mid", "ADC", "Support"];

    // Trouver les rôles déjà assignés dans l'équipe
    const assignedRoles = team.map((player) => player.assignedRole);

    // Trouver le premier rôle manquant
    for (const role of requiredRoles) {
      if (!assignedRoles.includes(role)) {
        return role;
      }
    }

    // Si tous les rôles sont assignés, retourner le premier (ne devrait pas arriver)
    return requiredRoles[0];
  }
}
