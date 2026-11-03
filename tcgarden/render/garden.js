// Le jardin la nuit, derrière les cartes : ciel, silhouettes du site (public/garden), lucioles,
// et la lumière de la carte la plus rare (aurore des Mythiques, éclipse, ciel de glace, or).
import { readFileSync } from "node:fs";

import { Path2D } from "@napi-rs/canvas";

import { TAU, seeded, wave } from "./motion.js";
import { addStops, canvas, conicCss, drawCover, glow, noiseTile, fillPattern, radial, sparklePath } from "./paint.js";
import { COLORS, PRISM, alpha, mix } from "./theme.js";

const silhouettes = new Map();

/** Les tracés d'un décor du site (viewBox 800 × 240), pour les peindre de n'importe quelle couleur. */
function silhouette(name) {
  if (!silhouettes.has(name)) {
    const svg = readFileSync(new URL(`../assets/garden/${name}.svg`, import.meta.url), "utf8");
    silhouettes.set(name, [...svg.matchAll(/ d="([^"]+)"/g)].map((m) => new Path2D(m[1])));
  }
  return silhouettes.get(name);
}

/** Peint un décor posé en bas (ou en haut) de la scène, sur `height` pixels. */
export function paintSilhouette(ctx, name, W, H, { height, color, top = false, opacity = 1, offset = 0 }) {
  const paths = silhouette(name);
  const sx = Math.max(W, 760) / 800;
  const sy = height / 240;
  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.translate((W - 800 * sx) / 2 + offset, top ? 0 : H - height);
  ctx.scale(sx, sy);
  ctx.fillStyle = color;
  for (const p of paths) ctx.fill(p);
  ctx.restore();
}

// ── Fonds fixes ─────────────────────────────────────────────────────────────

const THEMES = {
  lune: { sky: ["#0c2620", "#08180f", "#030907"], light: "#3ee6a8", halo: 0.12 },
  amethyste: { sky: ["#140f28", "#0b1414", "#030907"], light: "#b07cff", halo: 0.16 },
  or: { sky: ["#2a1d08", "#0f1409", "#030907"], light: "#ffc646", halo: 0.18 },
  aurore: { sky: ["#160f2a", "#0d1424", "#050c0b"], light: "#ff6ad5", halo: 0.16 },
  eclipse: { sky: ["#0c0a16", "#060509", "#020203"], light: "#e7e1f7", halo: 0.08 },
  glace: { sky: ["#0b1640", "#070d2a", "#03050f"], light: "#7df9ff", halo: 0.14 },
};

export const themeLight = (theme) => (THEMES[theme] ?? THEMES.lune).light;

/**
 * Le fond d'une scène, rendu une fois : ciel, halo, voile, herbes. `hero` : l'image de la carte
 * la plus rare, dont l'aurore reprend les couleurs (Mythique).
 */
export function paintBackdrop(W, H, theme, { hero, focus = { x: 0.5, y: 0.45 } } = {}) {
  const t = THEMES[theme] ?? THEMES.lune;
  const bg = canvas(W, H);
  const ctx = bg.getContext("2d");
  const sky = ctx.createLinearGradient(0, 0, 0, H);
  addStops(sky, [[0, t.sky[0]], [0.55, t.sky[1]], [1, t.sky[2]]]);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);

  if (theme === "aurore" && hero) {
    // L'image de la Mythique, immense et voilée : on la reconnaît, et le ciel prend ses
    // couleurs. Le prisme la teinte vers les bords.
    ctx.save();
    ctx.globalAlpha = 0.62;
    ctx.filter = "blur(12px) saturate(1.35)";
    drawCover(ctx, hero, -W * 0.05, -H * 0.05, W * 1.1, H * 1.1, 0.35);
    ctx.restore();
    ctx.fillStyle = "rgba(10,6,22,0.5)";
    ctx.fillRect(0, 0, W, H);
    ctx.save();
    ctx.globalCompositeOperation = "soft-light";
    const prism = ctx.createLinearGradient(0, 0, W, H);
    addStops(prism, [[0, "#ff5fd2"], [0.35, "#a77bff"], [0.65, "#45d9ff"], [1, "#ffe066"]]);
    ctx.fillStyle = prism;
    ctx.globalAlpha = 0.55;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  // La lumière de la scène, derrière le sujet.
  const fx = W * focus.x;
  const fy = H * focus.y;
  ctx.fillStyle = radial(ctx, fx, fy, H * 0.85, [[0, alpha(t.light, t.halo * 1.6)], [0.45, alpha(t.light, t.halo * 0.5)], [1, alpha(t.light, 0)]]);
  ctx.fillRect(0, 0, W, H);
  if (theme === "aurore") {
    ctx.fillStyle = radial(ctx, W * 0.5, -H * 0.1, W * 0.7, [[0, "rgba(176,124,255,0.22)"], [1, "rgba(176,124,255,0)"]]);
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = radial(ctx, W * 0.08, 0, W * 0.45, [[0, "rgba(255,106,213,0.18)"], [1, "rgba(255,106,213,0)"]]);
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = radial(ctx, W * 0.92, 0, W * 0.45, [[0, "rgba(69,217,255,0.16)"], [1, "rgba(69,217,255,0)"]]);
    ctx.fillRect(0, 0, W, H);
  }
  if (theme === "eclipse" || theme === "glace") paintStars(ctx, W, H, theme === "glace" ? 120 : 80, theme === "glace" ? "#dcfdff" : "#eeebf8");
  if (theme === "glace") paintPlanisphere(ctx, W, H, fx, fy);

  // Le jardin : herbes lointaines, puis proches, teintées par la lumière.
  if (theme !== "eclipse") {
    paintSilhouette(ctx, "herbes-loin", W, H, { height: H * 0.2, color: mix(t.sky[1], t.light, 0.08), opacity: 0.9 });
    paintSilhouette(ctx, "herbes", W, H, { height: H * 0.17, color: "#020605" });
  } else {
    paintSilhouette(ctx, "herbes", W, H, { height: H * 0.12, color: "#010102" });
  }
  // Vignette et grain : le noir des bords, la mousse.
  ctx.fillStyle = radial(ctx, W / 2, H * 0.48, Math.hypot(W, H) * 0.62, [[0.5, "rgba(0,0,0,0)"], [1, "rgba(0,0,0,0.55)"]]);
  ctx.fillRect(0, 0, W, H);
  fillPattern(ctx, noiseTile(128, 0.035, 3), 0, 0, W, H);
  return bg;
}

function paintStars(ctx, W, H, count, color) {
  const random = seeded(count * 31);
  for (let i = 0; i < count; i++) {
    const x = random() * W;
    const y = random() * H * 0.8;
    const r = 0.4 + random() ** 3 * 1.3;
    ctx.fillStyle = alpha(color, 0.25 + random() * 0.55);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fill();
  }
}

/** Le planisphère des Variantes : cercles et méridiens de glace, très pâles. */
function paintPlanisphere(ctx, W, H, cx, cy) {
  ctx.save();
  ctx.strokeStyle = "rgba(125,249,255,0.07)";
  ctx.lineWidth = 1;
  for (let r = 70; r < W; r += 70) {
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, TAU);
    ctx.stroke();
  }
  for (let a = 0; a < 12; a++) {
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos((a * TAU) / 12) * W, cy + Math.sin((a * TAU) / 12) * W);
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * Le fond d'un profil (ambiance.module.css) : une scène du jardin choisie par le joueur, dont
 * la lumière prend sa teinte.
 */
export function paintAmbiance(W, H, code, accent) {
  const scenes = {
    clairiere: { sky: ["#10302a", "#0a1d17", "#050e0b"], moon: [0.82, 0.18, "rgba(220,255,240,0.24)"], far: "#0b1f18", near: "#030907" },
    rosee: { sky: ["#1d3c44", "#142d31", "#06110e"], moon: [0.76, 0.22, "rgba(230,250,255,0.18)"], far: "#0e2422", near: "#040f0d" },
    lucioles: { sky: ["#0b2422", "#071816", "#030a09"], moon: [0.7, 0.14, "rgba(242,246,192,0.2)"], far: "#0a1c1a", near: "#030907" },
    serre: { sky: ["#132e26", "#0b1f19", "#06110d"], moon: [0.5, -0.1, "rgba(210,255,235,0.18)"], far: "#0b1f18", near: "#020806" },
    "sous-bois": { sky: ["#0a2223", "#071618", "#030909"], moon: [0.3, -0.06, "rgba(190,240,255,0.14)"], far: "#0a1c1d", near: "#020707" },
    prisme: { sky: ["#160f2a", "#0d1424", "#050c0b"], moon: [0.82, 0.18, "rgba(255,230,250,0.14)"], far: "#0d1222", near: "#030508" },
  };
  const s = scenes[code] ?? scenes.clairiere;
  const bg = canvas(W, H);
  const ctx = bg.getContext("2d");
  const sky = ctx.createLinearGradient(0, 0, 0, H);
  addStops(sky, [[0, s.sky[0]], [0.52, s.sky[1]], [1, s.sky[2]]]);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);
  if (code === "prisme") {
    ctx.save();
    ctx.filter = "blur(28px)";
    ctx.translate(0, -H * 0.05);
    ctx.transform(1, -0.08, 0, 1, 0, 0);
    const g = ctx.createLinearGradient(0, 0, W, H * 0.2);
    addStops(g, [[0.1, "rgba(255,106,213,0)"], [0.25, "rgba(255,106,213,0.28)"], [0.4, "rgba(176,124,255,0.28)"], [0.55, "rgba(79,168,255,0.24)"], [0.7, "rgba(62,230,168,0.22)"], [0.88, "rgba(62,230,168,0)"]]);
    ctx.fillStyle = g;
    ctx.fillRect(-W * 0.1, 0, W * 1.2, H * 0.55);
    ctx.restore();
  }
  if (code === "rosee") {
    ctx.fillStyle = radial(ctx, W * 0.3, H, W * 0.6, [[0, "rgba(255,205,160,0.16)"], [1, "rgba(255,205,160,0)"]]);
    ctx.fillRect(0, 0, W, H);
  }
  const [mx, my, moon] = s.moon;
  ctx.fillStyle = radial(ctx, W * mx, H * my, Math.hypot(W, H) * 0.42, [[0, moon], [0.09 / 0.42, alpha(accent, 0.22)], [1, alpha(accent, 0)]]);
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = radial(ctx, W / 2, H * 1.2, W * 0.7, [[0, alpha(accent, 0.14)], [1, alpha(accent, 0)]]);
  ctx.fillRect(0, 0, W, H);
  if (code === "serre") {
    ctx.strokeStyle = "rgba(208,237,206,0.07)";
    for (let i = 1; i < 4; i++) {
      ctx.beginPath();
      ctx.moveTo((W * i) / 4, 0);
      ctx.lineTo((W * i) / 4, H);
      ctx.stroke();
    }
    for (let i = 1; i < 3; i++) {
      ctx.beginPath();
      ctx.moveTo(0, (H * i) / 3);
      ctx.lineTo(W, (H * i) / 3);
      ctx.stroke();
    }
  }
  if (code === "sous-bois") {
    ctx.save();
    ctx.globalAlpha = 0.9;
    for (let i = 0; i < 5; i++) {
      const x = W * (0.05 + i * 0.21);
      const g = ctx.createLinearGradient(0, 0, 0, H * 0.8);
      addStops(g, [[0, "rgba(190,240,255,0.05)"], [1, "rgba(190,240,255,0)"]]);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x + W * 0.03, 0);
      ctx.lineTo(x + W * 0.03 - H * 0.27, H * 0.8);
      ctx.lineTo(x - H * 0.27, H * 0.8);
      ctx.fill();
    }
    ctx.restore();
  }
  if (code !== "serre") paintSilhouette(ctx, "herbes-loin", W, H, { height: H * 0.3, color: s.far, opacity: 0.9 });
  if (code === "lucioles") {
    const top = H * 0.66;
    const g = ctx.createLinearGradient(0, top, 0, H);
    addStops(g, [[0, "rgba(13,40,36,0)"], [0.35, "rgba(13,40,36,0.9)"], [1, "rgba(2,8,7,0.95)"]]);
    ctx.fillStyle = g;
    ctx.fillRect(0, top, W, H - top);
    ctx.fillStyle = "rgba(242,246,192,0.05)";
    for (let y = top + 10; y < H; y += 7) ctx.fillRect(0, y, W, 1);
  }
  if (code === "serre") paintSilhouette(ctx, "serre", W, H, { height: H, color: s.near, top: true, opacity: 0.85 });
  else if (code === "sous-bois") paintSilhouette(ctx, "fougeres", W, H, { height: H * 0.42, color: s.near });
  else paintSilhouette(ctx, "herbes", W, H, { height: H * (code === "lucioles" ? 0.2 : 0.26), color: s.near });
  if (code === "rosee") {
    const random = seeded(17);
    for (let i = 0; i < 90; i++) {
      const x = random() * W;
      const y = H * (0.55 + random() * 0.45);
      ctx.fillStyle = `rgba(230,255,248,${(0.2 + random() * 0.35).toFixed(2)})`;
      ctx.beginPath();
      ctx.arc(x, y, 0.6 + random() * 0.8, 0, TAU);
      ctx.fill();
    }
  }
  const veil = ctx.createLinearGradient(0, 0, 0, H);
  addStops(veil, [[0.3, "rgba(3,9,7,0)"], [0.75, "rgba(3,9,7,0.35)"], [1, "rgba(3,9,7,0.6)"]]);
  ctx.fillStyle = veil;
  ctx.fillRect(0, 0, W, H);
  fillPattern(ctx, noiseTile(128, 0.03, 5), 0, 0, W, H);
  return bg;
}

// ── Ce qui bouge ────────────────────────────────────────────────────────────

/**
 * Des lucioles qui flottent et clignotent, sur des trajets qui bouclent exactement sur
 * `period` secondes (le GIF reprend sans à-coup).
 */
export function createFireflies({ W, H, count, seed = 1, color = COLORS.firefly, area, period }) {
  const random = seeded(seed);
  const zone = area ?? { x: 0, y: H * 0.1, w: W, h: H * 0.75 };
  const flies = Array.from({ length: count }, () => ({
    x: zone.x + random() * zone.w,
    y: zone.y + random() * zone.h,
    ax: 8 + random() * 22,
    ay: 6 + random() * 18,
    kx: 1 + Math.floor(random() * 2),
    ky: 1 + Math.floor(random() * 2),
    px: random(),
    py: random(),
    blink: 1 + Math.floor(random() * 3),
    phase: random(),
    size: 1.4 + random() * 1.6,
  }));
  return {
    draw(ctx, t, { intensity = 1, tint } = {}) {
      if (intensity <= 0) return;
      for (const f of flies) {
        const x = f.x + f.ax * wave(t, period, f.px, f.kx);
        const y = f.y + f.ay * wave(t, period, f.py, f.ky);
        const b = 0.5 + 0.5 * wave(t, period, f.phase, f.blink);
        const a = (0.25 + 0.75 * b * b) * intensity;
        glow(ctx, x, y, f.size * 7, tint ?? color, a * 0.55);
        ctx.fillStyle = alpha("#fbfde6", Math.min(1, a));
        ctx.beginPath();
        ctx.arc(x, y, f.size * (0.7 + 0.3 * b), 0, TAU);
        ctx.fill();
      }
    },
  };
}

/** Deux rubans d'aurore aux couleurs du prisme (fiche des Mythiques), qui ondulent. */
export function createAurora({ W, H, period }) {
  const ribbon = (stops, height) => {
    const c = canvas(W * 1.3, height);
    const ctx = c.getContext("2d");
    const g = ctx.createLinearGradient(0, 0, c.width, 0);
    addStops(g, stops);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, c.width, height);
    // Rayons verticaux irréguliers, et un bord bas qui s'éteint.
    ctx.globalCompositeOperation = "destination-in";
    const random = seeded(height);
    for (let x = 0; x < c.width; x += 1 + Math.floor(random() * 3)) {
      const v = 0.35 + random() * 0.65;
      const fade = ctx.createLinearGradient(0, 0, 0, height);
      addStops(fade, [[0, "rgba(0,0,0,0)"], [0.4, `rgba(0,0,0,${(0.3 * v).toFixed(2)})`], [0.85, `rgba(0,0,0,${v.toFixed(2)})`], [1, "rgba(0,0,0,0)"]]);
      ctx.fillStyle = fade;
      ctx.fillRect(x, 0, 3, height);
    }
    return c;
  };
  const a = ribbon([[0.03, "rgba(255,95,210,0)"], [0.17, "#ff5fd2"], [0.35, "#b07cff"], [0.54, "#45d9ff"], [0.71, "#6effc8"], [0.85, "#ffe066"], [0.97, "rgba(255,224,102,0)"]], H * 0.3);
  const b = ribbon([[0.08, "rgba(69,217,255,0)"], [0.26, "#45d9ff"], [0.5, "#ff5fd2"], [0.7, "#b07cff"], [0.92, "rgba(176,124,255,0)"]], H * 0.22);
  return {
    draw(ctx, t, { intensity = 1 } = {}) {
      if (intensity <= 0) return;
      ctx.save();
      ctx.globalCompositeOperation = "screen";
      ctx.globalAlpha = 0.45 * intensity;
      ctx.drawImage(a, -W * 0.15 + 16 * wave(t, period, 0), -H * 0.02 + 6 * wave(t, period, 0.25), a.width, a.height * (1 + 0.06 * wave(t, period, 0.1)));
      ctx.globalAlpha = 0.3 * intensity;
      ctx.drawImage(b, -W * 0.15 - 14 * wave(t, period, 0.4), -H * 0.05, b.width, b.height * (1 + 0.08 * wave(t, period, 0.6)));
      ctx.restore();
    },
  };
}

/** La corolle : six pétales de lumière prismatique derrière la carte, qui tournent lentement. */
export function drawCorolla(ctx, cx, cy, size, angle, intensity = 1, colors = PRISM) {
  if (intensity <= 0) return;
  ctx.save();
  ctx.globalCompositeOperation = "screen";
  ctx.globalAlpha = 0.5 * intensity;
  ctx.translate(cx, cy);
  ctx.rotate(angle);
  for (let i = 0; i < 6; i++) {
    ctx.save();
    ctx.rotate((i * TAU) / 6);
    const g = ctx.createLinearGradient(0, -size * 0.15, 0, -size * 0.5);
    g.addColorStop(0, alpha(colors[i % colors.length], 0));
    g.addColorStop(0.45, alpha(colors[i % colors.length], 0.75));
    g.addColorStop(1, alpha(colors[(i + 1) % colors.length], 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(0, -size * 0.1);
    ctx.bezierCurveTo(size * 0.2, -size * 0.2, size * 0.16, -size * 0.42, 0, -size * 0.52);
    ctx.bezierCurveTo(-size * 0.16, -size * 0.42, -size * 0.2, -size * 0.2, 0, -size * 0.1);
    ctx.fill();
    ctx.restore();
  }
  ctx.restore();
}

/**
 * Des rais de lumière autour d'un point (Légendaire, Mythique), déjà fondus vers l'extérieur
 * dans un calque : moins cher qu'un masque à chaque image.
 */
export function createRays({ radius, colors, count = 12 }) {
  const size = Math.ceil(radius * 2);
  const c = canvas(size, size);
  const ctx = c.getContext("2d");
  // Des rais fins, de largeurs inégales, chacun de sa couleur (le prisme, ou l'or).
  const random = seeded(count * 13);
  for (let i = 0; i < count; i++) {
    const a = (i / count) * TAU + (random() - 0.5) * 0.12;
    const spread = 0.025 + random() * 0.05;
    const color = colors[i % colors.length];
    const g = ctx.createLinearGradient(radius, radius, radius + Math.cos(a) * radius, radius + Math.sin(a) * radius);
    g.addColorStop(0, alpha(color, 0));
    g.addColorStop(0.12, alpha(color, 0.75));
    g.addColorStop(0.5, alpha(color, 0.3));
    g.addColorStop(1, alpha(color, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(radius, radius);
    ctx.arc(radius, radius, radius, a - spread, a + spread);
    ctx.closePath();
    ctx.fill();
  }
  ctx.globalCompositeOperation = "destination-in";
  ctx.fillStyle = radial(ctx, radius, radius, radius, [[0, "rgba(0,0,0,0)"], [0.1, "rgba(0,0,0,0.9)"], [0.5, "rgba(0,0,0,0.5)"], [1, "rgba(0,0,0,0)"]]);
  ctx.fillRect(0, 0, size, size);
  return {
    draw(target, cx, cy, angle, intensity = 1, scale = 1) {
      if (intensity <= 0) return;
      target.save();
      target.globalCompositeOperation = "screen";
      target.globalAlpha = Math.min(1, intensity);
      target.translate(cx, cy);
      target.rotate(angle);
      target.scale(scale, scale);
      target.drawImage(c, -radius, -radius);
      target.restore();
    },
  };
}

/** L'éclipse derrière une Secrète : un disque noir, sa couronne et ses jets qui tournent. */
export function drawEclipse(ctx, cx, cy, r, angle, intensity = 1) {
  if (intensity <= 0) return;
  ctx.save();
  ctx.globalAlpha = intensity;
  ctx.globalCompositeOperation = "screen";
  ctx.translate(cx, cy);
  ctx.rotate(angle);
  const jets = conicCss(ctx, 0, 0, 0, Array.from({ length: 73 }, (_, i) =>
    i % 2 === 0 ? "rgba(231,225,247,0)" : `rgba(231,225,247,${(0.18 + 0.22 * Math.abs(Math.sin(i * 1.7))).toFixed(2)})`,
  ));
  ctx.fillStyle = jets;
  ctx.beginPath();
  ctx.arc(0, 0, r * 1.9, 0, TAU);
  ctx.fill();
  ctx.restore();
  ctx.save();
  ctx.globalAlpha = intensity;
  ctx.fillStyle = radial(ctx, cx, cy, r * 1.9, [[0.45, "rgba(2,2,4,0)"], [0.53, "rgba(231,225,247,0.0)"], [0.56, "rgba(231,225,247,0.35)"], [1, "rgba(7,6,12,0)"]]);
  ctx.globalCompositeOperation = "screen";
  ctx.fillRect(cx - r * 2, cy - r * 2, r * 4, r * 4);
  ctx.globalCompositeOperation = "source-over";
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, TAU);
  ctx.fillStyle = "#030205";
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = "rgba(231,225,247,0.6)";
  ctx.stroke();
  ctx.restore();
}

/** Une constellation qui se trace (Variante), de 0 à 1. */
export function drawConstellation(ctx, points, edges, progressValue, color = "#dcfdff") {
  ctx.save();
  ctx.strokeStyle = alpha(color, 0.45);
  ctx.lineWidth = 1;
  const shown = edges.length * progressValue;
  edges.forEach(([a, b], i) => {
    const k = Math.min(1, Math.max(0, shown - i));
    if (k <= 0) return;
    const p = points[a];
    const q = points[b];
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x + (q.x - p.x) * k, p.y + (q.y - p.y) * k);
    ctx.stroke();
  });
  for (const p of points) {
    glow(ctx, p.x, p.y, 9, color, 0.5 * progressValue);
    ctx.fillStyle = alpha("#ffffff", 0.9 * progressValue);
    sparklePath(ctx, p.x, p.y, 2.6);
    ctx.fill();
  }
  ctx.restore();
}
