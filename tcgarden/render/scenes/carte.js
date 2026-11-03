// !carte : la fiche d'une carte du catalogue. La carte se retourne depuis son dos, sa lumière
// prend le jardin, puis elle tourne doucement en 3D pendant que son étiquette d'herbier s'écrit.
import { ease, progress, wave } from "../motion.js";
import { printable, setFont, wrapLines, fitSize } from "../fonts.js";
import { drawSpecimen } from "../label.js";
import { bloom, cardSeed, drawAura, drawBrand, drawCard3D, drawCardShadow, drawMotes } from "../stage.js";
import { COLORS, mix, rarityOf } from "../theme.js";
import { FPS, H, W, createSky, makeSprites, stepped } from "./common.js";

const DAY = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Paris" });

export async function carteScene({ entry }, { images }) {
  const { card } = entry;
  const slot = { card, serial: 0, copies: 0 };
  const width = 248;
  const [{ sprite, back }] = await makeSprites([slot], width, images);
  const duration = 5.6;
  const period = duration;
  const frames = Math.round(duration * FPS);
  const cx = 178;
  const cy = 292;
  const sky = createSky({ slots: [slot], hero: 0, images, period, focus: { x: cx / W, y: cy / H } });
  const color = rarityOf(card.rarity).color;
  const tone = card.rarity === "variante" ? "glace" : "jardin";
  const limited = entry.printRun
    ? entry.printRun === 1
      ? "pièce unique"
      : `${entry.printRun} exemplaires pour toujours`
    : null;
  const rows = [
    ["Série", entry.seriesName],
    ["Rareté", card.rarityLabel, color],
    ...(limited ? [["Tirage", limited]] : []),
    ["En circulation", entry.copies ? `${entry.copies} exemplaire${entry.copies > 1 ? "s" : ""}` : "aucun encore"],
    ["Trouvée par", entry.discoveredBy ? `${entry.discoveredBy} jardinier${entry.discoveredBy > 1 ? "s" : ""}` : "personne encore"],
    ["Première éclosion", entry.firstFinder ? printable(entry.firstFinder) : "à venir"],
    ...(entry.firstFoundAt ? [["Éclose le", DAY.format(new Date(entry.firstFoundAt))]] : []),
  ];

  return {
    width: W,
    height: H,
    fps: FPS,
    frames,
    draw(ctx, i) {
      const t = i / FPS;
      const slow = stepped(i, 3);
      const out = 1 - progress(stepped(i, 3), duration - 0.45, duration - 0.05);
      // La carte arrive de dos, se retourne, puis tourne doucement d'un côté à l'autre.
      const turn = ease.inOutCubic(progress(t, 0.55, 1.25));
      const reveal = progress(t, 0.95, 1.65);
      const lit = ease.inOutCubic(progress(slow, 1.1, 1.9)) * out;
      sky.drawBack(ctx, slow, { glow: lit, reveal, cx, cy, size: width * 1.7 });
      const h = sprite.height;
      const settled = ease.outCubic(progress(t, 1.1, 1.6)) * out;
      drawAura(ctx, cx, cy, width, h, card.rarity, slow, period, settled);
      const sway = stepped(i, 2);
      const rotY = Math.PI * (1 - turn) + 0.2 * ease.inOutSine(progress(sway, 1.6, 2.4)) * wave(sway, period, 0.25);
      // L'ombre suit la largeur apparente de la carte qui tourne.
      const facing = Math.abs(Math.cos(rotY));
      if (facing > 0.05) drawCardShadow(ctx, cx, cy, width * facing, h, out * facing);
      // Gerbe au moment où la face apparaît.
      if (t > 0.95) bloom(ctx, { cx, cy, w: width, h, p: 0.36 + 0.64 * progress(t, 0.95, 1.9), rarity: card.rarity, seed: cardSeed(card, 3) });
      const light = { px: 0.5 - Math.sin(rotY) * 0.9, py: 0.32 + 0.1 * wave(sway, period, 0.1) };
      const face = sprite.render(t, { light, on: 0.55, spin: (360 * sway) / period, sweep: progress(sway, 2.4, 3.4) });
      const backImage = back.render(t);
      // Dès la première image, le dos attend : l'aperçu du GIF n'est jamais vide.
      drawCard3D(ctx, face, backImage, { cx, cy: cy - 4 * Math.sin(Math.PI * progress(t, 0, 0.55)), rotY, alpha: out });
      drawMotes(ctx, cx, cy, width, h, card.rarity, slow, period, settled);

      // À droite : le nom, son titre, sa citation, puis l'étiquette d'herbier.
      const x = 340;
      const k = ease.outCubic(progress(t, 0.9, 1.5)) * out;
      if (k > 0) {
        ctx.save();
        ctx.globalAlpha = k;
        ctx.translate(0, (1 - k) * 10);
        ctx.textAlign = "left";
        const name = printable(card.name);
        const size = fitSize(ctx, name, W - x - 30, { family: "display", weight: 650 }, { min: 26, max: 46 });
        setFont(ctx, { family: "display", weight: 650, size });
        ctx.fillStyle = COLORS.ink;
        ctx.shadowColor = "rgba(0,0,0,0.6)";
        ctx.shadowBlur = 8;
        ctx.fillText(name, x, 92);
        ctx.shadowBlur = 0;
        let y = 92;
        if (card.title) {
          setFont(ctx, { family: "display", italic: true, weight: 400, size: 19 });
          ctx.fillStyle = mix(color, "#ffffff", 0.35);
          ctx.fillText(printable(card.title), x, (y += 30));
        }
        if (card.quote) {
          setFont(ctx, { family: "display", italic: true, weight: 400, size: 16 });
          ctx.fillStyle = COLORS.lichen;
          const lines = wrapLines(ctx, `« ${card.quote} »`, W - x - 34, 2);
          lines.forEach((line) => ctx.fillText(line, x, (y += 24)));
        }
        ctx.restore();
      }
      drawSpecimen(ctx, {
        x,
        y: card.quote ? 190 : 160,
        w: W - x - 30,
        title: "Fiche",
        number: card.label,
        rows,
        tone,
        t: out > 0 ? t : 0,
        at: 1.35,
        rowHeight: 31,
        size: 16,
      });
      drawBrand(ctx, W - 28, H - 24);
    },
  };
}
