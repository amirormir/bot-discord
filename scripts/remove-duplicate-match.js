import fs from "fs/promises";
import path from "path";
import dotenv from "dotenv";
import mongoose from "mongoose";
import { Match } from "../models/Match.js";
import { PlayerStats } from "../models/PlayerStats.js";
import { RatingService } from "../services/ratingService.js";

dotenv.config();

const ratingService = new RatingService();

function getArg(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) return null;
  return process.argv[index + 1] ?? null;
}

function hasFlag(name) {
  return process.argv.includes(name);
}

function avgCost(playerResults) {
  if (!playerResults.length) return 0;
  return (
    playerResults.reduce((sum, player) => sum + (player.cost || 0), 0) /
    playerResults.length
  );
}

function createPlayerState(userId, username) {
  return {
    userId,
    username,
    ...ratingService.defaultPlayerFields(),
    wins: 0,
    losses: 0,
    totalGames: 0,
    mvpCount: 0,
    aceCount: 0,
    avgOpponentCostWhenWin: 0,
    avgOpponentCostWhenLose: 0,
    winsByOpponentCost: new Map(),
    lossesByOpponentCost: new Map(),
    ratingHistory: [],
    lastUpdated: null,
  };
}

function getOrCreateState(states, snapshot) {
  let state = states.get(snapshot.userId);
  if (!state) {
    state = createPlayerState(snapshot.userId, snapshot.username);
    states.set(snapshot.userId, state);
  } else if (snapshot.username && state.username !== snapshot.username) {
    state.username = snapshot.username;
  }
  return state;
}

function serializeTeam(players = []) {
  return players
    .map((player) =>
      [
        player.userId,
        player.role || "unknown-role",
        player.cost ?? "unknown-cost",
      ].join(":")
    )
    .sort()
    .join("|");
}

function buildLegacySourceGameKey(match) {
  if (match.sourceGameKey) return match.sourceGameKey;
  return [
    "legacy-match",
    `createdAt:${new Date(match.createdAt).toISOString()}`,
    `winner:${match.winner}`,
    `team1:${serializeTeam(match.team1.players)}`,
    `team2:${serializeTeam(match.team2.players)}`,
  ].join("::");
}

function buildMatchData(match, states, now) {
  const inflatePlayer = (snapshot) => {
    const state = getOrCreateState(states, snapshot);
    const inflatedRD = ratingService.inflateRDForInactivity(
      { rd: state.rd, lastGameAt: state.lastGameAt },
      now
    );
    state.rd = inflatedRD;

    return {
      userId: snapshot.userId,
      username: snapshot.username,
      rating: state.rating,
      rd: state.rd,
      volatility: state.volatility,
      cost: snapshot.cost,
      role: snapshot.role,
    };
  };

  return {
    team1: { players: match.team1.players.map(inflatePlayer) },
    team2: { players: match.team2.players.map(inflatePlayer) },
    winner: match.winner,
    mvpUserId: match.mvpUserId || null,
    aceUserId: match.aceUserId || null,
    duration: match.duration || null,
    victoryMargin: match.victoryMargin || null,
  };
}

function applyPlayerResult(state, playerResult, opponentAvgCost, matchId, now) {
  const change = playerResult.ratingChange;
  const isWin = playerResult.result === "win";

  state.rating = change.ratingAfter;
  state.rd = change.rdAfter;
  state.volatility = change.volatilityAfter;
  state.gamesPlayed = (state.gamesPlayed || 0) + 1;
  state.lastGameAt = now;
  state.totalGames += 1;

  if (isWin) {
    state.wins += 1;
  } else {
    state.losses += 1;
  }

  if (playerResult.performanceRole === "MVP") {
    state.mvpCount = (state.mvpCount || 0) + 1;
  } else if (playerResult.performanceRole === "ACE") {
    state.aceCount = (state.aceCount || 0) + 1;
  }

  const costKey = Math.round(opponentAvgCost).toString();
  if (isWin) {
    const previousTotal =
      state.avgOpponentCostWhenWin * Math.max(state.wins - 1, 0);
    state.avgOpponentCostWhenWin =
      (previousTotal + opponentAvgCost) / Math.max(state.wins, 1);
    state.winsByOpponentCost.set(
      costKey,
      (state.winsByOpponentCost.get(costKey) || 0) + 1
    );
  } else {
    const previousTotal =
      state.avgOpponentCostWhenLose * Math.max(state.losses - 1, 0);
    state.avgOpponentCostWhenLose =
      (previousTotal + opponentAvgCost) / Math.max(state.losses, 1);
    state.lossesByOpponentCost.set(
      costKey,
      (state.lossesByOpponentCost.get(costKey) || 0) + 1
    );
  }

  state.ratingHistory.push({
    rating: change.ratingAfter,
    rd: change.rdAfter,
    displayScore: change.displayAfter,
    ratingDelta: change.ratingDelta,
    displayDelta: change.displayDelta,
    matchId,
    date: now,
  });
  if (state.ratingHistory.length > 50) {
    state.ratingHistory = state.ratingHistory.slice(-50);
  }

  state.lastUpdated = now;
}

function applyMatch(states, match, matchData, ratingCalculations, now) {
  const team1Avg = avgCost(ratingCalculations.team1);
  const team2Avg = avgCost(ratingCalculations.team2);

  for (const playerResult of ratingCalculations.team1) {
    const state = states.get(playerResult.userId);
    applyPlayerResult(state, playerResult, team2Avg, match.matchId, now);
  }

  for (const playerResult of ratingCalculations.team2) {
    const state = states.get(playerResult.userId);
    applyPlayerResult(state, playerResult, team1Avg, match.matchId, now);
  }

  const mapPlayerSnapshot = (playerResult) => ({
    userId: playerResult.userId,
    username: playerResult.username,
    ratingBefore: playerResult.ratingChange.ratingBefore,
    ratingAfter: playerResult.ratingChange.ratingAfter,
    rdBefore: playerResult.ratingChange.rdBefore,
    rdAfter: playerResult.ratingChange.rdAfter,
    volatilityBefore: playerResult.ratingChange.volatilityBefore,
    volatilityAfter: playerResult.ratingChange.volatilityAfter,
    ratingDelta: playerResult.ratingChange.ratingDelta,
    displayBefore: playerResult.ratingChange.displayBefore,
    displayAfter: playerResult.ratingChange.displayAfter,
    displayDelta: playerResult.ratingChange.displayDelta,
    cost: playerResult.cost,
    role: playerResult.role,
    result: playerResult.result,
    performanceRole: playerResult.performanceRole || null,
  });

  return {
    _id: match._id,
    matchId: match.matchId,
    sourceGameKey: buildLegacySourceGameKey(match),
    team1: {
      players: ratingCalculations.team1.map(mapPlayerSnapshot),
      averageRating: ratingCalculations.matchSummary.team1Avatar.rating,
      averageRD: ratingCalculations.matchSummary.team1Avatar.rd,
      averageCost: avgCost(matchData.team1.players),
    },
    team2: {
      players: ratingCalculations.team2.map(mapPlayerSnapshot),
      averageRating: ratingCalculations.matchSummary.team2Avatar.rating,
      averageRD: ratingCalculations.matchSummary.team2Avatar.rd,
      averageCost: avgCost(matchData.team2.players),
    },
    winner: match.winner,
    mvpUserId: match.mvpUserId || null,
    aceUserId: match.aceUserId || null,
    duration: match.duration || null,
    victoryMargin: match.victoryMargin || null,
    createdAt: match.createdAt,
    resolvedAt: match.resolvedAt,
    resolvedBy: match.resolvedBy,
  };
}

function buildPlayerDocument(state) {
  return {
    userId: state.userId,
    username: state.username,
    rating: state.rating,
    rd: state.rd,
    volatility: state.volatility,
    gamesPlayed: state.gamesPlayed,
    lastGameAt: state.lastGameAt,
    wins: state.wins,
    losses: state.losses,
    totalGames: state.totalGames,
    mvpCount: state.mvpCount || 0,
    aceCount: state.aceCount || 0,
    avgOpponentCostWhenWin: state.avgOpponentCostWhenWin,
    avgOpponentCostWhenLose: state.avgOpponentCostWhenLose,
    winsByOpponentCost: Object.fromEntries(state.winsByOpponentCost.entries()),
    lossesByOpponentCost: Object.fromEntries(
      state.lossesByOpponentCost.entries()
    ),
    ratingHistory: state.ratingHistory,
    lastUpdated: state.lastUpdated,
  };
}

function snapshotStats(player) {
  if (!player) {
    return {
      rating: null,
      rd: null,
      gamesPlayed: 0,
      totalGames: 0,
      wins: 0,
      losses: 0,
    };
  }

  return {
    rating: Number(player.rating.toFixed(3)),
    rd: Number(player.rd.toFixed(3)),
    gamesPlayed: player.gamesPlayed,
    totalGames: player.totalGames,
    wins: player.wins,
    losses: player.losses,
  };
}

async function writeBackupFile(targetMatch, matches, playerStats) {
  const backupDir = path.join(process.cwd(), ".local-backups");
  await fs.mkdir(backupDir, { recursive: true });
  const filePath = path.join(
    backupDir,
    `duplicate-match-backup-${targetMatch.matchId}-${Date.now()}.json`
  );

  const payload = {
    exportedAt: new Date().toISOString(),
    targetMatchId: targetMatch.matchId,
    targetMatch,
    matches,
    playerStats,
  };

  await fs.writeFile(filePath, JSON.stringify(payload, null, 2), "utf8");
  return filePath;
}

async function main() {
  const targetMatchId = getArg("--matchId");
  const applyChanges = hasFlag("--apply");

  if (!targetMatchId) {
    console.error(
      "Usage: node scripts/remove-duplicate-match.js --matchId <matchId> [--apply]"
    );
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGO_URL);

  try {
    const allMatches = await Match.find({}).sort({ createdAt: 1, _id: 1 }).lean();
    const targetMatch = allMatches.find((match) => match.matchId === targetMatchId);

    if (!targetMatch) {
      throw new Error(`Match introuvable: ${targetMatchId}`);
    }

    const remainingMatches = allMatches.filter(
      (match) => match.matchId !== targetMatchId
    );
    const currentPlayerStats = await PlayerStats.find({}).lean();

    const states = new Map();
    const rebuiltMatches = [];

    for (const match of remainingMatches) {
      const now = new Date(match.resolvedAt || match.createdAt);
      const matchData = buildMatchData(match, states, now);
      const ratingCalculations =
        ratingService.calculateMatchRatingChanges(matchData);
      const rebuiltMatch = applyMatch(
        states,
        match,
        matchData,
        ratingCalculations,
        now
      );
      rebuiltMatches.push(rebuiltMatch);
    }

    const rebuiltPlayerDocs = Array.from(states.values()).map(buildPlayerDocument);
    const rebuiltPlayerMap = new Map(
      rebuiltPlayerDocs.map((player) => [player.userId, player])
    );
    const currentPlayerMap = new Map(
      currentPlayerStats.map((player) => [player.userId, player])
    );

    const impactedUsers = [
      ...targetMatch.team1.players.map((player) => player.userId),
      ...targetMatch.team2.players.map((player) => player.userId),
    ];

    console.log(`Target match: ${targetMatch.matchId}`);
    console.log(
      `Created at: ${new Date(targetMatch.createdAt).toISOString()} | Winner: ${targetMatch.winner}`
    );
    console.log(
      `Team 1: ${targetMatch.team1.players.map((player) => player.username).join(", ")}`
    );
    console.log(
      `Team 2: ${targetMatch.team2.players.map((player) => player.username).join(", ")}`
    );
    console.log("");
    console.log("Projected player stat changes after rebuild:");

    for (const userId of impactedUsers) {
      const current = currentPlayerMap.get(userId);
      const rebuilt = rebuiltPlayerMap.get(userId);
      const username = rebuilt?.username || current?.username || userId;
      console.log(
        JSON.stringify(
          {
            username,
            current: snapshotStats(current),
            rebuilt: snapshotStats(rebuilt),
          },
          null,
          2
        )
      );
    }

    if (!applyChanges) {
      console.log("");
      console.log("Dry run only. Re-run with --apply to persist the rebuild.");
      return;
    }

    const backupPath = await writeBackupFile(
      targetMatch,
      allMatches,
      currentPlayerStats
    );

    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        await Match.deleteOne({ matchId: targetMatchId }, { session });

        const bulkOps = rebuiltMatches.map((match) => ({
          updateOne: {
            filter: { _id: match._id },
            update: {
              $set: {
                sourceGameKey: match.sourceGameKey,
                team1: match.team1,
                team2: match.team2,
                winner: match.winner,
                mvpUserId: match.mvpUserId,
                aceUserId: match.aceUserId,
                duration: match.duration,
                victoryMargin: match.victoryMargin,
                createdAt: match.createdAt,
                resolvedAt: match.resolvedAt,
                resolvedBy: match.resolvedBy,
              },
            },
          },
        }));

        if (bulkOps.length > 0) {
          await Match.bulkWrite(bulkOps, { session });
        }

        await PlayerStats.deleteMany({}, { session });
        if (rebuiltPlayerDocs.length > 0) {
          await PlayerStats.insertMany(rebuiltPlayerDocs, { session });
        }
      });
    } finally {
      await session.endSession();
    }

    console.log("");
    console.log(`Rollback applied successfully. Backup written to ${backupPath}`);
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
