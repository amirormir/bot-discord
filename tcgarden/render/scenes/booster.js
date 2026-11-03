// !booster : le dernier sachet révélé, rejoué. Le sachet de graines tremble, se déchire, les
// cinq cartes en jaillissent de dos, se retournent une à une, et la plus rare se retourne en
// dernier, plus grande, avec sa lumière (animations.md, en version courte).
import { Path2D } from "@napi-rs/canvas";

import { TAU, ease, progress, wave } from "../motion.js";
import { printable, setFont } from "../fonts.js";
import { canvas, glow } from "../paint.js";
import { bloom, cardSeed, drawAura, drawBrand, drawCard3D, drawCardShadow, drawChip, drawMotes, drawTitle } from "../stage.js";
import { COLORS, alpha, rarityOf, rarityRank } from "../theme.js";
import { FPS, H, W, createSky, glint, makeSprites, stepped } from "./common.js";

const PACK_LABELS = { normal: "Racines", golden: "Floraison", divine: "Éternité" };
const TINTS = {
  normal: { top: "#24573f", bottom: "#0b2219", line: "#8ff5cf", glow: "#3ee6a8" },
  golden: { top: "#7a5f1c", bottom: "#251b07", line: "#ffd98a", glow: "#ffc646" },
  divine: { top: "#5a4486", bottom: "#160f29", line: "#e6d4ff", glow: "#b07cff" },
};

// Le sachet du site (seed-packet.tsx), viewBox 60 × 84 : bord supérieur dentelé à déchirer.
const SHAPE = new Path2D("M2 8l4-4 4 4 4-4 4 4 4-4 4 4 4-4 4 4 4-4 4 4 4-4 4 4 4-4 4 4V80a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4Z");
const SPROUT = new Path2D("M30 62V38M30 54c-9 0-10-7-8-10 5 0 8 4 8 10Zm0-6c9 0 10-8 8-10-6 1-8 4-8 10Z");
const LID = 18;

/** Le sachet, dessiné une fois à sa taille (s pixels par unité du viewBox). */
function paintPacket(type, s) {
  const tint = TINTS[type] ?? TINTS.normal;
  const c = canvas(60 * s, 84 * s);
  const ctx = c.getContext("2d");
  ctx.scale(s, s);
  const body = ctx.createLinearGradient(0, 0, 60 * 0.35, 84);
  body.addColorStop(0, tint.top);
  body.addColorStop(1, tint.bottom);
  ctx.fillStyle = body;
  ctx.fill(SHAPE);
  ctx.save();
  ctx.clip(SHAPE);
  ctx.fillStyle = "rgba(0,0,0,0.18)";
  ctx.fillRect(2, 8, 56, 10);
  ctx.strokeStyle = alpha(tint.line, 0.5);
  ctx.lineWidth = 0.35;
  ctx.setLineDash([1, 1]);
  ctx.beginPath();
  ctx.moveTo(2, LID);
  ctx.lineTo(58, LID);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.strokeStyle = alpha(tint.line, 0.4);
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.roundRect(6.5, 22.5, 47, 56, 2.5);
  ctx.stroke();
  ctx.strokeStyle = alpha(tint.line, 0.45);
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.ellipse(30, 46, 13, 16, 0, 0, TAU);
  ctx.stroke();
  ctx.strokeStyle = tint.line;
  ctx.lineWidth = 1.3;
  ctx.lineJoin = "round";
  ctx.save();
  ctx.translate(0, -2);
  ctx.stroke(SPROUT);
  ctx.restore();
  ctx.fillStyle = tint.line;
  ctx.beginPath();
  ctx.arc(30, 33.5, 1.6, 0, TAU);
  ctx.fill();
  ctx.textAlign = "center";
  setFont(ctx, { family: "display", weight: 500, size: 3.6, tracking: 0.8 });
  ctx.fillText("TCGARDEN", 30.4, 14.4);
  setFont(ctx, { family: "display", italic: true, weight: 400, size: 7 });
  ctx.fillText(PACK_LABELS[type] ?? PACK_LABELS.normal, 30, 72);
  ctx.letterSpacing = "0px";
  const sheen = ctx.createLinearGradient(0, 0, 60, 0);
  sheen.addColorStop(0, "rgba(255,255,255,0)");
  sheen.addColorStop(0.5, "rgba(255,255,255,0.12)");
  sheen.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = sheen;
  ctx.globalAlpha = 0.7;
  ctx.beginPath();
  ctx.moveTo(-10, 84);
  ctx.lineTo(40, 4);
  ctx.lineTo(54, 4);
  ctx.lineTo(4, 84);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  return { image: c, tint };
}

export async function boosterScene({ player, opening }, { images }) {
  const slots = opening.cards.slice(0, 5);
  // La plus rare (à égalité, la dernière : la vedette du sachet) se révèle à la fin, au centre.
  let best = 0;
  slots.forEach((s, i) => {
    if (rarityRank(s.card.rarity) >= rarityRank(slots[best].card.rarity)) best = i;
  });
  const others = slots.map((_, i) => i).filter((i) => i !== best);
  const xs = [90, 210, 510, 630];
  const spot = new Map(others.map((index, k) => [index, [xs[k] ?? 360, 318]]));
  spot.set(best, [360, 304]);
  const width = (i) => (i === best ? 156 : 116);
  const cards = await makeSprites(slots, (_, i) => width(i), images);
  const shines = rarityRank(slots[best].card.rarity) >= rarityRank("legendaire");
  const duration = 6;
  const period = duration;
  const frames = Math.round(duration * FPS);
  const sky = createSky({ slots, hero: best, images, period, focus: { x: 0.5, y: 304 / H } });
  const packet = paintPacket(opening.type, 2.9);
  const pw = packet.image.width;
  const ph = packet.image.height;
  const flipAt = new Map(others.map((index, k) => [index, 1.9 + k * 0.3]));
  const bestAt = 1.9 + others.length * 0.3 + 0.35;
  flipAt.set(best, bestAt);
  const glintFrom = bestAt + 1.1;

  return {
    width: W,
    height: H,
    fps: FPS,
    frames,
    draw(ctx, i) {
      const t = i / FPS;
      const slow = stepped(i, 3);
      const out = 1 - progress(stepped(i, 3), duration - 0.45, duration - 0.05);
      const reveal = shines ? progress(t, bestAt + 0.35, bestAt + 1.1) : 1;
      const lit = (shines ? ease.inOutCubic(progress(slow, bestAt + 0.5, bestAt + 1.3)) : 0.5) * out;
      sky.drawBack(ctx, slow, { glow: lit, reveal, cx: 360, cy: 304, size: 156 * 1.8 });

      // Le sachet : il flotte, tremble, se déchire, puis tombe et s'efface.
      const tear = progress(t, 0.95, 1.5);
      const drop = ease.inCubic(progress(t, 1.2, 1.8));
      if (drop < 1) {
        const bob = 5 * wave(stepped(i, 2), 1.6, 0);
        const shake = ease.inCubic(progress(t, 0.5, 0.95)) * (1 - progress(t, 0.95, 1.05));
        const angle = -0.06 + shake * 0.07 * Math.sin(t * 70) - drop * 0.25;
        const px = 360;
        const py = 300 + bob + drop * 140;
        glow(ctx, px, py - 20, 210, packet.tint.glow, 0.35 * (1 - drop) + 0.4 * Math.sin(Math.PI * tear));
        ctx.save();
        ctx.globalAlpha = 1 - drop;
        ctx.translate(px, py);
        ctx.rotate(angle);
        // Le corps, sous la ligne de déchirure.
        const lidH = LID * 2.9;
        ctx.drawImage(packet.image, 0, lidH, pw, ph - lidH, -pw / 2, -ph / 2 + lidH, pw, ph - lidH);
        // La lumière qui s'échappe de l'ouverture.
        if (tear > 0) {
          const g = ctx.createLinearGradient(0, -ph / 2 + lidH, 0, -ph / 2 + lidH - 160);
          g.addColorStop(0, alpha("#ffffff", 0.85 * Math.sin(Math.PI * tear)));
          g.addColorStop(0.3, alpha(packet.tint.glow, 0.5 * Math.sin(Math.PI * tear)));
          g.addColorStop(1, alpha(packet.tint.glow, 0));
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.moveTo(-pw / 2 + 8, -ph / 2 + lidH);
          ctx.lineTo(pw / 2 - 8, -ph / 2 + lidH);
          ctx.lineTo(pw / 2 + 50, -ph / 2 + lidH - 160);
          ctx.lineTo(-pw / 2 - 50, -ph / 2 + lidH - 160);
          ctx.closePath();
          ctx.fill();
        }
        // Le haut, qu'on arrache.
        const lift = ease.outCubic(tear);
        ctx.translate(lift * 70, -lift * 60);
        ctx.rotate(lift * 0.6);
        ctx.globalAlpha = (1 - drop) * (1 - progress(t, 1.15, 1.45));
        ctx.drawImage(packet.image, 0, 0, pw, lidH, -pw / 2, -ph / 2, pw, lidH);
        ctx.restore();
      }

      // Les cartes : elles jaillissent de dos, puis se retournent.
      for (const index of [...others, best]) {
        const { slot, sprite, back } = cards[index];
        const [x, y] = spot.get(index);
        const w = width(index);
        const h = sprite.height;
        const k = others.indexOf(index);
        const launch = 1.08 + (k < 0 ? 4 : k) * 0.07;
        const fly = ease.outCubic(progress(t, launch, launch + 0.55));
        if (fly <= 0 || out <= 0) continue;
        const fx = 360 + (x - 360) * fly;
        const fy = 250 + (y - 250) * fly - Math.sin(Math.PI * fly) * 70;
        const scale = 0.55 + 0.45 * fly;
        const at = flipAt.get(index);
        const isBest = index === best;
        // Juste avant de se retourner, la plus rare frémit.
        const quiver = isBest ? Math.sin(Math.PI * progress(t, at - 0.35, at)) * Math.sin(t * 60) * 0.04 : 0;
        const flip = ease.inOutCubic(progress(t, at, at + (isBest ? 0.5 : 0.32)));
        const settled = ease.outCubic(progress(t, at + 0.2, at + 0.7)) * out;
        drawAura(ctx, fx, fy, w, h, slot.card.rarity, slow, period, settled);
        drawCardShadow(ctx, fx, fy, w * scale, h * scale, fly * out);
        if (flip > 0.5 || isBest) {
          bloom(ctx, { cx: fx, cy: fy, w, h, p: 0.36 + 0.64 * progress(t, at + 0.12, at + (isBest ? 1.2 : 0.9)), rarity: slot.card.rarity, seed: cardSeed(slot.card, index) });
        }
        if (isBest && t > at - 0.4 && flip < 1) glow(ctx, fx, fy, w * 1.2, rarityOf(slot.card.rarity).color, 0.5 * progress(t, at - 0.4, at));
        const g = glint(stepped(i, 2), period, index, slots.length, { from: glintFrom });
        const face = flip > 0.5 ? sprite.render(t, { light: g.light, on: settled < 1 ? 0.9 - 0.6 * settled : g.on, spin: (360 * stepped(i, 2)) / period, sweep: progress(stepped(i, 2), glintFrom + 0.3, glintFrom + 1.3) }) : null;
        drawCard3D(ctx, face, back.render(t), { cx: fx, cy: fy, scale, rotY: Math.PI * (1 - flip), rotZ: quiver + (1 - fly) * 0.3, alpha: out });
        if (flip >= 1) {
          drawMotes(ctx, fx, fy, w, h, slot.card.rarity, slow, period, settled);
          const tag = slot.card.veiled ? `Secrète ${slot.serial}/${slot.card.printRun}` : slot.first ? "Inédite" : slot.isNew ? "Nouvelle" : null;
          if (tag) drawChip(ctx, fx, fy - h / 2 - 16, tag, slot.first ? COLORS.firefly : slot.card.veiled ? "#e7e1f7" : COLORS.mint, settled);
        }
      }

      sky.drawFront(ctx, t, { intensity: 0.6 + 0.4 * progress(t, 0, 0.6), lit, cx: 360, cy: 304, size: 156 * 1.4 });
      drawTitle(ctx, { x: 34, y: 44, intro: "Le dernier sachet de", name: printable(player.name), t: 10, size: 32 });
      if (opening.boosters > 1) {
        setFont(ctx, { family: "display", italic: true, weight: 400, size: 16 });
        ctx.fillStyle = COLORS.lichen;
        ctx.fillText(`le plus beau des ${opening.boosters} sachets ouverts d'un coup`, 34, 104);
      }
      drawBrand(ctx, W - 28, 40);
    },
  };
}
