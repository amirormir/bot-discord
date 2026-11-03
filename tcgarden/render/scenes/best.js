// !best : le podium des trois plus belles cartes d'un joueur. La troisième éclot, puis la
// deuxième, puis la première, plus grande, dont la lumière envahit le jardin.
import { TAU, ease, progress } from "../motion.js";
import { printable, setFont } from "../fonts.js";
import { glow } from "../paint.js";
import { bloom, cardSeed, drawAura, drawBrand, drawCard3D, drawCardShadow, drawChip, drawMotes, drawTitle } from "../stage.js";
import { COLORS, alpha, rarityOf, rarityRank } from "../theme.js";
import { FPS, H, W, createSky, glint, makeSprites, stepped } from "./common.js";

const PLACES = ["1re place", "2e place", "3e place"];

export async function bestScene({ player, best }, { images }) {
  const slots = best.slice(0, 3);
  // Le podium : la première au centre, la deuxième à gauche, la troisième à droite.
  const spots = [[W / 2, 292], [W / 2 - 222, 322], [W / 2 + 222, 322]];
  const widths = [214, 168, 168];
  const cards = await makeSprites(slots, (_, i) => widths[i], images);
  const shines = rarityRank(slots[0].card.rarity) >= rarityRank("legendaire");
  const duration = 5.2;
  const period = duration;
  const frames = Math.round(duration * FPS);
  // Éclosions : de la troisième à la première.
  const starts = [1.15, 0.7, 0.3].slice(0, slots.length);
  if (slots.length === 2) starts.splice(0, 2, 0.75, 0.3);
  if (slots.length === 1) starts.splice(0, 1, 0.35);
  const firstAt = starts[0];
  const [hx, hy] = spots[0];
  const sky = createSky({ slots, hero: 0, images, period, focus: { x: hx / W, y: hy / H } });
  const glintFrom = firstAt + 1.4;

  return {
    width: W,
    height: H,
    fps: FPS,
    frames,
    draw(ctx, i) {
      const t = i / FPS;
      const slow = stepped(i, 3);
      const out = 1 - progress(stepped(i, 3), duration - 0.45, duration - 0.05);
      const reveal = shines ? progress(t, firstAt + 0.45, firstAt + 1.2) : 1;
      const lit = (shines ? ease.inOutCubic(progress(slow, firstAt + 0.6, firstAt + 1.4)) : 0.5) * out;
      sky.drawBack(ctx, slow, { glow: lit, reveal, cx: hx, cy: hy, size: widths[0] * 1.8 });

      // Du fond vers l'avant : la troisième, la deuxième, puis la première par-dessus.
      for (const index of [2, 1, 0]) {
        const entry = cards[index];
        if (!entry || out <= 0) continue;
        const { slot, sprite } = entry;
        const [x, y] = spots[index];
        const width = widths[index];
        const h = sprite.height;
        const color = rarityOf(slot.card.rarity).color;
        const length = index === 0 ? 1 : 0.8;
        const p = progress(t, starts[index], starts[index] + length);
        // Le socle : une flaque de lumière sous la carte, dès le début.
        const base = 0.35 + 0.65 * ease.outCubic(progress(p, 0.4, 1));
        ctx.save();
        ctx.translate(x, y + h / 2 + 10);
        ctx.scale(1, 0.22);
        glow(ctx, 0, 0, width * 0.95, color, 0.55 * base * out);
        ctx.restore();
        if (p <= 0) {
          ctx.fillStyle = alpha(color, 0.6);
          ctx.beginPath();
          ctx.arc(x, y, 2.6, 0, TAU);
          ctx.fill();
          continue;
        }
        const settled = ease.outCubic(progress(p, 0.6, 1)) * out;
        drawAura(ctx, x, y, width, h, slot.card.rarity, slow, period, settled);
        drawCardShadow(ctx, x, y, width, h, settled);
        const b = bloom(ctx, { cx: x, cy: y, w: width, h, p, rarity: slot.card.rarity, seed: cardSeed(slot.card, index) });
        if (!b.visible) continue;
        const g = glint(stepped(i, 2), period, index, slots.length, { from: glintFrom });
        const opened = ease.outCubic(progress(p, 0.6, 1));
        const face = sprite.render(t, {
          light: g.light,
          on: opened < 1 ? 0.9 - 0.6 * opened : g.on,
          spin: (360 * stepped(i, 2)) / period,
          sweep: progress(stepped(i, 2), glintFrom + 0.4, glintFrom + 1.4),
        });
        drawCard3D(ctx, face, null, { cx: x, cy: y, scaleX: b.scaleX, alpha: out });
        if (b.flash > 0.01) {
          ctx.save();
          ctx.globalCompositeOperation = "lighter";
          drawCard3D(ctx, face, null, { cx: x, cy: y, scaleX: b.scaleX, alpha: b.flash * 0.85 });
          ctx.restore();
        }
        drawMotes(ctx, x, y, width, h, slot.card.rarity, slow, period, settled);
        drawChip(ctx, x, y - h / 2 - 18, PLACES[index], index === 0 ? COLORS.firefly : COLORS.lune, settled);

        // Sous la carte : sa rareté, et son numéro d'exemplaire.
        const k = ease.outCubic(progress(p, 0.7, 1)) * out;
        if (k > 0) {
          ctx.save();
          ctx.globalAlpha = k;
          ctx.textAlign = "center";
          setFont(ctx, { family: "ui", weight: 700, size: index === 0 ? 16 : 14 });
          ctx.fillStyle = color;
          ctx.fillText(slot.card.rarityLabel, x, y + h / 2 + 30);
          setFont(ctx, { family: "display", italic: true, weight: 400, size: index === 0 ? 16 : 14 });
          ctx.fillStyle = COLORS.lichen;
          const serial = slot.card.veiled
            ? `exemplaire ${slot.serial} sur ${slot.card.printRun}`
            : slot.copies > 1
              ? `exemplaire n° ${slot.serial}, et ${slot.copies - 1} autre${slot.copies > 2 ? "s" : ""}`
              : `exemplaire n° ${slot.serial}`;
          ctx.fillText(serial, x, y + h / 2 + 50);
          ctx.restore();
        }
      }

      sky.drawFront(ctx, t, { intensity: 0.5 + 0.5 * progress(t, 0, 0.6), lit, cx: hx, cy: hy, size: widths[0] * 1.4 });
      drawTitle(ctx, { x: 34, y: 44, intro: "Les plus belles cartes de", name: printable(player.name), t: 10, size: 32 });
      drawBrand(ctx, W - 28, 40);
    },
  };
}
