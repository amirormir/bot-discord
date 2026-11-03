// Couleurs du site TCGarden (globals.css) : un jardin nocturne bioluminescent.

export const COLORS = {
  night950: "#030907",
  night900: "#050e0b",
  night850: "#0a1611",
  night800: "#0d1b15",
  night700: "#14281f",
  night600: "#1d372c",
  night500: "#2a4a3c",
  mint100: "#e3fff4",
  mint200: "#c2fbe5",
  mint300: "#8ff5cf",
  mint: "#3ee6a8",
  mint500: "#1fc98c",
  firefly: "#f2f6c0",
  fireflyDeep: "#e4d98a",
  lune: "#e3eee7",
  lichen: "#94ac9f",
  ink: "#f2f9f5",
};

/** Le prisme des Mythiques, et la glace des Variantes. */
export const PRISM = ["#ff5fd2", "#a77bff", "#45d9ff", "#6effc8", "#ffe066", "#ff8a5c"];
export const ICE = ["#7df9ff", "#b9a8ff", "#ff9ef0", "#f4fdff"];

/**
 * Les raretés (config/rarities.ts) : couleur, libellé, pétales allumés de la gemme, palier
 * d'animation de révélation.
 */
export const RARITY = {
  commune: { color: "#a3ada8", label: "Commune", petals: 1, tier: 1 },
  "peu-commune": { color: "#7fd858", label: "Peu commune", petals: 2, tier: 2 },
  rare: { color: "#4fa8ff", label: "Rare", petals: 3, tier: 3 },
  epique: { color: "#b07cff", label: "Épique", petals: 4, tier: 4 },
  legendaire: { color: "#ffc646", label: "Légendaire", petals: 5, tier: 5 },
  mythique: { color: "#ff6ad5", label: "Mythique", petals: 6, tier: 6 },
  secrete: { color: "#e7e1f7", label: "Secrète", petals: 6, tier: 7 },
  variante: { color: "#7df9ff", label: "Variante", petals: 6, tier: 8 },
};

export const RARITY_ORDER = Object.keys(RARITY);

export const rarityRank = (rarity) => RARITY_ORDER.indexOf(rarity);

export const rarityOf = (rarity) => RARITY[rarity] ?? RARITY.commune;

export function hexToRgb(hex) {
  const value = hex.replace("#", "");
  const full = value.length === 3 ? [...value].map((c) => c + c).join("") : value;
  const n = Number.parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** `rgba()` d'une couleur hexadécimale. */
export function alpha(hex, a) {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, a)).toFixed(3)})`;
}

/** Mélange de deux couleurs (comme `color-mix`, en RVB). */
export function mix(hexA, hexB, t) {
  const a = hexToRgb(hexA);
  const b = hexToRgb(hexB);
  const c = a.map((v, i) => Math.round(v + (b[i] - v) * t));
  return `#${c.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

/** Le thème du fond d'une scène : la carte la plus rare donne la lumière. */
export function sceneTheme(rarities) {
  const top = rarities.reduce(
    (best, r) => (rarityRank(r) > rarityRank(best) ? r : best),
    "commune",
  );
  if (top === "variante") return "glace";
  if (top === "secrete") return "eclipse";
  if (top === "mythique") return "aurore";
  if (top === "legendaire") return "or";
  if (top === "epique") return "amethyste";
  return "lune";
}
