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

    // Séparer les joueurs par type
    const specificRolePlayers = players.filter(
      (p) => p.selectedRole !== "Fill"
    );
    const fillPlayers = players.filter((p) => p.selectedRole === "Fill");

    Logger.info(
      `[TEAM_BUILDER] Joueurs avec rôles spécifiques: ${specificRolePlayers.length}`
    );
    Logger.info(`[TEAM_BUILDER] Joueurs Fill: ${fillPlayers.length}`);

    // Créer les équipes
    const team1 = [];
    const team2 = [];

    // Distribuer les joueurs avec des rôles spécifiques de manière équilibrée
    const roleCounts = { Top: 0, Jungle: 0, Mid: 0, ADC: 0, Support: 0 };

    for (const player of specificRolePlayers) {
      roleCounts[player.selectedRole]++;
    }

    Logger.info(
      `[TEAM_BUILDER] Répartition des rôles spécifiques:`,
      roleCounts
    );

    // Distribuer les joueurs spécifiques
    for (const player of specificRolePlayers) {
      if (team1.length < 5 && !this.hasRole(team1, player.selectedRole)) {
        team1.push({
          ...player,
          assignedRole: player.selectedRole,
          teamId: 1,
        });
        Logger.info(
          `[TEAM_BUILDER] ${player.username} (${player.selectedRole}) → Équipe 1`
        );
      } else if (
        team2.length < 5 &&
        !this.hasRole(team2, player.selectedRole)
      ) {
        team2.push({
          ...player,
          assignedRole: player.selectedRole,
          teamId: 2,
        });
        Logger.info(
          `[TEAM_BUILDER] ${player.username} (${player.selectedRole}) → Équipe 2`
        );
      } else {
        // Si le rôle est déjà pris dans les deux équipes, on le met dans l'équipe la moins remplie
        if (team1.length <= team2.length) {
          team1.push({
            ...player,
            assignedRole: player.selectedRole,
            teamId: 1,
          });
          Logger.info(
            `[TEAM_BUILDER] ${player.username} (${player.selectedRole}) → Équipe 1 (doublon)`
          );
        } else {
          team2.push({
            ...player,
            assignedRole: player.selectedRole,
            teamId: 2,
          });
          Logger.info(
            `[TEAM_BUILDER] ${player.username} (${player.selectedRole}) → Équipe 2 (doublon)`
          );
        }
      }
    }

    // Remplir les équipes avec les joueurs Fill
    for (const fillPlayer of fillPlayers) {
      if (team1.length < 5) {
        const missingRole = this.getMissingRole(team1);
        team1.push({
          ...fillPlayer,
          assignedRole: missingRole,
          teamId: 1,
        });
        Logger.info(
          `[TEAM_BUILDER] Fill ${fillPlayer.username} assigné ${missingRole} dans équipe 1`
        );
      } else if (team2.length < 5) {
        const missingRole = this.getMissingRole(team2);
        team2.push({
          ...fillPlayer,
          assignedRole: missingRole,
          teamId: 2,
        });
        Logger.info(
          `[TEAM_BUILDER] Fill ${fillPlayer.username} assigné ${missingRole} dans équipe 2`
        );
      }
    }

    // Vérifier que les équipes sont complètes
    if (team1.length !== 5 || team2.length !== 5) {
      Logger.error(
        `[TEAM_BUILDER] Équipes incomplètes: Team1=${team1.length}, Team2=${team2.length}`
      );
      return null;
    }

    // Vérifier qu'il n'y a pas de doublons
    const team1Roles = team1.map((p) => p.assignedRole);
    const team2Roles = team2.map((p) => p.assignedRole);

    Logger.info(`[TEAM_BUILDER] Rôles équipe 1: ${team1Roles.join(", ")}`);
    Logger.info(`[TEAM_BUILDER] Rôles équipe 2: ${team2Roles.join(", ")}`);

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

  static hasRole(team, role) {
    return team.some((player) => player.assignedRole === role);
  }

  static getMissingRole(team) {
    // Rôles requis pour une équipe complète
    const requiredRoles = ["Top", "Jungle", "Mid", "ADC", "Support"];

    // Trouver les rôles déjà assignés dans l'équipe
    const assignedRoles = team.map((player) => player.assignedRole);

    // Trouver le premier rôle manquant
    for (const role of requiredRoles) {
      if (!assignedRoles.includes(role)) {
        return role;
      }
    }

    // Si tous les rôles sont assignés (ne devrait pas arriver), retourner le premier
    Logger.warn(
      `[TEAM_BUILDER] Tous les rôles sont déjà assignés dans l'équipe`
    );
    return requiredRoles[0];
  }
}
