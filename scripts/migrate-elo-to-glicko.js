/**
 * One-shot migration: convert legacy `elo` field on PlayerStats documents
 * into Glicko-2 fields (rating, rd, volatility, gamesPlayed, lastGameAt).
 *
 * Strategy:
 *   - rating = max(800, ancien_elo)
 *   - rd = 180 (incertitude modérée)
 *   - volatility = 0.06
 *   - gamesPlayed = totalGames (joueurs existants)
 *   - lastGameAt = max(eloHistory.date) || lastUpdated || now
 *
 * Usage:
 *   node scripts/migrate-elo-to-glicko.js          # dry-run, lists changes
 *   node scripts/migrate-elo-to-glicko.js --apply  # actually writes
 */
import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

const APPLY = process.argv.includes("--apply");
const MONGO_URL = process.env.MONGO_URL;

if (!MONGO_URL) {
  console.error("MONGO_URL env var missing");
  process.exit(1);
}

const DEFAULT_RD_FOR_EXISTING = 180;
const DEFAULT_VOLATILITY = 0.06;
const MIN_RATING_FLOOR = 800;

async function main() {
  await mongoose.connect(MONGO_URL);
  console.log("[migrate] Connected to MongoDB");

  const collection = mongoose.connection.collection("playerstats");
  const docs = await collection.find({}).toArray();
  console.log(`[migrate] Found ${docs.length} PlayerStats documents`);

  let migrated = 0;
  let skipped = 0;
  const ops = [];

  for (const doc of docs) {
    const hasGlickoFields = doc.rating != null && doc.rd != null;
    const hasLegacyElo = typeof doc.elo === "number";

    if (hasGlickoFields && !hasLegacyElo) {
      skipped++;
      continue;
    }

    const sourceElo = hasLegacyElo ? doc.elo : 1000;
    const newRating = Math.max(MIN_RATING_FLOOR, sourceElo);

    // Last game date: best effort
    let lastGameAt = null;
    if (Array.isArray(doc.eloHistory) && doc.eloHistory.length > 0) {
      const dates = doc.eloHistory
        .map((h) => (h && h.date ? new Date(h.date).getTime() : 0))
        .filter((t) => t > 0);
      if (dates.length > 0) lastGameAt = new Date(Math.max(...dates));
    }
    if (!lastGameAt && doc.lastUpdated) lastGameAt = new Date(doc.lastUpdated);
    if (!lastGameAt) lastGameAt = new Date();

    const gamesPlayed = typeof doc.totalGames === "number" ? doc.totalGames : 0;

    const set = {
      rating: newRating,
      rd: DEFAULT_RD_FOR_EXISTING,
      volatility: DEFAULT_VOLATILITY,
      gamesPlayed,
      lastGameAt,
    };

    const unset = {};
    if (hasLegacyElo) unset.elo = "";
    if (Array.isArray(doc.eloHistory)) unset.eloHistory = "";

    const update = { $set: set };
    if (Object.keys(unset).length > 0) update.$unset = unset;

    console.log(
      `[migrate] ${doc.username || doc.userId}: elo=${sourceElo} → rating=${newRating}, rd=${DEFAULT_RD_FOR_EXISTING}, gamesPlayed=${gamesPlayed}, lastGameAt=${lastGameAt.toISOString()}`
    );

    ops.push({ updateOne: { filter: { _id: doc._id }, update } });
    migrated++;
  }

  if (!APPLY) {
    console.log(
      `\n[migrate] DRY RUN. ${migrated} would be migrated, ${skipped} already on Glicko-2.`
    );
    console.log(`[migrate] Re-run with --apply to commit changes.`);
  } else if (ops.length > 0) {
    const result = await collection.bulkWrite(ops);
    console.log(
      `\n[migrate] APPLIED. matched=${result.matchedCount} modified=${result.modifiedCount} skipped=${skipped}`
    );
  } else {
    console.log(`[migrate] Nothing to migrate.`);
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("[migrate] Fatal error:", err);
  process.exit(1);
});
