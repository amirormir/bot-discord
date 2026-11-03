// !vitrine : la vitrine d'un joueur (jusqu'à six cartes, dans son ordre). Les cartes éclosent
// l'une après l'autre, la plus rare en dernier, et sa lumière prend le fond ; puis une vague de
// lumière passe sur la vitrine.
import { TAU, ease, progress, wave } from "../motion.js";
import { printable } from "../fonts.js";
import { bloom, cardSeed, drawAura, drawBrand, drawCard3D, drawCardShadow, drawChip, drawMotes, drawTitle } from "../stage.js";
import { rarityOf, rarityRank } from "../theme.js";
import { FPS, H, W, createSky, glint, heroIndex, makeSprites, stepped } from "./common.js";

/** Places des cartes selon leur nombre : une rangée jusqu'à quatre, deux au-delà. */
function layout(count) {
  if (count <= 1) return { width: 250, spots: [[W / 2, 318]] };
  if (count === 2) return { width: 220, spots: [[W / 2 - 128, 318], [W / 2 + 128, 318]] };
  if (count === 3) return { width: 192, spots: [[W / 2 - 212, 322], [W / 2, 322], [W / 2 + 212, 322]] };
  if (count === 4) return { width: 152, spots: [0, 1, 2, 3].map((i) => [W / 2 + (i - 1.5) * 168, 326]) };
  const top = Math.ceil(count / 2);
  const row = (n, y) => Array.from({ length: n }, (_, i) => [W / 2 + (i - (n - 1) / 2) * 160, y]);
  return { width: 140, spots: [...row(top, 216), ...row(count - top, 420)] };
}

export async function vitrineScene({ player, showcase }, { images }) {
  const slots = showcase.slice(0, 6);
  const { width, spots } = layout(slots.length);
  const cards = await makeSprites(slots, width, images);
  const hero = heroIndex(slots);
  const heroShines = rarityRank(slots[hero].card.rarity) >= rarityRank("legendaire");
  const duration = 5;
  const period = duration;
  const frames = Math.round(duration * FPS);

  // Ordre d'éclosion : celui de la vitrine, la plus rare gardée pour la fin.
  const order = slots.map((_, i) => i).filter((i) => !heroShines || i !== hero);
  if (heroShines) order.push(hero);
  const starts = new Map(order.map((index, k) => [index, 0.25 + k * 0.16 + (heroShines && index === hero ? 0.3 : 0)]));
  const heroAt = starts.get(hero);
  const [hx, hy] = spots[hero];
  const sky = createSky({ slots, hero, images, period, focus: { x: hx / W, y: hy / H } });
  const glintFrom = Math.max(...starts.values()) + 1;

  return {
    width: W,
    height: H,
    fps: FPS,
    frames,
    draw(ctx, i) {
      const t = i / FPS;
      const slow = stepped(i, 3);
      // Fin de boucle : tout s'éteint par paliers, les graines attendent la boucle suivante.
      const out = 1 - progress(stepped(i, 3), duration - 0.45, duration - 0.05);
      // La vedette éclose : sa lumière envahit le jardin, puis ses rais s'allument.
      const reveal = heroShines ? progress(t, heroAt + 0.4, heroAt + 1.15) : 1;
      const lit = (heroShines ? ease.inOutCubic(progress(slow, heroAt + 0.6, heroAt + 1.4)) : 0.5) * out;
      sky.drawBack(ctx, slow, { glow: lit, reveal, cx: hx, cy: hy, size: width * 1.7 });

      cards.forEach(({ slot, sprite }, index) => {
        const [x, y] = spots[index];
        const length = index === hero && heroShines ? 1 : 0.8;
        const p = progress(t, starts.get(index), starts.get(index) + length);
        const h = sprite.height;
        if (p <= 0 || out <= 0) {
          // Une graine attend sa place.
          const k = 0.5 + 0.5 * wave(stepped(i, 2), 0.8, index * 0.21);
          ctx.save();
          ctx.globalAlpha = 0.35 + 0.35 * k;
          ctx.fillStyle = rarityOf(slot.card.rarity).color;
          ctx.beginPath();
          ctx.arc(x, y, 2.4, 0, TAU);
          ctx.fill();
          ctx.restore();
          return;
        }
        const settled = ease.outCubic(progress(p, 0.6, 1)) * out;
        drawAura(ctx, x, y, width, h, slot.card.rarity, slow, period, settled);
        drawCardShadow(ctx, x, y, width, h, settled);
        const b = bloom(ctx, { cx: x, cy: y, w: width, h, p, rarity: slot.card.rarity, seed: cardSeed(slot.card, index) });
        if (!b.visible) return;
        const g = glint(stepped(i, 2), period, index, slots.length, { from: glintFrom });
        const opened = ease.outCubic(progress(p, 0.6, 1));
        const face = sprite.render(t, {
          light: g.light,
          on: opened < 1 ? 0.9 - 0.6 * opened : g.on,
          spin: (360 * stepped(i, 2)) / period,
          sweep: progress(stepped(i, 2), glintFrom + 0.6, glintFrom + 1.6),
        });
        drawCard3D(ctx, face, null, { cx: x, cy: y, scaleX: b.scaleX, alpha: out });
        if (b.flash > 0.01) {
          ctx.save();
          ctx.globalCompositeOperation = "lighter";
          drawCard3D(ctx, face, null, { cx: x, cy: y, scaleX: b.scaleX, alpha: b.flash * 0.85 });
          ctx.restore();
        }
        drawMotes(ctx, x, y, width, h, slot.card.rarity, slow, period, settled);
        if (slot.card.veiled)
          drawChip(ctx, x, y + h / 2 - 22, slot.serial ? `Secrète ${slot.serial}/${slot.card.printRun}` : "Secrète", "#e7e1f7", settled);
      });

      sky.drawFront(ctx, t, { intensity: 0.5 + 0.5 * progress(t, 0, 0.6), lit, cx: hx, cy: hy, size: width * 1.4 });
      drawTitle(ctx, { x: 34, y: 44, intro: "La vitrine de", name: printable(player.name), t: 10, size: 32 });
      drawBrand(ctx, W - 28, 40);
    },
  };
}
