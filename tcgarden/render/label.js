// L'étiquette d'herbier du site (SpecimenLabel) : double filet, intitulés en italique, points
// de conduite jusqu'à la valeur. Les métadonnées vont là, jamais en « A · B · C ».
import { ease, progress } from "./motion.js";
import { ellipsize, printable, setFont } from "./fonts.js";
import { roundRect } from "./paint.js";
import { COLORS, alpha } from "./theme.js";

const TONES = {
  jardin: { bg: "rgba(12,25,19,0.84)", line: "rgba(208,237,206,0.12)", strong: "rgba(208,237,206,0.22)", leader: "rgba(208,237,206,0.22)", head: COLORS.lichen, text: COLORS.lune },
  eclipse: { bg: "rgba(7,6,12,0.86)", line: "rgba(231,225,247,0.1)", strong: "rgba(231,225,247,0.2)", leader: "rgba(231,225,247,0.2)", head: "#9d97b4", text: "#eeebf8" },
  glace: { bg: "rgba(7,13,40,0.84)", line: "rgba(125,249,255,0.1)", strong: "rgba(125,249,255,0.2)", leader: "rgba(125,249,255,0.22)", head: "#97acd8", text: "#ecfcff" },
};

/**
 * Dessine l'étiquette ; `rows` : [intitulé, valeur, couleur de la valeur ?]. Les lignes
 * apparaissent l'une après l'autre à partir de `at` (secondes). Renvoie sa hauteur.
 */
export function drawSpecimen(ctx, { x, y, w, title, number, rows, tone = "jardin", t = 10, at = 0, rowHeight = 30, size = 16 }) {
  const c = TONES[tone] ?? TONES.jardin;
  const headH = size * 2.1;
  const h = 8 + 14 + headH + rows.length * rowHeight + 10;
  const k = ease.outCubic(progress(t, at, at + 0.5));
  if (k <= 0) return h;
  ctx.save();
  ctx.globalAlpha = k;
  ctx.translate(0, (1 - k) * 8);
  roundRect(ctx, x, y, w, h, 14);
  ctx.fillStyle = c.bg;
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = c.strong;
  ctx.stroke();
  roundRect(ctx, x + 4.5, y + 4.5, w - 9, h - 9, 10);
  ctx.strokeStyle = c.line;
  ctx.stroke();

  const ix = x + 18;
  const iw = w - 36;
  let cy = y + 8 + size * 1.55;
  ctx.textBaseline = "alphabetic";
  setFont(ctx, { family: "display", italic: true, weight: 400, size: size * 1.05 });
  ctx.fillStyle = c.head;
  ctx.textAlign = "left";
  ctx.fillText(printable(title), ix, cy);
  if (number) {
    setFont(ctx, { family: "display", weight: 500, size: size * 1.05 });
    ctx.fillStyle = c.text;
    ctx.textAlign = "right";
    ctx.fillText(number, ix + iw, cy);
  }
  cy += size * 0.75;
  ctx.fillStyle = c.line;
  ctx.fillRect(ix, cy, iw, 1);
  cy += 6;

  rows.forEach(([label, value, color], i) => {
    const kr = ease.outCubic(progress(t, at + 0.15 + i * 0.09, at + 0.55 + i * 0.09));
    if (kr <= 0) return;
    ctx.save();
    ctx.globalAlpha = k * kr;
    const base = cy + rowHeight * (i + 1) - rowHeight * 0.32;
    setFont(ctx, { family: "display", italic: true, weight: 400, size });
    ctx.fillStyle = c.head;
    ctx.textAlign = "left";
    ctx.fillText(label, ix, base);
    const lw = ctx.measureText(label).width;
    setFont(ctx, { family: "ui", weight: 650, size: size * 0.94 });
    const text = ellipsize(ctx, printable(value), iw - lw - 28);
    const vw = ctx.measureText(text).width;
    ctx.fillStyle = color ?? c.text;
    ctx.textAlign = "right";
    ctx.fillText(text, ix + iw, base);
    // Points de conduite.
    ctx.fillStyle = c.leader;
    for (let px = ix + lw + 8; px < ix + iw - vw - 8; px += 4) ctx.fillRect(px, base - size * 0.22, 1.2, 1.2);
    ctx.restore();
  });
  ctx.restore();
  return h;
}

/** Une jauge (progression du rang, complétion) qui se remplit. */
export function drawMeter(ctx, { x, y, w, h = 8, value, color, t = 10, at = 0, duration = 1 }) {
  const k = ease.outCubic(progress(t, at, at + duration));
  roundRect(ctx, x, y, w, h, h / 2);
  ctx.fillStyle = "rgba(208,237,206,0.1)";
  ctx.fill();
  const fill = Math.max(h, w * Math.min(1, value) * k);
  if (value <= 0) return;
  ctx.save();
  ctx.shadowColor = alpha(color, 0.8);
  ctx.shadowBlur = 10;
  roundRect(ctx, x, y, fill, h, h / 2);
  const g = ctx.createLinearGradient(x, 0, x + fill, 0);
  g.addColorStop(0, alpha(color, 0.65));
  g.addColorStop(1, color);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.restore();
}
