export const TIERS = [
  { name: "Seed", min: 0, max: 14 },
  { name: "Sprout", min: 15, max: 29 },
  { name: "Bloom", min: 30, max: 44 },
  { name: "Thorn", min: 45, max: 59 },
  { name: "Crown", min: 60, max: 74 },
  { name: "Eden", min: 75, max: 89 },
  { name: "Heaven", min: 90, max: 100 },
];

const TIER_COLORS = {
  Seed: "#7a6a52",
  Sprout: "#7ec76b",
  Bloom: "#f49ac1",
  Thorn: "#8b3a3a",
  Crown: "#d4af37",
  Eden: "#5fb3b3",
  Heaven: "#ffffff",
  Placements: "#808080",
};

const TIER_EMOJI = {
  Seed: "🌰",
  Sprout: "🌱",
  Bloom: "🌸",
  Thorn: "🥀",
  Crown: "👑",
  Eden: "🌿",
  Heaven: "✨",
  Placements: "🎯",
};

const PLACEMENT_GAMES = 10;
const PROVISIONAL_RD = 120;
const SUBDIVISION_SIZE = 5;

export function findTier(displayScore) {
  return TIERS.find((t) => displayScore >= t.min && displayScore <= t.max);
}

export function getSubDivision(displayScore, tier) {
  const offset = displayScore - tier.min;
  const idx = Math.min(2, Math.floor(offset / SUBDIVISION_SIZE));
  return ["III", "II", "I"][idx];
}

export function tierColor(tierName) {
  return TIER_COLORS[tierName] || "#808080";
}

export function tierEmoji(tierName) {
  return TIER_EMOJI[tierName] || "❔";
}

export function formatTier(tierInfo) {
  if (tierInfo.tier === "Placements") {
    return `${tierEmoji("Placements")} Placements (${tierInfo.placementsRemaining} restantes)`;
  }
  const sub = tierInfo.subDivision ? ` ${tierInfo.subDivision}` : "";
  const prov = tierInfo.isProvisional ? " (provisoire)" : "";
  return `${tierEmoji(tierInfo.tier)} ${tierInfo.tier}${sub}${prov}`;
}

export const TIER_CONFIG = {
  PLACEMENT_GAMES,
  PROVISIONAL_RD,
  SUBDIVISION_SIZE,
};
