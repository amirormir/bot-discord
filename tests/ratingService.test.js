import { RatingService } from "../services/ratingService.js";

const mkPlayer = (overrides = {}) => ({
  userId: overrides.userId || "u",
  username: overrides.username || "Player",
  rating: 1000,
  rd: 200,
  volatility: 0.06,
  gamesPlayed: 0,
  lastGameAt: null,
  ...overrides,
});

const mkTeam = (players) => ({ players });

describe("RatingService", () => {
  let service;

  beforeEach(() => {
    service = new RatingService();
  });

  describe("1. Fix de l'expected (team-vs-team avatar)", () => {
    test("À RD égal, tous les joueurs d'une équipe gagnent le même delta — la punition du fort disparaît", () => {
      const players = [
        mkPlayer({ userId: "weak1", rating: 800, rd: 100 }),
        mkPlayer({ userId: "weak2", rating: 900, rd: 100 }),
        mkPlayer({ userId: "strong", rating: 1500, rd: 100 }),
        mkPlayer({ userId: "avg1", rating: 1000, rd: 100 }),
        mkPlayer({ userId: "avg2", rating: 1000, rd: 100 }),
      ];
      const opponents = [
        mkPlayer({ userId: "o1", rating: 1000, rd: 100 }),
        mkPlayer({ userId: "o2", rating: 1000, rd: 100 }),
        mkPlayer({ userId: "o3", rating: 1000, rd: 100 }),
        mkPlayer({ userId: "o4", rating: 1000, rd: 100 }),
        mkPlayer({ userId: "o5", rating: 1000, rd: 100 }),
      ];

      const result = service.calculateMatchRatingChanges({
        team1: mkTeam(players),
        team2: mkTeam(opponents),
        winner: "team1",
      });

      const deltas = result.team1.map((p) => p.ratingChange.ratingDelta);
      // Le fort gagne strictement plus (ou autant si arrondi)
      // qu'avant, où il était PUNI. Tous les joueurs à RD égal ont le même delta.
      const strongDelta = result.team1.find((p) => p.userId === "strong").ratingChange.ratingDelta;
      const weakDelta = result.team1.find((p) => p.userId === "weak1").ratingChange.ratingDelta;
      // À RD égal, tous les deltas devraient être égaux (avatar partagé)
      expect(strongDelta).toBeCloseTo(weakDelta, 3);
      // Et tous positifs (équipe gagnante)
      deltas.forEach((d) => expect(d).toBeGreaterThan(0));
    });

    test("Un joueur fort dans une équipe faible qui bat une équipe forte gagne BEAUCOUP", () => {
      const team1Avg = 900;
      const team2Avg = 1300;
      const strongPlayer = mkPlayer({ userId: "strong", rating: 1400, rd: 60 });
      const team1 = [
        strongPlayer,
        mkPlayer({ userId: "w1", rating: 800, rd: 60 }),
        mkPlayer({ userId: "w2", rating: 800, rd: 60 }),
        mkPlayer({ userId: "w3", rating: 800, rd: 60 }),
        mkPlayer({ userId: "w4", rating: 700, rd: 60 }),
      ];
      const team2 = Array.from({ length: 5 }, (_, i) =>
        mkPlayer({ userId: `t2_${i}`, rating: team2Avg, rd: 60 })
      );

      const result = service.calculateMatchRatingChanges({
        team1: mkTeam(team1),
        team2: mkTeam(team2),
        winner: "team1",
      });

      const strongDelta = result.team1.find((p) => p.userId === "strong").ratingChange.ratingDelta;
      // Le joueur fort gagne aussi gros que ses coéquipiers (avatar partagé) - pas puni
      expect(strongDelta).toBeGreaterThan(15);
    });
  });

  describe("2. Placements: nouveau joueur bouge beaucoup", () => {
    test("Un nouveau joueur (RD=200) qui gagne 7/10 contre rating 1000 finit > 1100 avec RD ~100", () => {
      let player = service.defaultPlayerFields();
      player.userId = "newbie";
      player.username = "Newbie";

      // Simulation: 10 matchs, 7 victoires
      const outcomes = [1, 1, 1, 1, 1, 1, 1, 0, 0, 0];
      for (const win of outcomes) {
        const team1 = [
          { ...player },
          mkPlayer({ rating: 1000, rd: 100 }),
          mkPlayer({ rating: 1000, rd: 100 }),
          mkPlayer({ rating: 1000, rd: 100 }),
          mkPlayer({ rating: 1000, rd: 100 }),
        ];
        const team2 = Array.from({ length: 5 }, () =>
          mkPlayer({ rating: 1000, rd: 100 })
        );
        const result = service.calculateMatchRatingChanges({
          team1: mkTeam(team1),
          team2: mkTeam(team2),
          winner: win === 1 ? "team1" : "team2",
        });
        const me = result.team1[0];
        player.rating = me.ratingChange.ratingAfter;
        player.rd = me.ratingChange.rdAfter;
        player.volatility = me.ratingChange.volatilityAfter;
        player.gamesPlayed += 1;
      }

      expect(player.rating).toBeGreaterThan(1100);
      expect(player.rd).toBeLessThan(120);
      expect(player.rd).toBeGreaterThan(60);
    });
  });

  describe("3. Decay: l'inactivité gonfle le RD", () => {
    test("Un joueur RD=80 inactif 4 semaines voit son RD remonter à ~90-110", () => {
      const lastGameAt = new Date(Date.now() - 28 * 24 * 60 * 60 * 1000);
      const newRD = service.inflateRDForInactivity({ rd: 80, lastGameAt });
      expect(newRD).toBeGreaterThan(85);
      expect(newRD).toBeLessThan(120);
    });

    test("Un joueur inactif depuis < 7 jours ne subit aucune inflation", () => {
      const lastGameAt = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
      const newRD = service.inflateRDForInactivity({ rd: 80, lastGameAt });
      expect(newRD).toBe(80);
    });

    test("Un joueur très inactif voit son RD plafonner à maxRD", () => {
      const lastGameAt = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
      const newRD = service.inflateRDForInactivity({ rd: 80, lastGameAt });
      expect(newRD).toBeLessThanOrEqual(service.config.maxRD);
    });
  });

  describe("4. Plafonnement: pas de plateau artificiel pour un joueur fort", () => {
    // Le bug original: K-factor cappé à 40 → après 120 games à 60% WR,
    // le meilleur joueur n'atteignait que 1160. Avec Glicko-2 + avatar
    // d'équipe, un joueur objectivement meilleur que le pool doit pouvoir
    // monter franchement au-delà de Bloom.
    test("Un joueur surperformant un pool fixe (~1000) dépasse Bloom en 100 games", () => {
      let player = service.defaultPlayerFields();
      const rng = mulberry32(42);
      const POOL_RATING = 1000;
      // True skill: Crown (~1700). Win prob = 1/(1+10^((opp-1700)/400)) ≈ 0.92 vs 1000.
      const TRUE_RATING = 1700;
      const winProb = (oppRating) =>
        1 / (1 + Math.pow(10, (oppRating - TRUE_RATING) / 400));

      for (let i = 0; i < 100; i++) {
        const oppRating = POOL_RATING + (rng() * 400 - 200);
        const opponents = Array.from({ length: 5 }, () =>
          mkPlayer({ rating: oppRating, rd: 80 })
        );
        const teammates = [
          { ...player },
          mkPlayer({ rating: POOL_RATING, rd: 80 }),
          mkPlayer({ rating: POOL_RATING, rd: 80 }),
          mkPlayer({ rating: POOL_RATING, rd: 80 }),
          mkPlayer({ rating: POOL_RATING, rd: 80 }),
        ];
        const isWin = rng() < winProb(oppRating);
        const result = service.calculateMatchRatingChanges({
          team1: mkTeam(teammates),
          team2: mkTeam(opponents),
          winner: isWin ? "team1" : "team2",
        });
        const me = result.team1[0];
        player.rating = me.ratingChange.ratingAfter;
        player.rd = me.ratingChange.rdAfter;
        player.volatility = me.ratingChange.volatilityAfter;
        player.gamesPlayed += 1;
      }

      // Plus de plafonnement : le rating doit dépasser franchement Bloom (>44).
      expect(service.getDisplayScore(player)).toBeGreaterThan(44);
    });
  });

  describe("5. Tiers", () => {
    test("rating 1000 → Sprout (display 25)", () => {
      const p = { rating: 1000, rd: 100, gamesPlayed: 10 };
      expect(service.getDisplayScore(p)).toBe(25);
      expect(service.getTier(p).tier).toBe("Sprout");
    });

    test("rating 1900 → Eden (display 70 → Crown). 2050 → Eden. 2300 → Heaven.", () => {
      // rating 1900: display = round((1900-500)/20) = 70 → Crown
      expect(service.getDisplayScore({ rating: 1900 })).toBe(70);
      expect(service.getTier({ rating: 1900, rd: 80, gamesPlayed: 50 }).tier).toBe("Crown");

      // rating 2050: display = round((2050-500)/20) = 78 → Eden
      expect(service.getDisplayScore({ rating: 2050 })).toBe(78);
      expect(service.getTier({ rating: 2050, rd: 80, gamesPlayed: 50 }).tier).toBe("Eden");

      // rating 2300: display = round((2300-500)/20) = 90 → Heaven
      expect(service.getDisplayScore({ rating: 2300 })).toBe(90);
      expect(service.getTier({ rating: 2300, rd: 80, gamesPlayed: 50 }).tier).toBe("Heaven");
    });

    test("Pendant les placements (gamesPlayed < 10), le tier est Placements", () => {
      const p = { rating: 1200, rd: 150, gamesPlayed: 3 };
      const tier = service.getTier(p);
      expect(tier.tier).toBe("Placements");
      expect(tier.placementsRemaining).toBe(7);
      expect(tier.displayScore).toBeNull();
    });

    test("Bas/haut bornes display", () => {
      expect(service.getDisplayScore({ rating: 200 })).toBe(0);
      expect(service.getDisplayScore({ rating: 3000 })).toBe(100);
    });

    test("RD élevé après placements → tier provisoire", () => {
      const p = { rating: 1500, rd: 150, gamesPlayed: 12 };
      expect(service.getTier(p).isProvisional).toBe(true);
      const p2 = { rating: 1500, rd: 80, gamesPlayed: 12 };
      expect(service.getTier(p2).isProvisional).toBe(false);
    });
  });

  describe("6. MVP / ACE — bonus arbitre", () => {
    const buildMatch = (mvpUserId = null, aceUserId = null) => {
      const team1 = [
        mkPlayer({ userId: "w1", rating: 1000, rd: 80 }),
        mkPlayer({ userId: "w2", rating: 1000, rd: 80 }),
        mkPlayer({ userId: "w3", rating: 1000, rd: 80 }),
        mkPlayer({ userId: "w4", rating: 1000, rd: 80 }),
        mkPlayer({ userId: "w5", rating: 1000, rd: 80 }),
      ];
      const team2 = [
        mkPlayer({ userId: "l1", rating: 1000, rd: 80 }),
        mkPlayer({ userId: "l2", rating: 1000, rd: 80 }),
        mkPlayer({ userId: "l3", rating: 1000, rd: 80 }),
        mkPlayer({ userId: "l4", rating: 1000, rd: 80 }),
        mkPlayer({ userId: "l5", rating: 1000, rd: 80 }),
      ];
      return service.calculateMatchRatingChanges({
        team1: mkTeam(team1),
        team2: mkTeam(team2),
        winner: "team1",
        mvpUserId,
        aceUserId,
      });
    };

    test("MVP gagne 10% de plus que ses coéquipiers", () => {
      const baseline = buildMatch();
      const withMvp = buildMatch("w1", null);
      const baseDelta = baseline.team1.find((p) => p.userId === "w1").ratingChange.ratingDelta;
      const mvpDelta = withMvp.team1.find((p) => p.userId === "w1").ratingChange.ratingDelta;
      const teammateDelta = withMvp.team1.find((p) => p.userId === "w2").ratingChange.ratingDelta;
      expect(mvpDelta).toBeCloseTo(baseDelta * 1.1, 4);
      expect(teammateDelta).toBeCloseTo(baseDelta, 4);
      expect(withMvp.team1.find((p) => p.userId === "w1").performanceRole).toBe("MVP");
    });

    test("ACE perd 10% de moins que ses coéquipiers", () => {
      const baseline = buildMatch();
      const withAce = buildMatch(null, "l1");
      const baseDelta = baseline.team2.find((p) => p.userId === "l1").ratingChange.ratingDelta;
      const aceDelta = withAce.team2.find((p) => p.userId === "l1").ratingChange.ratingDelta;
      const teammateDelta = withAce.team2.find((p) => p.userId === "l2").ratingChange.ratingDelta;
      // baseDelta est négatif; ACE doit être moins négatif → strictement plus grand
      expect(aceDelta).toBeCloseTo(baseDelta * 0.9, 4);
      expect(aceDelta).toBeGreaterThan(baseDelta);
      expect(teammateDelta).toBeCloseTo(baseDelta, 4);
      expect(withAce.team2.find((p) => p.userId === "l1").performanceRole).toBe("ACE");
    });

    test("MVP doit être dans l'équipe gagnante (sinon ignoré)", () => {
      // mvpUserId désigne un perdant → aucun effet
      const baseline = buildMatch();
      const result = buildMatch("l1", null);
      const baseDelta = baseline.team2.find((p) => p.userId === "l1").ratingChange.ratingDelta;
      const newDelta = result.team2.find((p) => p.userId === "l1").ratingChange.ratingDelta;
      expect(newDelta).toBeCloseTo(baseDelta, 4);
      expect(result.team2.find((p) => p.userId === "l1").performanceRole == null).toBe(true);
    });
  });

  describe("7. Glicko-2 fidélité au papier", () => {
    test("Exemple du papier Glickman 2012 — un seul match", () => {
      // Player 1500, RD 200, vol 0.06, opponents: (1400,30), (1550,100), (1700,300)
      // results: 1, 0, 0 → new rating ≈ 1464.06, new RD ≈ 151.52, new vol ≈ 0.05999
      const player = { rating: 1500, rd: 200, volatility: 0.06 };
      const opponents = [
        { rating: 1400, rd: 30 },
        { rating: 1550, rd: 100 },
        { rating: 1700, rd: 300 },
      ];
      const results = [1, 0, 0];
      const after = service.updatePlayerRating(player, opponents, results);
      expect(after.rating).toBeCloseTo(1464.06, 0);
      expect(after.rd).toBeCloseTo(151.52, 0);
      expect(after.volatility).toBeCloseTo(0.06, 2);
    });
  });
});

// Seeded PRNG for reproducible test
function mulberry32(seed) {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
