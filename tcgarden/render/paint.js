// Outils de dessin communs : formes, dégradés à la manière du CSS, halos, textures.
import { createCanvas, loadImage } from "@napi-rs/canvas";

import { TAU, seeded } from "./motion.js";
import { alpha } from "./theme.js";

export function canvas(width, height) {
  const c = createCanvas(Math.max(1, Math.round(width)), Math.max(1, Math.round(height)));
  return c;
}

export function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, Math.max(0, Math.min(r, w / 2, h / 2)));
}

/**
 * `linear-gradient(<angle>deg, …)` du CSS sur la boîte (x, y, w, h) : 0deg monte, 90deg va à
 * droite, la ligne passe par le centre et touche les coins.
 */
export function linearCss(ctx, angleDeg, x, y, w, h, stops) {
  const a = (angleDeg * Math.PI) / 180;
  const dx = Math.sin(a);
  const dy = -Math.cos(a);
  const half = (Math.abs(w * dx) + Math.abs(h * dy)) / 2;
  const cx = x + w / 2;
  const cy = y + h / 2;
  const g = ctx.createLinearGradient(cx - dx * half, cy - dy * half, cx + dx * half, cy + dy * half);
  addStops(g, stops);
  return g;
}

/** `conic-gradient(from <angle>deg at x y, …)` : le CSS part de midi, le canvas de 3 h. */
export function conicCss(ctx, fromDeg, cx, cy, stops) {
  const g = ctx.createConicGradient(((fromDeg - 90) * Math.PI) / 180, cx, cy);
  addStops(g, stops);
  return g;
}

/** Arrêts de couleur : une liste de couleurs régulières, ou de couples [position, couleur]. */
export function addStops(gradient, stops) {
  stops.forEach((stop, i) => {
    if (Array.isArray(stop)) gradient.addColorStop(Math.max(0, Math.min(1, stop[0])), stop[1]);
    else gradient.addColorStop(stops.length === 1 ? 0 : i / (stops.length - 1), stop);
  });
}

export function radial(ctx, x, y, r, stops, r0 = 0) {
  const g = ctx.createRadialGradient(x, y, r0, x, y, Math.max(0.01, r));
  addStops(g, stops);
  return g;
}

/** Un halo lumineux doux, centré en (x, y). */
export function glow(ctx, x, y, r, color, strength = 1) {
  if (strength <= 0 || r <= 0) return;
  ctx.fillStyle = radial(ctx, x, y, r, [
    [0, alpha(color, 0.9 * strength)],
    [0.18, alpha(color, 0.45 * strength)],
    [0.5, alpha(color, 0.12 * strength)],
    [1, alpha(color, 0)],
  ]);
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
}

/** Une étoile à quatre branches (les étincelles du site). */
export function sparklePath(ctx, x, y, size) {
  ctx.beginPath();
  ctx.moveTo(x, y - size);
  ctx.quadraticCurveTo(x, y, x + size, y);
  ctx.quadraticCurveTo(x, y, x, y + size);
  ctx.quadraticCurveTo(x, y, x - size, y);
  ctx.quadraticCurveTo(x, y, x, y - size);
  ctx.closePath();
}

/** Grain fin et fixe (le « mat » des cadres Communes, la mousse du fond). */
export function noiseTile(size, opacity, seed = 7) {
  const tile = canvas(size, size);
  const ctx = tile.getContext("2d");
  const image = ctx.createImageData(size, size);
  const random = seeded(seed);
  for (let i = 0; i < image.data.length; i += 4) {
    const v = random();
    image.data[i] = 255;
    image.data[i + 1] = 255;
    image.data[i + 2] = 255;
    image.data[i + 3] = Math.round(v * v * 255 * opacity);
  }
  ctx.putImageData(image, 0, 0);
  return tile;
}

/** Remplit (x, y, w, h) d'un motif répété, décalé de (ox, oy). */
export function fillPattern(ctx, tile, x, y, w, h, ox = 0, oy = 0, scale = 1) {
  const pattern = ctx.createPattern(tile, "repeat");
  ctx.save();
  ctx.translate(x + ox, y + oy);
  ctx.scale(scale, scale);
  ctx.fillStyle = pattern;
  ctx.fillRect(-ox / scale, -oy / scale, w / scale, h / scale);
  ctx.restore();
}

/** Ombre intérieure d'une forme arrondie (box-shadow inset, flou seulement). */
export function innerShadow(ctx, x, y, w, h, r, blur, color) {
  ctx.save();
  roundRect(ctx, x, y, w, h, r);
  ctx.clip();
  ctx.beginPath();
  ctx.rect(x - blur * 4 - 1000, y - blur * 4 - 1000, w + blur * 8 + 2000, h + blur * 8 + 2000);
  ctx.roundRect(x, y, w, h, r);
  ctx.shadowBlur = blur;
  ctx.shadowColor = color;
  ctx.fillStyle = "#000";
  ctx.fill("evenodd");
  ctx.restore();
}

/** Liseré intérieur d'une forme arrondie (box-shadow inset avec étalement). */
export function innerRing(ctx, x, y, w, h, r, width, color) {
  ctx.save();
  roundRect(ctx, x, y, w, h, r);
  ctx.clip();
  ctx.lineWidth = width * 2;
  ctx.strokeStyle = color;
  roundRect(ctx, x, y, w, h, r);
  ctx.stroke();
  ctx.restore();
}

/** Image en `object-fit: cover` dans (x, y, w, h). */
export function drawCover(ctx, image, x, y, w, h, focusY = 0.5) {
  const scale = Math.max(w / image.width, h / image.height);
  const sw = w / scale;
  const sh = h / scale;
  const sx = (image.width - sw) / 2;
  const sy = (image.height - sh) * focusY;
  ctx.drawImage(image, sx, sy, sw, sh, x, y, w, h);
}

const tiles = new Map();

/** Charge une fois les motifs SVG du site (tuiles répétées) : le dessin reste ensuite synchrone. */
export async function preloadTiles(entries) {
  for (const [name, svg] of entries)
    if (!tiles.has(name)) tiles.set(name, await loadImage(Buffer.from(svg)));
}

export function tile(name) {
  const image = tiles.get(name);
  if (!image) throw new Error(`motif non chargé : ${name}`);
  return image;
}

/** Petites étincelles réparties dans un disque, qui scintillent (motes, poussière). */
export function twinkles(ctx, points, t, period, color, size = 1) {
  for (const p of points) {
    const k = 0.5 + 0.5 * Math.sin(TAU * (t / period) * p.speed + p.phase);
    const a = k * k * p.alpha;
    if (a < 0.02) continue;
    glow(ctx, p.x, p.y, p.r * 3.2 * size, color, a * 0.8);
    ctx.fillStyle = alpha("#ffffff", Math.min(1, a * 1.2));
    sparklePath(ctx, p.x, p.y, p.r * 1.6 * size * (0.6 + 0.4 * k));
    ctx.fill();
  }
}
