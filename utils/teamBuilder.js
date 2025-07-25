import { Logger } from "./logger.js";

export class TeamBuilder {
  static buildTeams(players) {
    Logger.info(
      `[TEAM_BUILDER] Construction d'équipes pour ${players.length} joueurs`
    );

    // Grouper les joueurs par rôle préféré
    const playersByRole = {
      Top: [],
      Jungle: [],
      Mid: [],
      ADC: [],
      Support: [],
      Fill: [],
    };

    players.forEach((player) => {
      playersByRole[player.selectedRole].push(player);
    });

    Logger.info(`[TEAM_BUILDER] Répartition par rôle:`, playersByRole);

    // Générer toutes les combinaisons possibles
    const allCombinations = this.generateAllCombinations(playersByRole);

    if (allCombinations.length === 0) {
      Logger.error(`[TEAM_BUILDER] Aucune combinaison valide trouvée`);
      return null;
    }

    // Trouver la meilleure combinaison (écart de cost minimal)
    const bestCombination = this.findBestCombination(allCombinations);

    Logger.info(
      `[TEAM_BUILDER] Meilleure combinaison trouvée avec écart de cost: ${bestCombination.costDifference}`
    );

    return bestCombination;
  }

  static generateAllCombinations(playersByRole) {
    const combinations = [];
    const requiredRoles = ["Top", "Jungle", "Mid", "ADC", "Support"];

    // Créer toutes les permutations possibles des joueurs Fill
    const fillPlayers = playersByRole.Fill || [];
    const fillPermutations = this.getPermutations(fillPlayers);

    // Pour chaque permutation de Fill, essayer de remplir les rôles manquants
    for (const fillPermutation of fillPermutations) {
      const combination = this.tryCombination(
        playersByRole,
        fillPermutation,
        requiredRoles
      );
      if (combination) {
        combinations.push(combination);
      }
    }

    return combinations;
  }

  static tryCombination(playersByRole, fillPermutation, requiredRoles) {
    const team1 = [];
    const team2 = [];
    let fillIndex = 0;

    // Assigner d'abord les joueurs avec des rôles spécifiques
    for (const role of requiredRoles) {
      const rolePlayers = playersByRole[role] || [];

      if (rolePlayers.length >= 2) {
        // Plusieurs joueurs pour ce rôle, les assigner aux deux équipes
        team1.push({ ...rolePlayers[0], assignedRole: role, teamId: 1 });
        team2.push({ ...rolePlayers[1], assignedRole: role, teamId: 2 });
      } else if (rolePlayers.length === 1) {
        // Un seul joueur pour ce rôle, l'assigner à l'équipe 1
        team1.push({ ...rolePlayers[0], assignedRole: role, teamId: 1 });

        // Utiliser un joueur Fill pour l'équipe 2
        if (fillIndex < fillPermutation.length) {
          team2.push({
            ...fillPermutation[fillIndex],
            assignedRole: role,
            teamId: 2,
          });
          fillIndex++;
        } else {
          return null; // Pas assez de joueurs Fill
        }
      } else {
        // Aucun joueur pour ce rôle, utiliser des joueurs Fill
        if (fillIndex < fillPermutation.length) {
          team1.push({
            ...fillPermutation[fillIndex],
            assignedRole: role,
            teamId: 1,
          });
          fillIndex++;
        } else {
          return null;
        }

        if (fillIndex < fillPermutation.length) {
          team2.push({
            ...fillPermutation[fillIndex],
            assignedRole: role,
            teamId: 2,
          });
          fillIndex++;
        } else {
          return null;
        }
      }
    }

    // Vérifier que les deux équipes ont 5 joueurs
    if (team1.length !== 5 || team2.length !== 5) {
      return null;
    }

    // Calculer les costs moyens
    const team1Cost =
      team1.reduce((sum, player) => sum + player.selectedCost, 0) / 5;
    const team2Cost =
      team2.reduce((sum, player) => sum + player.selectedCost, 0) / 5;
    const costDifference = Math.abs(team1Cost - team2Cost);

    return {
      team1,
      team2,
      team1Cost,
      team2Cost,
      costDifference,
    };
  }

  static getPermutations(arr) {
    if (arr.length <= 1) return [arr];

    const permutations = [];
    for (let i = 0; i < arr.length; i++) {
      const current = arr[i];
      const remaining = arr.slice(0, i).concat(arr.slice(i + 1));
      const remainingPerms = this.getPermutations(remaining);

      for (const perm of remainingPerms) {
        permutations.push([current, ...perm]);
      }
    }

    return permutations;
  }

  static findBestCombination(combinations) {
    if (combinations.length === 0) return null;

    // Trier par écart de cost croissant
    combinations.sort((a, b) => a.costDifference - b.costDifference);

    // Prendre la meilleure (écart minimal)
    return combinations[0];
  }
}
