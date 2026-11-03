// La carte TCGarden, dessinée comme sur le site (CardView, card-view.module.css) : cadre de sa
// rareté, fenêtre d'image 4:5, gemme, cartouche, holo qui suit la lumière. Toutes les mesures
// sont en « u », 1 % de la largeur de la carte (le cqi du site).
import { Path2D } from "@napi-rs/canvas";

import { TAU } from "./motion.js";
import { ellipsize, printable, setFont, wrapLines } from "./fonts.js";
import {
  canvas,
  conicCss,
  drawCover,
  fillPattern,
  innerRing,
  innerShadow,
  linearCss,
  noiseTile,
  radial,
  roundRect,
  sparklePath,
  preloadTiles,
  tile,
} from "./paint.js";
import { CONSTELLATION, IVY, ORNAMENT, SPARKLES } from "./patterns.js";
import { alpha, mix, rarityOf } from "./theme.js";

/** Réglages de chaque rareté (les variables CSS du site). */
const LOOK = {
  commune: { edge: "rgba(255,255,255,0.14)", ring: "rgba(163,173,168,0.35)", frameFoil: 0, artFoil: 0, rest: 0, glare: 0.35, ink: "#f2f9f5" },
  "peu-commune": { edge: "rgba(206,248,186,0.28)", ring: "rgba(127,216,88,0.45)", frameFoil: 0.35, artFoil: 0, rest: 0, glare: 0.55, ink: "#f2f9f5" },
  rare: { edge: "rgba(207,231,255,0.4)", ring: "rgba(79,168,255,0.55)", frameFoil: 0.7, artFoil: 0, rest: 0, glare: 0.55, ink: "#f2f9f5" },
  epique: { edge: "rgba(239,227,255,0.45)", ring: "rgba(176,124,255,0.6)", frameFoil: 0.85, artFoil: 0.52, rest: 0.28, glare: 0.55, ink: "#f2f9f5" },
  legendaire: { edge: "rgba(255,244,209,0.7)", ring: "rgba(255,198,70,0.75)", frameFoil: 0.6, artFoil: 0.36, rest: 0.2, glare: 0.7, ink: "#fff8e6" },
  mythique: { edge: "rgba(255,255,255,0.8)", ring: "rgba(255,214,243,0.9)", frameFoil: 0.8, artFoil: 0.46, rest: 0.68, glare: 0.75, ink: "#fff4fb" },
  variante: { edge: "rgba(244,253,255,0.85)", ring: "rgba(0,0,0,0)", frameFoil: 0.7, artFoil: 0.44, rest: 0.16, glare: 0.7, ink: "#f4fdff" },
};

const MYTHIC_FRAME = ["#ff5fd2", "#a77bff", "#45d9ff", "#6effc8", "#ffe066", "#ff8a5c", "#ff5fd2"];
const ICE_FRAME = ["#7df9ff", "#b9a8ff", "#ff9ef0", "#f4fdff", "#7df9ff"];
const GEM_PRISM = {
  mythique: ["#ffe76b", "#ff6ad5", "#b07cff", "#6bf3ff"],
  variante: ["#f4fdff", "#7df9ff", "#b9a8ff", "#ff9ef0"],
};

const PETAL = new Path2D("M0 -7 C 14 -19, 12 -38, 0 -46 C -12 -38, -14 -19, 0 -7 Z");

/** Les pseudos longs rétrécissent dans le cartouche (card-data.ts). */
function nameScale(name) {
  const length = [...name].length;
  if (length <= 10) return 1;
  if (length <= 14) return 0.88;
  if (length <= 18) return 0.76;
  if (length <= 24) return 0.66;
  return 0.56;
}

function layoutFor(width, rarity) {
  const w = Math.round(width);
  const u = w / 100;
  const h = Math.round(w * 1.4);
  const compact = w < 230;
  const art =
    rarity === "variante"
      ? { x: 2.4 * u, y: 2.4 * u, w: w - 4.8 * u, h: h - 4.8 * u, r: 3.6 * u }
      : { x: 7 * u, y: 7 * u, w: 86 * u, h: 107.5 * u, r: 3 * u };
  const gemR = ((compact ? 22 : 15) * u) / 2;
  return {
    w,
    h,
    u,
    r: 4.6 * u,
    compact,
    art,
    gem: { cx: w - 3 * u - gemR, cy: 3 * u + gemR, r: gemR },
  };
}

// ── Cadres ──────────────────────────────────────────────────────────────────

function paintFrame(ctx, rarity, L, spin = 0) {
  const { w, h } = L;
  const k = w / 260; // les motifs du site sont en px, pour une carte de 260 px
  switch (rarity) {
    case "commune":
      ctx.fillStyle = linearCss(ctx, 155, 0, 0, w, h, [[0, "#5c6662"], [0.46, "#313835"], [1, "#4a524e"]]);
      ctx.fillRect(0, 0, w, h);
      fillPattern(ctx, noiseTile(96, 0.2, 11), 0, 0, w, h);
      break;
    case "peu-commune":
      ctx.fillStyle = linearCss(ctx, 155, 0, 0, w, h, [[0, "#3f7f2d"], [0.5, "#183716"], [1, "#2f6524"]]);
      ctx.fillRect(0, 0, w, h);
      fillPattern(ctx, tile("ivy"), 0, 0, w, h, 0, 0, k);
      break;
    case "rare":
      ctx.fillStyle = linearCss(ctx, 150, 0, 0, w, h, [[0, "#3478c8"], [0.44, "#0f2a4d"], [0.74, "#1d5190"], [1, "#66b2ff"]]);
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = "rgba(255,255,255,0.05)";
      for (let x = 0; x < w; x += 3 * k) ctx.fillRect(x, 0, Math.max(0.6, k), h);
      break;
    case "epique":
      ctx.fillStyle = linearCss(ctx, 150, 0, 0, w, h, [[0, "#8550d4"], [0.44, "#2c1556"], [0.74, "#5a2fa3"], [1, "#c39bff"]]);
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = "rgba(255,255,255,0.06)";
      ctx.lineWidth = Math.max(0.6, k);
      for (let d = -h; d < w + h; d += 8 * k * Math.SQRT2) {
        ctx.beginPath();
        ctx.moveTo(d, 0);
        ctx.lineTo(d + h, h);
        ctx.moveTo(d + h, 0);
        ctx.lineTo(d, h);
        ctx.stroke();
      }
      break;
    case "legendaire":
      ctx.fillStyle = linearCss(ctx, 135, 0, 0, w, h, [
        [0, "#8a5a12"], [0.18, "#f6d27a"], [0.35, "#b9862b"], [0.5, "#ffeaa8"],
        [0.65, "#a8741f"], [0.82, "#f3c95f"], [1, "#7a4e10"],
      ]);
      ctx.fillRect(0, 0, w, h);
      fillPattern(ctx, tile("ornament"), 0, 0, w, h, 0, 0, k);
      break;
    case "mythique":
      ctx.fillStyle = conicCss(ctx, spin, w / 2, h / 2, MYTHIC_FRAME);
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = linearCss(ctx, 160, 0, 0, w, h, [[0.35, "rgba(36,0,54,0)"], [1, "rgba(36,0,54,0.42)"]]);
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = radial(ctx, w * 0.28, h * 0.16, Math.hypot(w, h) * 0.42, [[0, "rgba(255,255,255,0.5)"], [1, "rgba(255,255,255,0)"]]);
      ctx.fillRect(0, 0, w, h);
      fillPattern(ctx, tile("sparkles"), 0, 0, w, h, 0, 0, k);
      break;
    case "variante":
      ctx.fillStyle = conicCss(ctx, spin, w / 2, h / 2, ICE_FRAME);
      ctx.fillRect(0, 0, w, h);
      break;
    default:
      ctx.fillStyle = "#313835";
      ctx.fillRect(0, 0, w, h);
  }
}

/** Les ombres intérieures du cadre (box-shadow inset du site), sur un calque à part. */
function paintFrameShade(ctx, rarity, L) {
  const { w, h, u, r } = L;
  innerShadow(ctx, 0, 0, w, h, r, 6 * u, "rgba(0,0,0,0.35)");
  innerRing(ctx, 0, 0, w, h, r, 1.3 * u, "rgba(0,0,0,0.28)");
  innerRing(ctx, 0, 0, w, h, r, 0.55 * u, LOOK[rarity].edge);
}

// ── Gemme ───────────────────────────────────────────────────────────────────

export function drawGem(ctx, rarity, cx, cy, r, { glowScale = 1 } = {}) {
  const color = rarityOf(rarity).color;
  const u = r / 7.5;
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.55)";
  ctx.shadowBlur = 2.4 * u;
  ctx.shadowOffsetY = 0.8 * u;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, TAU);
  ctx.fillStyle =
    rarity === "secrete"
      ? radial(ctx, cx - 0.3 * r, cy - 0.4 * r, r * 1.9, [[0, "#1d1828"], [0.7, "#020203"]])
      : radial(ctx, cx - 0.3 * r, cy - 0.4 * r, r * 1.9, [[0, "rgba(255,255,255,0.2)"], [0.7, "rgba(5,11,9,0.92)"]]);
  ctx.fill();
  ctx.restore();
  ctx.beginPath();
  ctx.arc(cx, cy, r + 0.225 * u, 0, TAU);
  ctx.lineWidth = 0.45 * u;
  ctx.strokeStyle = alpha(color, 0.75);
  ctx.stroke();
  drawFlower(ctx, rarity, cx, cy, r * 0.76 * 2, glowScale);
}

/** La fleur de la gemme : 6 pétales, dont 1 à 6 allumés (rarity-gem.tsx). */
export function drawFlower(ctx, rarity, cx, cy, size, glowScale = 1) {
  const info = rarityOf(rarity);
  const s = size / 100;
  const prism = GEM_PRISM[rarity];
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(s, s);
  ctx.shadowColor = info.color;
  ctx.shadowBlur = 6 * (size / 40) * glowScale;
  let fill = info.color;
  if (prism) {
    const g = ctx.createLinearGradient(0, -46, 0, 46);
    prism.forEach((c, i) => g.addColorStop(i / (prism.length - 1), c));
    fill = g;
  }
  if (rarity === "secrete") {
    ctx.beginPath();
    ctx.arc(0, 0, 47, 0, TAU);
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = alpha(info.color, 0.55);
    ctx.stroke();
    for (let i = 0; i < 6; i++) {
      ctx.save();
      ctx.rotate((i * TAU) / 6);
      ctx.fillStyle = "#07060b";
      ctx.fill(PETAL);
      ctx.lineWidth = 2.6;
      ctx.strokeStyle = info.color;
      ctx.stroke(PETAL);
      ctx.restore();
    }
    ctx.beginPath();
    ctx.arc(0, 0, 10, 0, TAU);
    ctx.fillStyle = "#07060b";
    ctx.fill();
    ctx.lineWidth = 2.6;
    ctx.strokeStyle = info.color;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, 3.5, 0, TAU);
    ctx.fillStyle = info.color;
    ctx.fill();
    ctx.restore();
    return;
  }
  for (let i = 0; i < 6; i++) {
    ctx.save();
    ctx.rotate((i * TAU) / 6);
    const lit = i < info.petals;
    ctx.globalAlpha = lit ? 1 : 0.16;
    ctx.fillStyle = lit ? fill : info.color;
    ctx.fill(PETAL);
    ctx.restore();
  }
  if (rarity === "variante") {
    ctx.fillStyle = info.color;
    for (let i = 0; i < 6; i++) {
      ctx.save();
      ctx.rotate(((i * 60 + 30) * Math.PI) / 180);
      sparklePath(ctx, 0, -40, 7);
      ctx.fill();
      ctx.restore();
    }
  }
  ctx.beginPath();
  ctx.arc(0, 0, 10, 0, TAU);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.beginPath();
  ctx.arc(0, 0, 4.5, 0, TAU);
  ctx.fillStyle = "rgba(5,14,11,0.5)";
  ctx.fill();
  ctx.restore();
}

// ── Cartouche ───────────────────────────────────────────────────────────────

/** Deux lignes équilibrées (text-wrap: balance) quand le nom ne tient pas sur une. */
function balancedLines(ctx, text, maxWidth) {
  const name = printable(text);
  if (ctx.measureText(name).width <= maxWidth) return [name];
  const words = name.split(" ");
  if (words.length < 2) return [ellipsize(ctx, name, maxWidth)];
  let best = null;
  for (let i = 1; i < words.length; i++) {
    const a = words.slice(0, i).join(" ");
    const b = words.slice(i).join(" ");
    const widest = Math.max(ctx.measureText(a).width, ctx.measureText(b).width);
    if (!best || widest < best.widest) best = { lines: [a, b], widest };
  }
  return best.widest <= maxWidth ? best.lines : wrapLines(ctx, name, maxWidth, 2);
}

function paintPlate(ctx, card, L) {
  const { w, h, u, compact } = L;
  const look = LOOK[card.rarity];
  const color = rarityOf(card.rarity).color;
  const scale = nameScale(printable(card.name));
  const nameSize = (compact ? 11 : 8.8) * u * scale;
  const padX = (compact ? 3 : 4) * u;
  const x = 4.5 * u;
  const pw = w - 9 * u;
  setFont(ctx, { family: "display", weight: 650, size: nameSize });
  const lines = balancedLines(ctx, card.name, pw - padX * 2);
  const lineH = nameSize * 1.08;
  const title = !compact && card.title ? card.title.toUpperCase() : null;
  const titleSize = Math.max(3.4 * u, 7.5);
  const padTop = (compact ? 2.5 : 2.6) * u;
  const padBottom = (compact ? 2.5 : 2.8) * u;
  const ph = padTop + lines.length * lineH + (title ? 0.8 * u + titleSize * 1.25 : 0) + padBottom;
  const y = compact ? h - 6 * u - ph : 99 * u;

  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.5)";
  ctx.shadowBlur = 3 * u;
  ctx.shadowOffsetY = 1.2 * u;
  roundRect(ctx, x, y, pw, ph, 3 * u);
  ctx.fillStyle =
    card.rarity === "variante"
      ? linearCss(ctx, 180, x, y, pw, ph, ["rgba(12,18,54,0.6)", "rgba(5,8,28,0.85)"])
      : linearCss(ctx, 180, x, y, pw, ph, ["rgba(12,26,21,0.88)", "rgba(4,10,8,0.95)"]);
  ctx.fill();
  ctx.restore();
  innerRing(ctx, x, y, pw, ph, 3 * u, 0.35 * u, alpha(color, 0.6));
  ctx.save();
  roundRect(ctx, x, y, pw, ph, 3 * u);
  ctx.clip();
  ctx.fillStyle = linearCss(ctx, 180, x, y, pw, 2 * u, ["rgba(255,255,255,0.08)", "rgba(255,255,255,0)"]);
  ctx.fillRect(x, y, pw, 2 * u);
  ctx.restore();

  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  setFont(ctx, { family: "display", weight: 650, size: nameSize });
  ctx.save();
  ctx.shadowColor = card.rarity === "variante" ? "rgba(125,249,255,0.45)" : "rgba(0,0,0,0.6)";
  ctx.shadowBlur = (card.rarity === "variante" ? 2.4 : 1.6) * u;
  ctx.shadowOffsetY = card.rarity === "variante" ? 0 : 0.4 * u;
  ctx.fillStyle = look.ink;
  lines.forEach((line, i) =>
    ctx.fillText(line, w / 2, y + padTop + nameSize * 0.86 + i * lineH),
  );
  ctx.restore();
  if (title) {
    setFont(ctx, { family: "ui", weight: 700, size: titleSize, tracking: titleSize * 0.1 });
    ctx.fillStyle = mix(color, "#ffffff", 0.28);
    ctx.fillText(
      ellipsize(ctx, printable(title), pw - padX * 2),
      w / 2,
      y + padTop + lines.length * lineH + 0.8 * u + titleSize * 0.95,
    );
    ctx.letterSpacing = "0px";
  }
  return { x, y, w: pw, h: ph };
}

function paintFooter(ctx, card, L) {
  if (L.compact) return;
  const { w, h, u } = L;
  const size = Math.max(3 * u, 7);
  setFont(ctx, { family: "ui", weight: 700, size, tracking: size * 0.08 });
  ctx.fillStyle = card.rarity === "variante" ? "rgba(232,252,255,0.85)" : "rgba(236,246,241,0.62)";
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
  ctx.fillText(card.seriesCode.toUpperCase(), 8 * u, h - 3.4 * u - size * 0.2);
  ctx.textAlign = "right";
  ctx.fillText(card.label, w - 8 * u, h - 3.4 * u - size * 0.2);
  ctx.letterSpacing = "0px";
  ctx.textAlign = "left";
}

/** La signature d'une Variante, peinte du prisme de glace (cartes.md §2.2). */
function paintSignature(ctx, signature, mask, L) {
  const { u } = L;
  const area = 880;
  const widthU = Math.min(56, Math.sqrt((area * signature.width) / signature.height));
  const sw = widthU * u;
  const sh = (sw * signature.height) / signature.width;
  const ink = canvas(sw, sh);
  const ic = ink.getContext("2d");
  ic.fillStyle = conicCss(ic, 200, sw * 0.5, sh * 0.5, ICE_FRAME);
  ic.fillRect(0, 0, sw, sh);
  ic.globalCompositeOperation = "destination-in";
  ic.drawImage(mask, 0, 0, sw, sh);
  ctx.save();
  ctx.shadowColor = "rgba(125,249,255,0.42)";
  ctx.shadowBlur = 1.3 * u;
  ctx.drawImage(ink, 5.6 * u, 5.2 * u);
  ctx.shadowColor = "rgba(5,8,28,0.9)";
  ctx.shadowBlur = 0.35 * u;
  ctx.shadowOffsetY = 0.2 * u;
  ctx.drawImage(ink, 5.6 * u, 5.2 * u);
  ctx.restore();
}

// ── Holo (calques animés) ───────────────────────────────────────────────────

function foilBand(ctx, L, light, stops, angle, size) {
  const { w, h } = L;
  const bw = w * size;
  const bh = h * size;
  const ox = -(bw - w) * light.px;
  const oy = -(bh - h) * light.py;
  return linearCss(ctx, angle, ox, oy, bw, bh, stops);
}

const FRAME_FOIL = [
  [0.22, "hsla(185,100%,76%,0)"],
  [0.36, "hsla(185,100%,76%,0.7)"],
  [0.46, "hsla(265,100%,78%,0.7)"],
  [0.56, "hsla(325,100%,76%,0.65)"],
  [0.64, "hsla(45,100%,72%,0.55)"],
  [0.76, "hsla(45,100%,72%,0)"],
];

function paintArtFoil(ctx, rarity, A, light, t, spin) {
  const lx = light.px * A.w;
  const ly = light.py * A.h;
  const k = A.w / 223.6; // la fenêtre d'image d'une carte de 260 px
  if (rarity === "epique") {
    const sp = tile("sparkles");
    fillPattern(ctx, sp, 0, 0, A.w, A.h, -light.px * 40 * k, -light.py * 40 * k, k);
    fillPattern(ctx, sp, 0, 0, A.w, A.h, light.px * 25 * k, light.py * 25 * k, (90 / 140) * k);
    ctx.fillStyle = linearCss(ctx, 120, -(1.5 * A.w) * light.px, -(1.5 * A.h) * light.py, A.w * 2.5, A.h * 2.5, [
      [0.3, "hsla(280,100%,82%,0)"], [0.5, "hsla(280,100%,82%,0.4)"], [0.7, "hsla(280,100%,82%,0)"],
    ]);
    ctx.fillRect(0, 0, A.w, A.h);
    maskRadial(ctx, A, lx, ly, [[0, 1], [0.4, 0.45], [0.78, 0]]);
  } else if (rarity === "legendaire") {
    const band = 0.144;
    const g = linearCss(ctx, 110, -(0.8 * A.w) * light.px, -(0.8 * A.h) * light.py, A.w * 1.8, A.h * 1.8, []);
    const hues = [0, 45, 110, 185, 250, 315, 360];
    for (let start = 0; start < 1; start += band)
      hues.forEach((hue, i) =>
        g.addColorStop(Math.min(1, start + (i / (hues.length - 1)) * band), `hsla(${hue},100%,72%,0.55)`),
      );
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, A.w, A.h);
    ctx.fillStyle = radial(ctx, lx, ly, Math.hypot(A.w, A.h) * 0.4, [[0, "rgba(255,248,220,0.55)"], [1, "rgba(255,248,220,0)"]]);
    ctx.fillRect(0, 0, A.w, A.h);
  } else if (rarity === "mythique" || rarity === "variante") {
    const ice = rarity === "variante";
    ctx.fillStyle = conicCss(ctx, spin, lx, ly, ice
      ? ["hsla(185,100%,72%,0.55)", "hsla(255,100%,82%,0.5)", "hsla(315,100%,82%,0.45)", "hsla(195,100%,92%,0.5)", "hsla(185,100%,72%,0.55)"]
      : ["hsla(320,100%,72%,0.55)", "hsla(45,100%,70%,0.55)", "hsla(160,100%,65%,0.5)", "hsla(200,100%,70%,0.55)", "hsla(275,100%,75%,0.55)", "hsla(320,100%,72%,0.55)"]);
    ctx.fillRect(0, 0, A.w, A.h);
    if (!ice) {
      ctx.strokeStyle = "rgba(255,255,255,0.22)";
      ctx.lineWidth = Math.max(0.8, 2 * k);
      const step = 9 * k;
      const a = (125 * Math.PI) / 180;
      ctx.save();
      ctx.translate(A.w / 2, A.h / 2);
      ctx.rotate(a - Math.PI / 2);
      const reach = Math.hypot(A.w, A.h);
      for (let d = -reach; d < reach; d += step) {
        ctx.beginPath();
        ctx.moveTo(d, -reach);
        ctx.lineTo(d, reach);
        ctx.stroke();
      }
      ctx.restore();
    }
    const sp = tile("sparkles");
    fillPattern(ctx, sp, 0, 0, A.w, A.h, -light.px * 30 * k, -light.py * 30 * k, (ice ? 110 / 140 : 120 / 140) * k);
    if (ice) {
      const stars = tile("constellation");
      ctx.drawImage(stars, 0, 0, A.w, A.h);
    }
  }
}

/** Masque radial autour d'un point (mask-image: radial-gradient). */
function maskRadial(ctx, A, x, y, stops) {
  ctx.save();
  ctx.globalCompositeOperation = "destination-in";
  ctx.fillStyle = radial(ctx, x, y, Math.hypot(A.w, A.h), stops.map(([p, a]) => [p, `rgba(0,0,0,${a})`]));
  ctx.fillRect(0, 0, A.w, A.h);
  ctx.restore();
}

// ── Carte complète ──────────────────────────────────────────────────────────

/**
 * Une carte prête à animer. `art` : son image (déjà décodée), `signature` : le masque d'une
 * Variante signée. `render(t, light)` compose l'image du moment sur un canevas à sa taille.
 */
export async function createCardSprite(card, { width, art, signature }) {
  await preloadTiles([
    ["sparkles", SPARKLES],
    ["ivy", IVY],
    ["ornament", ORNAMENT],
    ["constellation", CONSTELLATION],
  ]);
  if (card.veiled) return createBackSprite({ width, kind: "secret" });
  const rarity = card.rarity in LOOK ? card.rarity : "commune";
  const L = layoutFor(width, rarity);
  const look = LOOK[rarity];
  const dynamicFrame = rarity === "mythique" || rarity === "variante";

  const frame = canvas(L.w, L.h);
  if (!dynamicFrame) paintFrame(frame.getContext("2d"), rarity, L);
  const shade = canvas(L.w, L.h);
  paintFrameShade(shade.getContext("2d"), rarity, L);

  // La fenêtre d'image, ses anneaux, l'ombre du bas.
  const artLayer = canvas(L.w, L.h);
  const ac = artLayer.getContext("2d");
  const A = L.art;
  if (rarity === "variante") {
    roundRect(ac, A.x - 0.35 * L.u, A.y - 0.35 * L.u, A.w + 0.7 * L.u, A.h + 0.7 * L.u, A.r + 0.35 * L.u);
    ac.fillStyle = "rgba(7,11,36,0.75)";
    ac.fill();
  } else {
    roundRect(ac, A.x - L.u, A.y - L.u, A.w + 2 * L.u, A.h + 2 * L.u, A.r + L.u);
    ac.fillStyle = look.ring;
    ac.fill();
    roundRect(ac, A.x - 0.5 * L.u, A.y - 0.5 * L.u, A.w + L.u, A.h + L.u, A.r + 0.5 * L.u);
    ac.fillStyle = "rgba(0,0,0,0.6)";
    ac.fill();
  }
  ac.save();
  roundRect(ac, A.x, A.y, A.w, A.h, A.r);
  ac.clip();
  ac.fillStyle = "#050b09";
  ac.fillRect(A.x, A.y, A.w, A.h);
  if (art) drawCover(ac, art, A.x, A.y, A.w, A.h, rarity === "variante" ? 0.35 : 0.5);
  ac.fillStyle =
    rarity === "variante"
      ? linearCss(ac, 180, A.x, A.y, A.w, A.h, [[0, "rgba(7,11,36,0.45)"], [0.2, "rgba(7,11,36,0)"], [0.52, "rgba(5,8,28,0)"], [0.84, "rgba(5,8,28,0.92)"], [1, "rgba(5,8,28,0.92)"]])
      : linearCss(ac, 180, A.x, A.y, A.w, A.h, [[0.58, "rgba(3,8,6,0)"], [1, "rgba(3,8,6,0.7)"]]);
  ac.fillRect(A.x, A.y, A.w, A.h);
  ac.restore();
  if (rarity === "variante") innerRing(ac, A.x, A.y, A.w, A.h, A.r, 0.2 * L.u, "rgba(244,253,255,0.25)");

  // Par-dessus : signature, gemme, cartouche, pied.
  const over = canvas(L.w, L.h);
  const oc = over.getContext("2d");
  if (signature && card.signature) paintSignature(oc, card.signature, signature, L);
  drawGem(oc, rarity, L.gem.cx, L.gem.cy, L.gem.r);
  const plate = paintPlate(oc, card, L);
  paintFooter(oc, card, L);

  const out = canvas(L.w, L.h);
  const foil = canvas(A.w, A.h);

  return {
    kind: "face",
    card,
    rarity,
    width: L.w,
    height: L.h,
    radius: L.r,
    plate,
    /** Compose la carte au temps t. light : { px, py } de 0 à 1, on : intensité du survol. */
    render(t, { light = { px: 0.5, py: 0.5 }, on = 0.6, spin = 0, sweep = null } = {}) {
      const ctx = out.getContext("2d");
      ctx.clearRect(0, 0, L.w, L.h);
      ctx.save();
      roundRect(ctx, 0, 0, L.w, L.h, L.r);
      ctx.clip();
      if (dynamicFrame) paintFrame(ctx, rarity, L, spin);
      else ctx.drawImage(frame, 0, 0);
      if (look.frameFoil > 0) {
        ctx.globalCompositeOperation = "color-dodge";
        ctx.globalAlpha = look.frameFoil * (0.3 + 0.7 * on);
        ctx.fillStyle = foilBand(ctx, L, light, FRAME_FOIL, 115, 2.6);
        ctx.fillRect(0, 0, L.w, L.h);
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = "source-over";
      }
      ctx.drawImage(shade, 0, 0);
      ctx.drawImage(artLayer, 0, 0);
      if (look.artFoil > 0) {
        const fc = foil.getContext("2d");
        fc.clearRect(0, 0, A.w, A.h);
        paintArtFoil(fc, rarity, A, light, t, spin);
        ctx.save();
        roundRect(ctx, A.x, A.y, A.w, A.h, A.r);
        ctx.clip();
        ctx.globalCompositeOperation = "color-dodge";
        ctx.globalAlpha = look.artFoil * (look.rest + (1 - look.rest) * on);
        ctx.drawImage(foil, A.x, A.y);
        ctx.restore();
      }
      // Légendaire : un trait de lumière qui balaie l'image.
      if (rarity === "legendaire" && sweep !== null && sweep > 0 && sweep < 1) {
        ctx.save();
        roundRect(ctx, A.x, A.y, A.w, A.h, A.r);
        ctx.clip();
        ctx.globalCompositeOperation = "overlay";
        const span = A.w * 1.4;
        const x = A.x - span + (A.w + span * 2) * sweep;
        ctx.fillStyle = linearCss(ctx, 105, x - span / 2, A.y - A.h * 0.2, span, A.h * 1.4, [
          [0.4, "rgba(255,250,230,0)"], [0.5, "rgba(255,250,230,0.75)"], [0.6, "rgba(255,250,230,0)"],
        ]);
        ctx.fillRect(A.x, A.y, A.w, A.h);
        ctx.restore();
      }
      ctx.drawImage(over, 0, 0);
      // Reflet : un point de lumière, en incrustation.
      const g = look.glare * on;
      if (g > 0.01) {
        ctx.globalCompositeOperation = "overlay";
        ctx.globalAlpha = Math.min(1, g);
        const lx = light.px * L.w;
        const ly = light.py * L.h;
        const reach = Math.hypot(Math.max(lx, L.w - lx), Math.max(ly, L.h - ly));
        ctx.fillStyle = radial(ctx, lx, ly, reach, [[0, "rgba(255,255,255,0.6)"], [0.26, "rgba(255,255,255,0.16)"], [0.58, "rgba(255,255,255,0)"]]);
        ctx.fillRect(0, 0, L.w, L.h);
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = "source-over";
      }
      ctx.restore();
      return out;
    },
  };
}

// ── Dos ─────────────────────────────────────────────────────────────────────

const MARK = {
  stem: new Path2D("M100 205V65M100 154C43 154 39 107 53 88C84 89 104 109 100 154ZM100 122C158 122 165 72 149 57C115 67 95 83 100 122ZM100 184C151 177 163 145 155 130C125 132 109 153 100 184Z"),
  veins: new Path2D("M100 154L57 95M100 122L145 64M100 184L150 138M100 50C76 38 82 16 100 9C118 16 124 38 100 50Z"),
  rays: new Path2D("M100 1V-6M84 10L77 3M116 10L123 3M18 100L23 95L28 100L23 105ZM170 165L175 160L180 165L175 170Z"),
  ground: new Path2D("M66 210Q100 198 134 210M55 216Q100 204 145 216"),
};

/** Le motif du dos : une pousse dans un médaillon (BotanicalMark du site). */
function paintMark(ctx, x, y, w, h, color) {
  const s = Math.min(w / 200, h / 230);
  ctx.save();
  ctx.translate(x + (w - 200 * s) / 2, y + (h - 230 * s) / 2);
  ctx.scale(s, s);
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 0.7;
  ctx.globalAlpha = 0.5;
  ctx.beginPath();
  ctx.ellipse(100, 110, 73, 88, 0, 0, TAU);
  ctx.stroke();
  ctx.globalAlpha = 0.4;
  ctx.lineWidth = 0.5;
  ctx.setLineDash([2, 5]);
  ctx.beginPath();
  ctx.ellipse(100, 110, 83, 98, 0, 0, TAU);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;
  ctx.lineWidth = 1.8;
  ctx.stroke(MARK.stem);
  ctx.lineWidth = 1;
  ctx.stroke(MARK.veins);
  ctx.stroke(MARK.rays);
  for (const [cx, cy, r] of [[40, 47, 2], [161, 39, 1.5], [28, 170, 1.5]]) {
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, TAU);
    ctx.fill();
  }
  ctx.globalAlpha = 0.5;
  ctx.stroke(MARK.ground);
  ctx.restore();
}

/**
 * Dos de carte (card-back.tsx) : `common` pour les ouvertures, `secret` pour une Secrète, qui
 * ne se montre jamais sur Discord (la pousse dans l'ombre d'une éclipse).
 */
export function createBackSprite({ width, kind = "common", edge }) {
  const w = Math.round(width);
  const h = Math.round(w * 1.4);
  const u = w / 100;
  const r = 6 * u;
  const secret = kind === "secret";
  const color = secret ? "#e7e1f7" : "#9bc5a1";
  const edgeColor = edge ?? (secret ? "#e7e1f7" : "#a5c690");

  const base = canvas(w, h);
  const ctx = base.getContext("2d");
  roundRect(ctx, 0, 0, w, h, r);
  ctx.save();
  ctx.clip();
  ctx.fillStyle = secret
    ? radial(ctx, w / 2, h * 0.4, h * 0.75, [[0, "#1b1626"], [0.6, "#07060b"], [1, "#020203"]])
    : radial(ctx, w / 2, h * 0.35, h * 0.75, [[0, "#234b34"], [0.65, "#0a2016"], [1, "#05120c"]]);
  ctx.fillRect(0, 0, w, h);
  if (secret) {
    // L'éclipse : un disque plus noir que le ciel, cerclé de lune.
    const ex = w / 2;
    const ey = h * 0.46;
    const er = 31 * u;
    ctx.save();
    ctx.shadowColor = "rgba(107,91,214,0.25)";
    ctx.shadowBlur = 16 * u;
    ctx.beginPath();
    ctx.arc(ex, ey, er + 4 * u, 0, TAU);
    ctx.fillStyle = "rgba(107,91,214,0.12)";
    ctx.fill();
    ctx.shadowColor = "rgba(231,225,247,0.35)";
    ctx.shadowBlur = 6 * u;
    ctx.beginPath();
    ctx.arc(ex, ey, er + u, 0, TAU);
    ctx.fillStyle = "rgba(231,225,247,0.2)";
    ctx.fill();
    ctx.restore();
    ctx.beginPath();
    ctx.arc(ex, ey, er + 0.25 * u, 0, TAU);
    ctx.lineWidth = 0.5 * u;
    ctx.strokeStyle = "rgba(231,225,247,0.55)";
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(ex, ey, er, 0, TAU);
    ctx.fillStyle = "#030205";
    ctx.fill();
  }
  ctx.restore();
  // Bordure et liseré intérieur.
  roundRect(ctx, 0.5, 0.5, w - 1, h - 1, r);
  ctx.lineWidth = 1;
  ctx.strokeStyle = edgeColor;
  ctx.stroke();
  roundRect(ctx, 2.6 * u, 2.6 * u, w - 5.2 * u, h - 5.2 * u, 3.5 * u);
  ctx.lineWidth = 0.5 * u;
  ctx.strokeStyle = secret ? "rgba(231,225,247,0.28)" : mix(edgeColor, "#10251a", 0.45);
  ctx.stroke();
  ctx.globalAlpha = secret ? 0.85 : 1;
  paintMark(ctx, w * 0.16, h * 0.19, w * 0.68, h * 0.63, color);
  ctx.globalAlpha = 1;
  ctx.textAlign = "center";
  ctx.fillStyle = color;
  setFont(ctx, { family: "display", weight: 500, size: 6.5 * u, tracking: 6.5 * u * 0.2 });
  ctx.save();
  if (secret) {
    ctx.shadowColor = "rgba(231,225,247,0.45)";
    ctx.shadowBlur = 3 * u;
  }
  ctx.fillText("TCGARDEN", w / 2 + 0.65 * u, h * 0.09 + 6.5 * u * 0.8);
  ctx.restore();
  if (w >= 150) {
    if (secret) {
      setFont(ctx, { family: "display", italic: true, weight: 400, size: 3.6 * u });
      ctx.globalAlpha = 0.8;
      ctx.fillText("Certaines graines poussent dans l'ombre", w / 2, h * 0.91);
    } else {
      setFont(ctx, { family: "ui", weight: 600, size: 2.6 * u, tracking: 2.6 * u * 0.14 });
      ctx.fillText("CHAQUE RENCONTRE EST UNE GRAINE", w / 2, h * 0.91);
    }
  }
  ctx.globalAlpha = 1;
  ctx.letterSpacing = "0px";
  ctx.textAlign = "left";

  const out = canvas(w, h);
  return {
    kind: secret ? "secret" : "back",
    card: null,
    rarity: secret ? "secrete" : null,
    width: w,
    height: h,
    radius: r,
    render(t, { spin = 0, on = 0.6 } = {}) {
      const c = out.getContext("2d");
      c.clearRect(0, 0, w, h);
      c.drawImage(base, 0, 0);
      if (secret) {
        // La couronne de l'éclipse et son « diamant », qui fait lentement le tour du disque.
        const ex = w / 2;
        const ey = h * 0.46;
        const er = 31 * u;
        const a = ((spin - 90) * Math.PI) / 180;
        c.save();
        c.globalCompositeOperation = "lighter";
        const ring = c.createConicGradient(a, ex, ey);
        ring.addColorStop(0, "rgba(231,225,247,0.05)");
        ring.addColorStop(0.5, "rgba(231,225,247,0.18)");
        ring.addColorStop(0.86, "rgba(231,225,247,0.55)");
        ring.addColorStop(0.97, "rgba(255,248,236,0.95)");
        ring.addColorStop(1, "rgba(231,225,247,0.05)");
        c.strokeStyle = ring;
        c.lineWidth = 1.1 * u;
        c.beginPath();
        c.arc(ex, ey, er + 0.4 * u, 0, TAU);
        c.stroke();
        const dx = ex + Math.cos(a - 0.19) * (er + 0.4 * u);
        const dy = ey + Math.sin(a - 0.19) * (er + 0.4 * u);
        c.fillStyle = radial(c, dx, dy, 7 * u, [[0, `rgba(255,248,236,${0.85 * on + 0.15})`], [0.25, "rgba(231,225,247,0.35)"], [1, "rgba(231,225,247,0)"]]);
        c.fillRect(dx - 7 * u, dy - 7 * u, 14 * u, 14 * u);
        c.restore();
      }
      return out;
    },
  };
}
