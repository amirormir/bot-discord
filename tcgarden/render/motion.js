// Temps et mouvement des animations : interpolations, courbes, hasard reproductible.

export const TAU = Math.PI * 2;

export const clamp = (value, min = 0, max = 1) =>
  Math.min(max, Math.max(min, value));

export const lerp = (a, b, t) => a + (b - a) * t;

/** Avancement de 0 à 1 de `t` entre `start` et `end`. */
export const progress = (t, start, end) =>
  end <= start ? (t >= end ? 1 : 0) : clamp((t - start) / (end - start));

/** Montée puis descente : 0 → 1 → 0 sur [start, end]. */
export const bump = (t, start, end) => Math.sin(Math.PI * progress(t, start, end));

export const ease = {
  linear: (t) => t,
  inCubic: (t) => t * t * t,
  outCubic: (t) => 1 - (1 - t) ** 3,
  outQuart: (t) => 1 - (1 - t) ** 4,
  inOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2),
  inOutSine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
  outExpo: (t) => (t >= 1 ? 1 : 1 - 2 ** (-10 * t)),
  /** Léger dépassement, puis retour : un objet qui se pose. */
  outBack: (t, s = 1.4) => 1 + (s + 1) * (t - 1) ** 3 + s * (t - 1) ** 2,
};

/** Une onde qui boucle exactement sur `period` secondes (la durée du GIF, ou une fraction). */
export const wave = (t, period, phase = 0, cycles = 1) =>
  Math.sin(TAU * ((t / period) * cycles + phase));

/** Empreinte stable d'une chaîne (FNV-1a), pour un hasard propre à chaque carte. */
export function hashString(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Générateur reproductible (mulberry32) : le même GIF à chaque rendu. */
export function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
