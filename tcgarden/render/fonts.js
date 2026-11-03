// Polices du site (licence OFL, voir assets/fonts) : Fraunces pour les titres et les noms de
// cartes, son italique pour la voix du jardin, Manrope pour le reste.
import { fileURLToPath } from "node:url";

import { GlobalFonts } from "@napi-rs/canvas";

const FILES = [
  ["Fraunces.ttf", "Fraunces"],
  ["Fraunces-Italic.ttf", "Fraunces Italic"],
  ["Manrope.ttf", "Manrope"],
];

let registered = false;

export function registerFonts() {
  if (registered) return;
  for (const [file, family] of FILES)
    GlobalFonts.registerFromPath(
      fileURLToPath(new URL(`../assets/fonts/${file}`, import.meta.url)),
      family,
    );
  registered = true;
}

/**
 * Règle la police du contexte. `display` : Fraunces (axe optique réglé sur la taille, comme le
 * navigateur) ; `ui` : Manrope.
 */
export function setFont(
  ctx,
  { family = "ui", weight = 400, size, italic = false, tracking = 0 },
) {
  if (family === "display") {
    const face = italic ? "Fraunces Italic" : "Fraunces";
    ctx.font = `${italic ? "italic " : ""}${weight} ${size}px "${face}"`;
    const opsz = Math.max(9, Math.min(144, size));
    ctx.fontVariationSettings = `'wght' ${weight}, 'opsz' ${opsz.toFixed(1)}`;
  } else {
    ctx.font = `${weight} ${size}px Manrope`;
    ctx.fontVariationSettings = `'wght' ${weight}`;
  }
  ctx.letterSpacing = `${tracking}px`;
}

/**
 * Un nom tel qu'on peut l'écrire avec nos polices : les lettres « stylées » d'Unicode
 * (𝓐𝓶𝓲𝓻) redeviennent des lettres, les emojis disparaissent.
 */
export function printable(text) {
  const clean = String(text ?? "")
    .normalize("NFKC")
    .replace(/[\p{Extended_Pictographic}‍︎️⃣]/gu, "")
    .replace(/[\p{Cc}\p{Cf}]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
  return clean || "?";
}

/** Coupe un texte en lignes de `maxWidth` au plus ; la dernière finit par « … » si besoin. */
export function wrapLines(ctx, text, maxWidth, maxLines = 2) {
  const words = printable(text).split(" ");
  const lines = [];
  let line = "";
  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    const candidate = line ? `${line} ${word}` : word;
    if (ctx.measureText(candidate).width <= maxWidth || !line) {
      line = candidate;
      continue;
    }
    lines.push(line);
    line = word;
    if (lines.length === maxLines - 1) {
      line = words.slice(i).join(" ");
      break;
    }
  }
  if (line) lines.push(line);
  // Un mot plus long que la ligne, ou un reste qui déborde : on le raccourcit.
  return lines.slice(0, maxLines).map((l) => ellipsize(ctx, l, maxWidth));
}

export function ellipsize(ctx, text, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let chars = [...text];
  while (chars.length > 1 && ctx.measureText(`${chars.join("")}…`).width > maxWidth)
    chars = chars.slice(0, -1);
  return `${chars.join("").trimEnd()}…`;
}

/**
 * Plus grande taille (entre `min` et `max`) pour que `text` tienne sur `maxWidth`, sur une
 * ligne ; renvoie la taille retenue.
 */
export function fitSize(ctx, text, maxWidth, font, { min, max }) {
  for (let size = max; size > min; size -= 1) {
    setFont(ctx, { ...font, size });
    if (ctx.measureText(text).width <= maxWidth) return size;
  }
  setFont(ctx, { ...font, size: min });
  return min;
}
