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
        `[TEAM_BUILDER] Nombre de joueurs incorrect: ${players.length} (attendu: 10)`
      );
      return null;
    }

    // Validation préalable : vérifier la distribution des rôles
    const roleDistribution = this.analyzeRoleDistribution(players);
    Logger.info(
      `[TEAM_BUILDER] Distribution des rôles: ${JSON.stringify(roleDistribution)}`
    );

    const validationResult = this.validateRoleDistribution(roleDistribution);
    if (!validationResult.valid) {
      Logger.error(
        `[TEAM_BUILDER] Distribution des rôles invalide: ${validationResult.error}`
      );
      Logger.error(
        `[TEAM_BUILDER] Détails: ${JSON.stringify(roleDistribution, null, 2)}`
      );
      return null;
    }

    Logger.info(
      `[TEAM_BUILDER] Validation des rôles réussie, recherche de la meilleure répartition...`
    );

    // Utiliser l'algorithme de backtracking pour trouver la meilleure répartition
    const result = this.findOptimalTeamDistribution(players);

    if (!result) {
      Logger.error("[TEAM_BUILDER] Aucune répartition valide trouvée");
      Logger.error(
        `[TEAM_BUILDER] Distribution des rôles: ${JSON.stringify(roleDistribution)}`
      );
      Logger.error(
        `[TEAM_BUILDER] Vérifiez que chaque rôle a au moins 2 joueurs OU qu'il y a assez de Fill pour combler les manques`
      );
      return null;
    }

    Logger.info(
      `[TEAM_BUILDER] ✅ Meilleure répartition trouvée avec un écart de cost de ${result.costDifference.toFixed(
        2
      )}`
    );
    Logger.info(
      `[TEAM_BUILDER] Équipe 1 - Cost: ${result.team1Cost.toFixed(2)}, Équipe 2 - Cost: ${result.team2Cost.toFixed(2)}`
    );

    return result;
  }

  /**
   * Algorithme de backtracking pour trouver la répartition optimale
   * @param {Array} players - Liste des 10 joueurs
   * @returns {Object|null} - Meilleure répartition ou null si impossible
   */
  /**
   * Analyse la distribution des rôles parmi les joueurs
   * @param {Array} players - Liste des joueurs
   * @returns {Object} - Distribution des rôles
   */
  static analyzeRoleDistribution(players) {
    const distribution = {
      Top: 0,
      Jungle: 0,
      Mid: 0,
      ADC: 0,
      Support: 0,
      Fill: 0,
    };

    players.forEach((player) => {
      const role = player.selectedRole || "Fill";
      if (distribution.hasOwnProperty(role)) {
        distribution[role]++;
      } else {
        distribution.Fill++;
      }
    });

    return distribution;
  }

  /**
   * Valide si la distribution des rôles permet de créer deux équipes valides
   * @param {Object} distribution - Distribution des rôles
   * @returns {Object} - {valid: boolean, error?: string}
   */
  static validateRoleDistribution(distribution) {
    const requiredRoles = ["Top", "Jungle", "Mid", "ADC", "Support"];
    const fillCount = distribution.Fill || 0;

    // Compter combien de rôles ont au moins 2 joueurs
    let rolesWithAtLeast2 = 0;
    let rolesWithAtLeast1 = 0;
    const missingRoles = [];

    for (const role of requiredRoles) {
      const count = distribution[role] || 0;
      if (count >= 2) {
        rolesWithAtLeast2++;
      }
      if (count >= 1) {
        rolesWithAtLeast1++;
      } else {
        missingRoles.push(role);
      }
    }

    // Pour créer 2 équipes valides, on a besoin soit :
    // 1. Au moins 2 joueurs de chaque rôle (idéal)
    // 2. Au moins 1 joueur de chaque rôle + assez de Fill pour combler les manques
    // 3. Certains rôles avec 2+ joueurs + Fill pour les autres

    // Cas idéal : tous les rôles ont au moins 2 joueurs
    if (rolesWithAtLeast2 === 5) {
      return { valid: true };
    }

    // Cas acceptable : tous les rôles ont au moins 1 joueur + assez de Fill
    if (rolesWithAtLeast1 === 5) {
      // On a besoin d'au moins 5 Fill pour combler les manques dans les 2 équipes
      // (chaque équipe a besoin de 5 rôles, donc au total 10 rôles à remplir)
      // Si chaque rôle a au moins 1 joueur, on a 5 rôles couverts, il faut 5 Fill pour les 5 autres
      const totalSpecific = requiredRoles.reduce(
        (sum, role) => sum + (distribution[role] || 0),
        0
      );
      const totalNeeded = 10; // 5 rôles × 2 équipes
      const fillNeeded = totalNeeded - totalSpecific;

      if (fillCount >= fillNeeded) {
        return { valid: true };
      } else {
        return {
          valid: false,
          error: `Pas assez de Fill. Besoin de ${fillNeeded} Fill, mais seulement ${fillCount} disponibles.`,
        };
      }
    }

    // Cas problématique : certains rôles manquent complètement
    if (missingRoles.length > 0) {
      const fillNeeded = missingRoles.length * 2; // 2 équipes × nombre de rôles manquants
      if (fillCount >= fillNeeded) {
        return { valid: true };
      } else {
        return {
          valid: false,
          error: `Rôles manquants: ${missingRoles.join(", ")}. Besoin de ${fillNeeded} Fill, mais seulement ${fillCount} disponibles.`,
        };
      }
    }

    // Cas complexe : calculer si on peut répartir avec la combinaison actuelle
    // On a besoin de 10 rôles au total (5 par équipe)
    const totalSpecific = requiredRoles.reduce(
      (sum, role) => sum + (distribution[role] || 0),
      0
    );
    const totalNeeded = 10;
    const fillNeeded = totalNeeded - totalSpecific;

    if (fillCount >= fillNeeded) {
      return { valid: true };
    }

    return {
      valid: false,
      error: `Distribution insuffisante. Total spécifique: ${totalSpecific}, Fill: ${fillCount}, Besoin: ${fillNeeded} Fill supplémentaires.`,
    };
  }

  static findOptimalTeamDistribution(players) {
    const bestSolution = {
      team1: null,
      team2: null,
      costDifference: Infinity,
    };

    // Générer toutes les combinaisons possibles de 5 joueurs parmi 10
    const combinations = this.generateCombinations(players, 5);

    Logger.info(
      `[TEAM_BUILDER] Test de ${combinations.length} combinaisons possibles`
    );

    let validCombinations = 0;
    let invalidCombinations = 0;
    let invalidReasons = {
      invalidDistribution: 0,
      cannotAssignRoles: 0,
      other: 0,
    };

    for (const team1Players of combinations) {
      const team2Players = players.filter((p) => !team1Players.includes(p));

      // Vérifier si cette répartition est valide
      if (this.isValidTeamDistribution(team1Players, team2Players)) {
        const team1 = this.assignRolesToTeam(team1Players);
        const team2 = this.assignRolesToTeam(team2Players);

        if (team1 && team2) {
          validCombinations++;
          const team1Cost = this.calculateTeamCost(team1);
          const team2Cost = this.calculateTeamCost(team2);
          const costDifference = Math.abs(team1Cost - team2Cost);

          // Garder la meilleure solution
          if (costDifference < bestSolution.costDifference) {
            bestSolution.team1 = team1;
            bestSolution.team2 = team2;
            bestSolution.costDifference = costDifference;
            bestSolution.team1Cost = team1Cost;
            bestSolution.team2Cost = team2Cost;
          }
        } else {
          invalidCombinations++;
          invalidReasons.cannotAssignRoles++;
        }
      } else {
        invalidCombinations++;
        invalidReasons.invalidDistribution++;
      }
    }

    Logger.info(
      `[TEAM_BUILDER] Résultats: ${validCombinations} combinaisons valides, ${invalidCombinations} invalides`
    );
    Logger.info(
      `[TEAM_BUILDER] Raisons d'invalidité: ${JSON.stringify(invalidReasons)}`
    );

    // Retourner null si aucune solution valide n'a été trouvée
    if (bestSolution.team1 === null) {
      Logger.error(
        `[TEAM_BUILDER] Aucune combinaison valide trouvée sur ${combinations.length} testées`
      );
      return null;
    }

    return bestSolution;
  }

  /**
   * Génère toutes les combinaisons de k éléments parmi n
   * @param {Array} arr - Tableau d'éléments
   * @param {number} k - Taille des combinaisons
   * @returns {Array} - Toutes les combinaisons possibles
   */
  static generateCombinations(arr, k) {
    if (k === 0) return [[]];
    if (k === arr.length) return [arr];
    if (k > arr.length) return [];

    const combinations = [];

    function backtrack(start, current) {
      if (current.length === k) {
        combinations.push([...current]);
        return;
      }

      for (let i = start; i < arr.length; i++) {
        current.push(arr[i]);
        backtrack(i + 1, current);
        current.pop();
      }
    }

    backtrack(0, []);
    return combinations;
  }

  /**
   * Vérifie si une répartition de joueurs est valide
   * @param {Array} team1Players - Joueurs de l'équipe 1
   * @param {Array} team2Players - Joueurs de l'équipe 2
   * @returns {boolean} - True si la répartition est valide
   */
  static isValidTeamDistribution(team1Players, team2Players) {
    // Chaque équipe doit avoir exactement 5 joueurs
    if (team1Players.length !== 5 || team2Players.length !== 5) {
      return false;
    }

    // Vérifier qu'on peut assigner les rôles à chaque équipe
    return (
      this.canAssignRoles(team1Players) && this.canAssignRoles(team2Players)
    );
  }

  /**
   * Vérifie si on peut assigner les 5 rôles requis à une équipe
   * @param {Array} players - Joueurs de l'équipe
   * @returns {boolean} - True si on peut assigner tous les rôles
   */
  static canAssignRoles(players) {
    const requiredRoles = ["Top", "Jungle", "Mid", "ADC", "Support"];
    const specificRolePlayers = players.filter(
      (p) => p.selectedRole !== "Fill"
    );
    const fillPlayers = players.filter((p) => p.selectedRole === "Fill");

    // Compter les rôles spécifiques disponibles
    const availableRoles = {};
    for (const role of requiredRoles) {
      availableRoles[role] = specificRolePlayers.filter(
        (p) => p.selectedRole === role
      ).length;
    }

    // Vérifier qu'on a assez de joueurs Fill pour combler les manques
    const totalSpecific = specificRolePlayers.length;
    const totalFill = fillPlayers.length;

    // On doit avoir exactement 5 joueurs au total
    if (totalSpecific + totalFill !== 5) {
      Logger.warning(
        `[TEAM_BUILDER] canAssignRoles: Nombre incorrect de joueurs (${totalSpecific} spécifiques + ${totalFill} Fill = ${totalSpecific + totalFill}, attendu 5)`
      );
      return false;
    }

    // On doit pouvoir couvrir tous les rôles requis
    const missingRoles = requiredRoles.filter(
      (role) => availableRoles[role] === 0
    );

    // Si on a des rôles manquants, on doit avoir assez de Fill pour les combler
    const canAssign = missingRoles.length <= totalFill;

    if (!canAssign) {
      Logger.warning(
        `[TEAM_BUILDER] canAssignRoles: Rôles manquants (${missingRoles.join(", ")}) mais seulement ${totalFill} Fill disponibles`
      );
    }

    return canAssign;
  }

  /**
   * Assigne les rôles aux joueurs d'une équipe
   * @param {Array} players - Joueurs de l'équipe
   * @returns {Array|null} - Équipe avec rôles assignés ou null si impossible
   */
  static assignRolesToTeam(players) {
    const requiredRoles = ["Top", "Jungle", "Mid", "ADC", "Support"];
    const team = [];
    const usedRoles = new Set();

    // D'abord assigner les joueurs avec des rôles spécifiques
    for (const player of players) {
      if (player.selectedRole !== "Fill") {
        if (!usedRoles.has(player.selectedRole)) {
          team.push({
            ...player,
            assignedRole: player.selectedRole,
            teamId: team.length < 5 ? 1 : 2,
          });
          usedRoles.add(player.selectedRole);
        }
      }
    }

    // Ensuite assigner les joueurs Fill aux rôles manquants
    const fillPlayers = players.filter((p) => p.selectedRole === "Fill");
    for (const fillPlayer of fillPlayers) {
      const missingRole = requiredRoles.find((role) => !usedRoles.has(role));
      if (missingRole) {
        team.push({
          ...fillPlayer,
          assignedRole: missingRole,
          teamId: team.length < 5 ? 1 : 2,
        });
        usedRoles.add(missingRole);
      }
    }

    // Vérifier qu'on a bien assigné tous les rôles
    if (usedRoles.size !== 5) {
      Logger.warning(
        `[TEAM_BUILDER] Impossible d'assigner tous les rôles à l'équipe`
      );
      return null;
    }

    return team;
  }

  /**
   * Calcule le coût moyen d'une équipe
   * @param {Array} team - Équipe avec joueurs et rôles assignés
   * @returns {number} - Coût moyen de l'équipe
   */
  static calculateTeamCost(team) {
    if (team.length === 0) return 0;
    const totalCost = team.reduce(
      (sum, player) => sum + player.selectedCost,
      0
    );
    return totalCost / team.length;
  }

  /**
   * Vérifie si une équipe a un rôle spécifique
   * @param {Array} team - Équipe
   * @param {string} role - Rôle à vérifier
   * @returns {boolean} - True si l'équipe a ce rôle
   */
  static hasRole(team, role) {
    return team.some((player) => player.assignedRole === role);
  }

  /**
   * Trouve le premier rôle manquant dans une équipe
   * @param {Array} team - Équipe
   * @returns {string|null} - Premier rôle manquant ou null
   */
  static getMissingRole(team) {
    const requiredRoles = ["Top", "Jungle", "Mid", "ADC", "Support"];
    const assignedRoles = team.map((player) => player.assignedRole);

    for (const role of requiredRoles) {
      if (!assignedRoles.includes(role)) {
        return role;
      }
    }

    return null;
  }
}
