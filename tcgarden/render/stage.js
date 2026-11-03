// La mise en scène commune : cartes en (fausse) 3D, éclosion, gerbes de lumière, titres,
// marque TCGarden. Les scènes (scenes/*.js) composent ces pièces sur leur propre minutage.
import { readFileSync } from "node:fs";

import { loadImage } from "@napi-rs/canvas";

import { TAU, clamp, ease, hashString, progress, seeded, wave } from "./motion.js";
import { canvas, glow, radial, roundRect, sparklePath } from "./paint.js";
import { setFont } from "./fonts.js";
import { COLORS, PRISM, ICE, alpha, rarityOf } from "./theme.js";

let logo = null;

export async function loadLogo() {
  logo ??= await loadImage(readFileSync(new URL("../assets/logo.png", import.meta.url)));
  return logo;
}

/**
 * Dessine une image de carte centrée en (cx, cy), tournée de `rotY` autour de son axe vertical
 * avec une vraie perspective (bandes verticales), puis de `rotZ` dans le plan. Au-delà de 90°,
 * c'est son dos qu'on voit.
 */
export function drawCard3D(ctx, face, back, { cx, cy, scale = 1, rotY = 0, rotZ = 0, alpha: a = 1, scaleX = 1 }) {
  if (a <= 0.003 || scale <= 0.001) return;
  let angle = ((rotY % TAU) + TAU) % TAU;
  if (angle > Math.PI) angle -= TAU;
  const showBack = Math.cos(angle) < 0;
  const img = showBack ? back : face;
  if (!img) return;
  if (showBack) angle = angle > 0 ? angle - Math.PI : angle + Math.PI;
  const w = img.width * scale;
  const h = img.height * scale;
  ctx.save();
  ctx.globalAlpha = a;
  ctx.translate(cx, cy);
  if (rotZ) ctx.rotate(rotZ);
  if (scaleX !== 1) ctx.scale(scaleX, 1);
  if (Math.abs(angle) < 0.004) {
    ctx.drawImage(img, -w / 2, -h / 2, w, h);
    ctx.restore();
    return;
  }
  const strips = Math.max(12, Math.round(w / 5));
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const depth = w * 3.4;
  const sw = img.width / strips;
  for (let i = 0; i < strips; i++) {
    const x0 = (i / strips - 0.5) * w;
    const x1 = ((i + 1) / strips - 0.5) * w;
    const p0 = depth / (depth + x0 * sin);
    const p1 = depth / (depth + x1 * sin);
    const X0 = x0 * cos * p0;
    const X1 = x1 * cos * p1;
    const hp = (h * (p0 + p1)) / 2;
    ctx.drawImage(img, i * sw, 0, sw, img.height, Math.min(X0, X1) - 0.35, -hp / 2, Math.abs(X1 - X0) + 0.7, hp);
  }
  // Le côté qui s'éloigne de la lumière s'assombrit un peu.
  const shade = (1 - Math.abs(cos)) * 0.4;
  if (shade > 0.01) {
    ctx.globalAlpha = a * shade;
    ctx.fillStyle = "#000";
    const half = (w / 2) * Math.abs(cos);
    roundRect(ctx, -half, -h / 2, half * 2, h, (w * 0.046));
    ctx.fill();
  }
  ctx.restore();
}

const shadows = new Map();

/** L'ombre douce d'une carte, posée sous elle (calque mis en cache). */
export function drawCardShadow(ctx, cx, cy, w, h, strength = 1) {
  if (strength <= 0) return;
  const key = `${Math.round(w)}x${Math.round(h)}`;
  if (!shadows.has(key)) {
    const pad = Math.round(w * 0.35);
    const c = canvas(w + pad * 2, h + pad * 2);
    const x = c.getContext("2d");
    x.shadowColor = "rgba(0,0,0,0.75)";
    x.shadowBlur = w * 0.14;
    x.shadowOffsetY = w * 0.06;
    x.fillStyle = "rgba(0,0,0,0.6)";
    roundRect(x, pad, pad, w, h, w * 0.05);
    x.fill();
    shadows.set(key, { c, pad });
  }
  const { c, pad } = shadows.get(key);
  ctx.save();
  ctx.globalAlpha = Math.min(1, strength);
  ctx.drawImage(c, cx - w / 2 - pad, cy - h / 2 - pad);
  ctx.restore();
}

/** Couleurs de la lumière d'une rareté (le prisme pour les Mythiques, la glace des Variantes). */
export function burstColors(rarity) {
  if (rarity === "mythique") return PRISM;
  if (rarity === "variante") return ICE;
  if (rarity === "secrete") return ["#e7e1f7", "#9d8cff", "#fff8ec"];
  const c = rarityOf(rarity).color;
  return [c, COLORS.firefly, c, "#ffffff"];
}

/**
 * L'éclosion d'une carte (animations.md : les cartes éclosent du sachet de graines), sur un
 * avancement p de 0 à 1 : une graine de lumière, une fente verticale, puis la carte qui s'ouvre
 * et une gerbe de pétales. Renvoie l'ouverture horizontale de la carte et l'éclat à poser
 * dessus ; la lumière, elle, est dessinée ici.
 */
export function bloom(ctx, { cx, cy, w, h, p, rarity, seed }) {
  const tier = rarityOf(rarity).tier;
  const color = rarityOf(rarity).color;
  const colors = burstColors(rarity);
  const seedIn = ease.outCubic(progress(p, 0, 0.22));
  const slit = ease.inOutCubic(progress(p, 0.12, 0.42));
  const open = progress(p, 0.34, 0.82);
  const burst = progress(p, 0.36, 1);
  const fade = 1 - progress(p, 0.5, 0.95);

  // Graine, puis fente lumineuse.
  if (p < 0.9) {
    const glowR = (10 + 26 * seedIn + h * 0.25 * slit) * (0.7 + 0.1 * tier);
    glow(ctx, cx, cy, glowR, color, (0.5 + 0.5 * seedIn) * fade);
    glow(ctx, cx, cy, glowR * 0.35, "#ffffff", 0.8 * seedIn * fade);
    if (slit > 0) {
      const sh = h * slit * 1.02;
      const sw = Math.max(2, w * 0.03) * (1 - 0.6 * open);
      const g = ctx.createLinearGradient(0, cy - sh / 2, 0, cy + sh / 2);
      g.addColorStop(0, alpha("#ffffff", 0));
      g.addColorStop(0.5, alpha("#ffffff", 0.95 * fade));
      g.addColorStop(1, alpha("#ffffff", 0));
      ctx.save();
      ctx.shadowColor = color;
      ctx.shadowBlur = 18;
      ctx.fillStyle = g;
      ctx.fillRect(cx - sw / 2, cy - sh / 2, sw, sh);
      ctx.restore();
    }
  }

  // Onde de choc et gerbe de pétales.
  if (burst > 0 && burst < 1) {
    const ring = ease.outCubic(burst);
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    ctx.strokeStyle = alpha(color, 0.55 * (1 - burst) ** 1.5);
    ctx.lineWidth = 2 + tier * 0.6;
    ctx.beginPath();
    ctx.ellipse(cx, cy, w * (0.3 + 0.9 * ring) * (0.8 + tier * 0.08), h * (0.25 + 0.6 * ring) * (0.8 + tier * 0.08), 0, 0, TAU);
    ctx.stroke();
    ctx.restore();
    const random = seeded(seed);
    const count = 8 + tier * 6;
    for (let i = 0; i < count; i++) {
      const a = random() * TAU;
      const speed = 0.4 + random() * 0.6;
      const life = 0.55 + random() * 0.45;
      const q = clamp(burst / life);
      if (q >= 1) continue;
      const dist = ease.outCubic(q) * speed * (w * 0.9 + tier * 14);
      const x = cx + Math.cos(a) * dist;
      const y = cy + Math.sin(a) * dist * 0.8 - q * q * 12;
      const fadeOut = (1 - q) ** 1.4;
      const c = colors[i % colors.length];
      const size = (1.5 + random() * 2.5) * (0.8 + tier * 0.12);
      if (i % 3 === 0) {
        glow(ctx, x, y, size * 5, c, 0.6 * fadeOut);
        ctx.fillStyle = alpha("#ffffff", 0.9 * fadeOut);
        sparklePath(ctx, x, y, size * 1.4);
        ctx.fill();
      } else {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(a + q * 3);
        ctx.fillStyle = alpha(c, 0.85 * fadeOut);
        ctx.beginPath();
        ctx.ellipse(0, 0, size * 1.6, size * 0.7, 0, 0, TAU);
        ctx.fill();
        ctx.restore();
      }
    }
  }
  const scaleX = open <= 0 ? 0 : ease.outBack(open, 1.2);
  const flash = open > 0 ? (1 - open) ** 2 : 0;
  return { scaleX, flash, visible: open > 0 };
}

/** Halo coloré derrière une carte, qui respire (l'aura des Mythiques, la lueur des autres). */
export function drawAura(ctx, cx, cy, w, h, rarity, t, period, strength = 1) {
  const tier = rarityOf(rarity).tier;
  if (tier < 3 || strength <= 0) return;
  const color = rarity === "mythique" ? "#ff6ad5" : rarity === "variante" ? "#7df9ff" : rarityOf(rarity).color;
  const pulse = 0.75 + 0.25 * wave(t, period, 0, 2);
  const k = { 3: 0.18, 4: 0.28, 5: 0.4, 6: 0.55, 7: 0.35, 8: 0.55 }[tier] ?? 0.2;
  glow(ctx, cx, cy, Math.max(w, h) * 0.95, color, k * pulse * strength);
}

/** Les lucioles qui entourent une Mythique (ou une Variante) : sept points qui scintillent. */
const MOTES = [[0.06, 0.18], [0.92, 0.3], [0.14, 0.72], [0.86, 0.8], [0.5, 0.03], [0.03, 0.46], [0.96, 0.58]];
export function drawMotes(ctx, cx, cy, w, h, rarity, t, period, strength = 1) {
  const tier = rarityOf(rarity).tier;
  if (tier < 6 || strength <= 0) return;
  const color = rarity === "variante" ? "#7df9ff" : rarity === "secrete" ? "#9d8cff" : "#ff6ad5";
  MOTES.forEach(([mx, my], i) => {
    const k = 0.5 + 0.5 * wave(t, period, i / 7, 2);
    const x = cx + (mx - 0.5) * w * 1.08;
    const y = cy + (my - 0.5) * h * 1.08 - 6 * k;
    glow(ctx, x, y, w * 0.06, color, 0.7 * k * strength);
    ctx.fillStyle = alpha("#ffffff", 0.9 * k * strength);
    ctx.beginPath();
    ctx.arc(x, y, w * 0.008 + 0.8, 0, TAU);
    ctx.fill();
  });
}

/** La lumière qui glisse sur une carte au repos : (px, py) et l'intensité du survol. */
export function restingLight(t, period, offset = 0) {
  return {
    px: 0.5 + 0.38 * wave(t, period, offset),
    py: 0.42 + 0.22 * wave(t, period, offset + 0.2, 2),
  };
}

/** Titre de scène : une introduction en italique (la voix du jardin), puis le nom. */
export function drawTitle(ctx, { x, y, intro, name, t, at = 0.15, align = "left", size = 34, color = COLORS.ink }) {
  const k = ease.outCubic(progress(t, at, at + 0.6));
  if (k <= 0) return;
  ctx.save();
  ctx.globalAlpha = k;
  ctx.textAlign = align;
  ctx.textBaseline = "alphabetic";
  const rise = (1 - k) * 10;
  setFont(ctx, { family: "display", italic: true, weight: 400, size: size * 0.62 });
  ctx.fillStyle = COLORS.lichen;
  ctx.fillText(intro, x, y + rise);
  setFont(ctx, { family: "display", weight: 650, size });
  ctx.fillStyle = color;
  ctx.shadowColor = "rgba(0,0,0,0.6)";
  ctx.shadowBlur = 8;
  ctx.fillText(name, x, y + size * 1.05 + rise);
  ctx.restore();
}

/** La marque du site, discrète, dans un coin. */
export function drawBrand(ctx, x, y, { t = 1, align = "right", size = 15 } = {}) {
  if (!logo) return;
  const k = ease.outCubic(progress(t, 0.1, 0.7));
  ctx.save();
  ctx.globalAlpha = 0.75 * k;
  setFont(ctx, { family: "display", weight: 600, size });
  const text = "TCGarden";
  const tw = ctx.measureText(text).width;
  const ls = size * 1.35;
  const total = ls + 6 + tw;
  const left = align === "right" ? x - total : x;
  ctx.drawImage(logo, left, y - ls * 0.8, ls, ls);
  ctx.fillStyle = COLORS.lune;
  ctx.textAlign = "left";
  ctx.fillText(text, left + ls + 6, y);
  ctx.restore();
}

/** Une petite étiquette lumineuse au-dessus d'une carte (« Nouvelle », « n° 1 »). */
export function drawChip(ctx, x, y, text, color, k = 1) {
  if (k <= 0) return;
  ctx.save();
  ctx.globalAlpha = k;
  setFont(ctx, { family: "ui", weight: 700, size: 13 });
  const tw = ctx.measureText(text).width;
  const w = tw + 18;
  const h = 22;
  roundRect(ctx, x - w / 2, y - h / 2, w, h, h / 2);
  ctx.fillStyle = "rgba(5,14,11,0.82)";
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = alpha(color, 0.7);
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, x, y + 0.5);
  ctx.restore();
}

/** Assombrit toute la scène (entrée et sortie de la boucle). */
export function veil(ctx, W, H, amount) {
  if (amount <= 0.002) return;
  ctx.fillStyle = `rgba(3,9,7,${Math.min(1, amount).toFixed(3)})`;
  ctx.fillRect(0, 0, W, H);
}

/** Graine reproductible d'une carte. */
export const cardSeed = (card, salt = 0) => hashString(`${card?.id ?? card?.label ?? "carte"}:${salt}`);

export { radial };
