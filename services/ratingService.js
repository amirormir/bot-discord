import { Logger } from "../utils/logger.js";
import { TIERS, TIER_CONFIG, findTier, getSubDivision } from "./tiers.js";

const GLICKO_SCALE = 173.7178;
const CONVERGENCE_EPSILON = 0.000001;

export class RatingService {
  constructor() {
    this.config = {
      tau: 0.5,

      defaultRating: 1000,
      defaultRD: 200,
      defaultVolatility: 0.06,

      minRD: 30,
      maxRD: 350,

      displayMin: 500,
      displayMax: 2500,

      decayC: 30,
      decayGracePeriodDays: 7,
      decayPeriodDays: 7,

      leaderboardMinGames: TIER_CONFIG.PLACEMENT_GAMES,
      leaderboardMaxRD: 120,
      leaderboardDropRD: 150,

      // Performance bonuses awarded by the referee at end of game:
      //  - MVP (winning team): rating gain × (1 + mvpBonusPct)
      //  - ACE (losing team) : rating loss × (1 − aceReductionPct)
      mvpBonusPct: 0.10,
      aceReductionPct: 0.10,
    };
  }

  // ---- Glicko-2 core ----

  _toGlicko2(rating, rd) {
    return {
      mu: (rating - 1500) / GLICKO_SCALE,
      phi: rd / GLICKO_SCALE,
    };
  }

  _fromGlicko2(mu, phi) {
    return {
      rating: mu * GLICKO_SCALE + 1500,
      rd: phi * GLICKO_SCALE,
    };
  }

  _g(phi) {
    return 1 / Math.sqrt(1 + (3 * phi * phi) / (Math.PI * Math.PI));
  }

  _E(mu, muJ, phiJ) {
    return 1 / (1 + Math.exp(-this._g(phiJ) * (mu - muJ)));
  }

  _newVolatility(sigma, phi, v, delta, tau) {
    const a = Math.log(sigma * sigma);
    const f = (x) => {
      const ex = Math.exp(x);
      const num = ex * (delta * delta - phi * phi - v - ex);
      const den = 2 * Math.pow(phi * phi + v + ex, 2);
      return num / den - (x - a) / (tau * tau);
    };

    let A = a;
    let B;
    if (delta * delta > phi * phi + v) {
      B = Math.log(delta * delta - phi * phi - v);
    } else {
      let k = 1;
      while (f(a - k * tau) < 0) k++;
      B = a - k * tau;
    }

    let fA = f(A);
    let fB = f(B);
    let iterations = 0;
    while (Math.abs(B - A) > CONVERGENCE_EPSILON && iterations < 100) {
      const C = A + ((A - B) * fA) / (fB - fA);
      const fC = f(C);
      if (fC * fB <= 0) {
        A = B;
        fA = fB;
      } else {
        fA = fA / 2;
      }
      B = C;
      fB = fC;
      iterations++;
    }
    return Math.exp(A / 2);
  }

  /**
   * Apply one rating period of Glicko-2 to a player.
   * @param {{rating:number, rd:number, volatility:number}} player
   * @param {Array<{rating:number, rd:number}>} opponents
   * @param {Array<number>} results — 1 for win, 0 for loss (0.5 draw also accepted)
   * @returns {{rating:number, rd:number, volatility:number}}
   */
  updatePlayerRating(player, opponents, results) {
    if (opponents.length === 0) {
      const { mu, phi } = this._toGlicko2(player.rating, player.rd);
      const newPhi = Math.sqrt(phi * phi + player.volatility * player.volatility);
      const { rating, rd } = this._fromGlicko2(mu, newPhi);
      return {
        rating,
        rd: this._clampRD(rd),
        volatility: player.volatility,
      };
    }

    const { mu, phi } = this._toGlicko2(player.rating, player.rd);

    const opponentsG2 = opponents.map((o) => this._toGlicko2(o.rating, o.rd));

    let vInv = 0;
    let deltaSum = 0;
    for (let i = 0; i < opponentsG2.length; i++) {
      const oj = opponentsG2[i];
      const gPhi = this._g(oj.phi);
      const E = this._E(mu, oj.mu, oj.phi);
      vInv += gPhi * gPhi * E * (1 - E);
      deltaSum += gPhi * (results[i] - E);
    }
    const v = 1 / vInv;
    const delta = v * deltaSum;

    const newSigma = this._newVolatility(
      player.volatility,
      phi,
      v,
      delta,
      this.config.tau
    );

    const phiStar = Math.sqrt(phi * phi + newSigma * newSigma);
    const newPhi = 1 / Math.sqrt(1 / (phiStar * phiStar) + 1 / v);
    const newMu = mu + newPhi * newPhi * deltaSum;

    const { rating, rd } = this._fromGlicko2(newMu, newPhi);
    return {
      rating,
      rd: this._clampRD(rd),
      volatility: newSigma,
    };
  }

  /**
   * Glicko-2 update where the EXPECTED outcome E is computed from the
   * team avatar's rating instead of the individual player's rating.
   * The player's own (rating, rd, volatility) still control:
   *   - by how much their rating moves (proportional to their phi^2)
   *   - their RD's evolution
   *   - their volatility's evolution
   *
   * Net effect on a 5v5:
   *   - Two teammates at the same RD get the SAME rating delta after a match
   *     (the "punishment of the strong" disappears)
   *   - A new player (RD=200) moves ~3-4× more than a veteran (RD=50)
   *   - The amplitude of the move scales with how "surprising" the result
   *     was relative to the team avatars' rating gap
   */
  _updatePlayerAsTeamMember(player, teamAvatar, opponentAvatar, result) {
    const { mu: muTeam, phi: phiTeam } = this._toGlicko2(
      teamAvatar.rating,
      teamAvatar.rd
    );
    const { phi } = this._toGlicko2(player.rating, player.rd);
    const { mu: muOpp, phi: phiOpp } = this._toGlicko2(
      opponentAvatar.rating,
      opponentAvatar.rd
    );

    const gPhi = this._g(phiOpp);
    const E = this._E(muTeam, muOpp, phiOpp);
    const v = 1 / (gPhi * gPhi * E * (1 - E));
    const deltaSum = gPhi * (result - E);
    const delta = v * deltaSum;

    const newSigma = this._newVolatility(
      player.volatility,
      phi,
      v,
      delta,
      this.config.tau
    );

    const phiStar = Math.sqrt(phi * phi + newSigma * newSigma);
    const newPhi = 1 / Math.sqrt(1 / (phiStar * phiStar) + 1 / v);
    // Apply the team-level rating drift to the player's own rating,
    // scaled by their own phi_new^2 (so RD controls amplitude).
    const newMuPlayer = (player.rating - 1500) / GLICKO_SCALE + newPhi * newPhi * deltaSum;

    const { rating, rd } = this._fromGlicko2(newMuPlayer, newPhi);
    return {
      rating,
      rd: this._clampRD(rd),
      volatility: newSigma,
    };
  }

  _clampRD(rd) {
    return Math.max(this.config.minRD, Math.min(this.config.maxRD, rd));
  }

  // ---- Inactivity decay ----

  inflateRDForInactivity(player, now = new Date()) {
    if (!player.lastGameAt) return player.rd;
    const ms = now.getTime() - new Date(player.lastGameAt).getTime();
    const days = ms / (1000 * 60 * 60 * 24);
    const periodsInactive = Math.max(
      0,
      (days - this.config.decayGracePeriodDays) / this.config.decayPeriodDays
    );
    if (periodsInactive === 0) return player.rd;
    const c = this.config.decayC;
    const newRD = Math.sqrt(player.rd * player.rd + c * c * periodsInactive);
    return this._clampRD(newRD);
  }

  // ---- Team-vs-team match resolution ----

  /**
   * Compute rating changes for a 5v5 match using Glicko-2 with a team avatar.
   * Each player on team A is treated as having faced the average opponent of team B.
   * The magnitude of each player's delta is governed by their own RD.
   * @param {{team1:{players:Array}, team2:{players:Array}, winner:"team1"|"team2"}} matchData
   * @returns {{team1:Array, team2:Array, matchSummary:Object}}
   */
  calculateMatchRatingChanges(matchData) {
    const { team1, team2, winner, mvpUserId = null, aceUserId = null } = matchData;

    const avg = (arr) => arr.reduce((s, x) => s + x, 0) / arr.length;

    const team1Avatar = {
      rating: avg(team1.players.map((p) => p.rating)),
      rd: avg(team1.players.map((p) => p.rd)),
    };
    const team2Avatar = {
      rating: avg(team2.players.map((p) => p.rating)),
      rd: avg(team2.players.map((p) => p.rd)),
    };

    Logger.info(
      `[RATING_SERVICE] Avatars - Team1: r=${team1Avatar.rating.toFixed(1)} rd=${team1Avatar.rd.toFixed(1)} | Team2: r=${team2Avatar.rating.toFixed(1)} rd=${team2Avatar.rd.toFixed(1)} | Winner=${winner}`
    );

    const processTeam = (players, teamAvatar, opponentAvatar, isWinner) => {
      const result = isWinner ? 1 : 0;
      return players.map((player) => {
        const before = {
          rating: player.rating,
          rd: player.rd,
          volatility: player.volatility,
        };
        // Team-vs-team adapted Glicko-2: use the TEAM AVATAR's rating
        // (not the player's own) to compute the expected outcome E.
        // The player's individual rating, RD, and volatility govern how
        // much they move — so newcomers move more than veterans, but
        // a strong player in a weak team gains the same delta as their
        // weaker teammates instead of being "punished" by his own rating.
        const after = this._updatePlayerAsTeamMember(
          before,
          teamAvatar,
          opponentAvatar,
          result
        );
        const ratingChange = after.rating - before.rating;
        const displayBefore = this.getDisplayScore(before);
        const displayAfter = this.getDisplayScore(after);
        const displayChange = displayAfter - displayBefore;

        Logger.info(
          `[RATING_SERVICE] ${player.username}: r ${before.rating.toFixed(1)} → ${after.rating.toFixed(1)} (${ratingChange >= 0 ? "+" : ""}${ratingChange.toFixed(1)}) | rd ${before.rd.toFixed(1)} → ${after.rd.toFixed(1)} | display ${displayBefore} → ${displayAfter}`
        );

        return {
          ...player,
          result: isWinner ? "win" : "loss",
          ratingChange: {
            ratingBefore: before.rating,
            ratingAfter: after.rating,
            rdBefore: before.rd,
            rdAfter: after.rd,
            volatilityBefore: before.volatility,
            volatilityAfter: after.volatility,
            ratingDelta: ratingChange,
            displayBefore,
            displayAfter,
            displayDelta: displayChange,
          },
        };
      });
    };

    const team1Results = processTeam(team1.players, team1Avatar, team2Avatar, winner === "team1");
    const team2Results = processTeam(team2.players, team2Avatar, team1Avatar, winner === "team2");

    const applyPerformanceModifier = (results) =>
      results.map((p) => {
        let modifier = 1;
        let performanceRole = null;
        if (mvpUserId && p.userId === mvpUserId && p.result === "win") {
          modifier = 1 + this.config.mvpBonusPct;
          performanceRole = "MVP";
        } else if (aceUserId && p.userId === aceUserId && p.result === "loss") {
          modifier = 1 - this.config.aceReductionPct;
          performanceRole = "ACE";
        }
        if (modifier === 1) return p;

        const oldDelta = p.ratingChange.ratingDelta;
        const newDelta = oldDelta * modifier;
        const newRatingAfter = p.ratingChange.ratingBefore + newDelta;
        const newDisplayAfter = this.getDisplayScore({ rating: newRatingAfter });
        Logger.info(
          `[RATING_SERVICE] ${performanceRole} ${p.username}: delta ${oldDelta.toFixed(1)} → ${newDelta.toFixed(1)} (×${modifier.toFixed(2)})`
        );
        return {
          ...p,
          performanceRole,
          ratingChange: {
            ...p.ratingChange,
            ratingAfter: newRatingAfter,
            ratingDelta: newDelta,
            displayAfter: newDisplayAfter,
            displayDelta: newDisplayAfter - p.ratingChange.displayBefore,
          },
        };
      });

    return {
      team1: applyPerformanceModifier(team1Results),
      team2: applyPerformanceModifier(team2Results),
      matchSummary: {
        team1Avatar,
        team2Avatar,
        winner,
        mvpUserId,
        aceUserId,
        team1AverageRating: team1Avatar.rating,
        team2AverageRating: team2Avatar.rating,
      },
    };
  }

  // ---- Display ----

  getDisplayScore(player) {
    const { displayMin, displayMax } = this.config;
    const raw = Math.round(((player.rating - displayMin) / (displayMax - displayMin)) * 100);
    return Math.max(0, Math.min(100, raw));
  }

  getTier(player) {
    if (player.gamesPlayed < TIER_CONFIG.PLACEMENT_GAMES) {
      return {
        tier: "Placements",
        subDivision: null,
        displayScore: null,
        isProvisional: true,
        placementsRemaining: TIER_CONFIG.PLACEMENT_GAMES - player.gamesPlayed,
      };
    }
    const displayScore = this.getDisplayScore(player);
    const tier = findTier(displayScore);
    return {
      tier: tier.name,
      subDivision: getSubDivision(displayScore, tier),
      displayScore,
      isProvisional: player.rd > TIER_CONFIG.PROVISIONAL_RD,
      placementsRemaining: 0,
    };
  }

  isLeaderboardEligible(player) {
    return (
      player.gamesPlayed >= this.config.leaderboardMinGames &&
      player.rd <= this.config.leaderboardMaxRD
    );
  }

  // ---- Config helpers ----

  updateConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
    Logger.info(`[RATING_SERVICE] Configuration mise à jour`);
  }

  getConfig() {
    return { ...this.config };
  }

  defaultPlayerFields() {
    return {
      rating: this.config.defaultRating,
      rd: this.config.defaultRD,
      volatility: this.config.defaultVolatility,
      gamesPlayed: 0,
      lastGameAt: null,
    };
  }
}

export { TIERS };
