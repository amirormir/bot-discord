// Ce que partagent les scènes : format, cartes prêtes à animer, carte vedette, fond et lumière.
//
// Poids du GIF : chaque pixel qui change d'une image à l'autre coûte. Les grandes nappes qui
// bougent lentement (aurore, rais, éclipse) avancent donc par paliers de trois images, et une
// carte ne chatoie que quand la vague de lumière passe sur elle.
import { createBackSprite, createCardSprite } from "../card.js";
import { createAurora, createFireflies, createRays, drawConstellation, drawEclipse, paintBackdrop, themeLight } from "../garden.js";
import { TAU, clamp, ease, progress, seeded, wave } from "../motion.js";
import { canvas, glow, sparklePath } from "../paint.js";
import { PRISM, alpha, rarityRank, sceneTheme } from "../theme.js";

/** Format des GIF : 4:3, assez grand pour un téléphone, assez léger pour Discord. */
export const W = 720;
export const H = 540;
export const FPS = 20;

/** Le temps de l'image i, arrondi à un palier de `n` images. */
export const stepped = (i, n) => (Math.floor(i / n) * n) / FPS;

/** Les cartes d'une scène, prêtes à animer. `images` : visuels décodés, par adresse. */
export async function makeSprites(slots, width, images) {
  return Promise.all(
    slots.map(async (slot, i) => {
      const w = typeof width === "function" ? width(slot, i) : width;
      const card = slot.card;
      const art = card.veiled ? null : (images.get(card.art?.src) ?? null);
      const signature = !card.veiled && card.signature ? (images.get(card.signature.src) ?? null) : null;
      const sprite = await createCardSprite(card, { width: w, art, signature });
      return { slot, sprite, back: createBackSprite({ width: w }) };
    }),
  );
}

/** La carte la plus rare (à égalité, la première). */
export function heroIndex(slots) {
  let best = 0;
  slots.forEach((s, i) => {
    if (rarityRank(s.card.rarity) > rarityRank(slots[best].card.rarity)) best = i;
  });
  return best;
}

/**
 * Le fond et la lumière d'une scène, d'après sa carte vedette : l'aurore et ses rais
 * prismatiques (Mythique), l'éclipse (Secrète), le ciel de glace (Variante), l'or (Légendaire).
 */
export function createSky({ slots, hero, images, period, focus }) {
  const rarities = slots.map((s) => s.card.rarity);
  const theme = sceneTheme(rarities);
  const heroCard = slots[hero]?.card;
  const heroArt = heroCard && !heroCard.veiled ? images.get(heroCard.art?.src) : null;
  const backdrop = paintBackdrop(W, H, theme, { hero: heroArt, focus });
  // Avant l'éclosion de la vedette, le jardin est dans sa nuit ordinaire.
  const special = theme === "aurore" || theme === "or" || theme === "eclipse" || theme === "glace";
  const night = special ? paintBackdrop(W, H, "lune", { focus }) : backdrop;
  const flood = canvas(W, H);
  const aurora = theme === "aurore" ? createAurora({ W, H, period }) : null;
  const light = themeLight(theme);
  const rays =
    theme === "aurore"
      ? createRays({ radius: 360, colors: PRISM, count: 18 })
      : theme === "or"
        ? createRays({ radius: 340, colors: ["#ffd27a", "#fff1c2"], count: 14 })
        : theme === "glace"
          ? createRays({ radius: 320, colors: ["#7df9ff", "#dcfdff"], count: 10 })
          : null;
  const fireflies = createFireflies({
    W,
    H,
    count: theme === "eclipse" ? 6 : 14,
    seed: 11,
    period,
    color: theme === "glace" ? "#dcfdff" : undefined,
  });
  const random = seeded(23);
  // La constellation des Variantes, qui se trace autour de la carte.
  const stars = Array.from({ length: 9 }, (_, i) => ({
    x: W * (0.06 + 0.88 * ((i * 0.37 + random() * 0.2) % 1)),
    y: H * (0.14 + 0.56 * random()),
  }));
  const edges = [[0, 1], [1, 2], [2, 3], [3, 4], [4, 1], [5, 6], [6, 7], [7, 8]];
  // Poussière de prisme (Mythique) ou d'or (Légendaire) qui monte autour de la vedette.
  const dust = Array.from({ length: 22 }, () => ({
    x: random() - 0.5,
    y: random(),
    speed: 1 + Math.floor(random() * 2),
    size: 1 + random() * 1.8,
    color: theme === "or" ? (random() < 0.5 ? "#ffd27a" : "#fff1c2") : PRISM[Math.floor(random() * PRISM.length)],
  }));
  return {
    theme,
    light,
    /**
     * Le fond, puis ce qui bouge derrière les cartes. `t` : le temps en paliers (stepped) ;
     * `glow` : la lumière de la vedette, de 0 à 1.
     */
    drawBack(ctx, t, { glow: lit = 1, reveal = 1, cx = W / 2, cy = H / 2, size = 300 } = {}) {
      if (reveal >= 1 || !special) ctx.drawImage(backdrop, 0, 0);
      else {
        // La lumière de la vedette envahit le jardin : un disque qui grandit depuis la carte,
        // bordé d'un anneau de lumière. Chaque pixel ne change qu'une fois.
        ctx.drawImage(night, 0, 0);
        if (reveal > 0) {
          const reach = Math.hypot(Math.max(cx, W - cx), Math.max(cy, H - cy)) + 60;
          const r = reach * ease.inOutCubic(reveal);
          const fc = flood.getContext("2d");
          fc.clearRect(0, 0, W, H);
          fc.globalCompositeOperation = "source-over";
          fc.drawImage(backdrop, 0, 0);
          fc.globalCompositeOperation = "destination-in";
          fc.fillStyle = radialMask(fc, cx, cy, r);
          fc.fillRect(0, 0, W, H);
          ctx.drawImage(flood, 0, 0);
          ctx.save();
          ctx.globalCompositeOperation = "screen";
          ctx.strokeStyle = alpha(light, 0.5 * (1 - reveal));
          ctx.lineWidth = 10;
          ctx.filter = "blur(6px)";
          ctx.beginPath();
          ctx.arc(cx, cy, Math.max(1, r - 20), 0, TAU);
          ctx.stroke();
          ctx.restore();
        }
      }
      if (aurora) aurora.draw(ctx, t, { intensity: 0.35 + 0.65 * lit });
      if (theme === "glace") drawConstellation(ctx, stars, edges, lit);
      if (lit <= 0) return;
      // Les rais et l'éclipse restent fixes : une grande nappe qui tourne changerait tous ses
      // pixels à chaque image. Le mouvement vient des cartes, des lucioles et de la poussière.
      if (rays) rays.draw(ctx, cx, cy, 0.2, (theme === "aurore" ? 0.5 : 0.45) * lit, size / 320);
      if (theme === "eclipse") drawEclipse(ctx, cx, cy, size * 0.42, 0.3, lit);
    },
    /** Ce qui flotte devant : lucioles, poussière autour de la vedette. */
    drawFront(ctx, t, { intensity = 1, lit = 0, cx = W / 2, cy = H / 2, size = 300 } = {}) {
      fireflies.draw(ctx, Math.floor(t * FPS / 2) * 2 / FPS, { intensity });
      if ((theme !== "aurore" && theme !== "or") || lit <= 0) return;
      for (const d of dust) {
        const k = (d.y + (t / period) * d.speed) % 1;
        const x = cx + d.x * size * 1.3 + 6 * Math.sin(TAU * (k * 2 + d.x));
        const y = cy + size * 0.55 - k * size * 1.3;
        const a = Math.sin(Math.PI * k) * lit;
        glow(ctx, x, y, d.size * 5, d.color, 0.5 * a);
        ctx.fillStyle = alpha("#ffffff", 0.8 * a);
        sparklePath(ctx, x, y, d.size * 1.3);
        ctx.fill();
      }
    },
  };
}

/** Masque d'un disque au bord adouci (40 px). */
function radialMask(ctx, cx, cy, r) {
  const g = ctx.createRadialGradient(cx, cy, Math.max(0, r - 40), cx, cy, Math.max(1, r));
  g.addColorStop(0, "rgba(0,0,0,1)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  return g;
}

/**
 * La vague de lumière sur une carte au repos : elle passe deux fois par boucle, d'une carte à
 * l'autre, et balaie la carte d'un bord à l'autre (aller, puis retour). Entre deux passages,
 * la carte ne bouge pas : aucun pixel ne change.
 */
export function glint(t, period, index, count, { from = 1.4, length = 1.1 } = {}) {
  const span = (period - from) / 2;
  const offset = (index / Math.max(1, count)) * Math.min(1.2, span - length);
  for (let pass = 0; pass < 2; pass++) {
    const start = from + pass * span + offset;
    const k = progress(t, start, start + length);
    if (k > 0 && k < 1) {
      const e = ease.inOutSine(k);
      const px = pass === 0 ? 0.12 + 0.76 * e : 0.88 - 0.76 * e;
      return { light: { px, py: 0.3 + 0.3 * Math.sin(Math.PI * k) }, on: 0.3 + 0.6 * Math.sin(Math.PI * k), moving: true };
    }
    if (pass === 0 && t < start) return { light: { px: 0.12, py: 0.3 }, on: 0.3, moving: false };
    if (pass === 1 && t < start) return { light: { px: 0.88, py: 0.3 }, on: 0.3, moving: false };
  }
  return { light: { px: 0.12, py: 0.3 }, on: 0.3, moving: false };
}

/** Avancement de l'éclosion d'une carte qui commence à `start` et dure `duration`. */
export const bloomProgress = (t, start, duration = 0.8) => progress(t, start, start + duration);

export { clamp, ease, progress, wave };
