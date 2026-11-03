// !profil : la carte de visite d'un jardinier, dans l'ambiance et la teinte qu'il a choisies sur
// le site (config/profile.ts). Avatar, titre, devise, étiquette d'herbier qui se remplit, jauge
// de rang, et sa carte de cœur (ou sa plus belle) qui éclot à droite.
import { TAU, ease, progress } from "../motion.js";
import { fitSize, printable, setFont, wrapLines } from "../fonts.js";
import { drawMeter, drawSpecimen } from "../label.js";
import { createFireflies, createRays, paintAmbiance } from "../garden.js";
import { glow } from "../paint.js";
import { bloom, cardSeed, drawAura, drawBrand, drawCard3D, drawCardShadow, drawChip, drawMotes } from "../stage.js";
import { COLORS, PRISM, alpha, rarityRank } from "../theme.js";
import { FPS, H, W, glint, makeSprites, stepped } from "./common.js";

const FIREFLIES = { clairiere: 9, rosee: 3, lucioles: 20, serre: 7, "sous-bois": 8, prisme: 8 };
const MONTH = new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric", timeZone: "Europe/Paris" });

const plural = (n, word) => `${n} ${word}${n > 1 ? "s" : ""}`;

export async function profilScene({ player, featured, best }, { images, avatar }) {
  const pick = featured ?? best?.[0] ?? null;
  const duration = 5.2;
  const period = duration;
  const frames = Math.round(duration * FPS);
  const accent = player.accent ?? COLORS.mint;
  const backdrop = paintAmbiance(W, H, player.ambiance, accent);
  const fireflies = createFireflies({
    W,
    H,
    count: FIREFLIES[player.ambiance] ?? 9,
    seed: 5,
    period,
    color: player.ambiance === "serre" ? "#c2fbe5" : player.ambiance === "sous-bois" ? "#bdf0ff" : player.ambiance === "prisme" ? "#ffd6f4" : undefined,
    area: { x: 0, y: H * 0.12, w: W, h: H * 0.7 },
  });
  const width = 228;
  const [entry] = pick ? await makeSprites([pick], width, images) : [];
  const cx = 566;
  const cy = 300;
  const shines = pick && rarityRank(pick.card.rarity) >= rarityRank("mythique");
  const rays = shines ? createRays({ radius: 300, colors: pick.card.rarity === "variante" ? ["#7df9ff", "#dcfdff"] : PRISM, count: 16 }) : null;
  const avatarImage = avatar ?? images.get(player.avatarUrl) ?? null;
  const { stats, rank } = player;
  const since = MONTH.format(new Date(player.joinedAt));

  return {
    width: W,
    height: H,
    fps: FPS,
    frames,
    draw(ctx, i) {
      const t = i / FPS;
      const slow = stepped(i, 2);
      const out = 1 - progress(stepped(i, 3), duration - 0.45, duration - 0.05);
      ctx.drawImage(backdrop, 0, 0);
      fireflies.draw(ctx, stepped(i, 2), { intensity: 1, tint: undefined });

      // L'avatar, cerclé de la teinte du joueur : l'anneau se trace.
      const ax = 92;
      const ay = 124;
      const ar = 52;
      const ring = ease.inOutCubic(progress(t, 0.15, 0.85));
      glow(ctx, ax, ay, ar * 1.9, accent, 0.35 + 0.25 * ring);
      ctx.save();
      ctx.beginPath();
      ctx.arc(ax, ay, ar, 0, TAU);
      ctx.clip();
      ctx.fillStyle = COLORS.night800;
      ctx.fillRect(ax - ar, ay - ar, ar * 2, ar * 2);
      if (avatarImage) ctx.drawImage(avatarImage, ax - ar, ay - ar, ar * 2, ar * 2);
      else {
        setFont(ctx, { family: "display", weight: 650, size: 40 });
        ctx.fillStyle = accent;
        ctx.textAlign = "center";
        ctx.fillText(printable(player.name).slice(0, 1).toUpperCase(), ax, ay + 14);
        ctx.textAlign = "left";
      }
      ctx.restore();
      ctx.save();
      ctx.lineWidth = 3;
      ctx.strokeStyle = accent;
      ctx.shadowColor = accent;
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.arc(ax, ay, ar + 4, -Math.PI / 2, -Math.PI / 2 + TAU * Math.max(0.001, ring));
      ctx.stroke();
      ctx.restore();

      // Le nom (dès la première image : l'aperçu du GIF dit déjà de qui il s'agit).
      const name = printable(player.name);
      const nx = 166;
      const size = fitSize(ctx, name, 400 - nx, { family: "display", weight: 650 }, { min: 22, max: 38 });
      setFont(ctx, { family: "display", weight: 650, size });
      ctx.fillStyle = COLORS.ink;
      ctx.shadowColor = "rgba(0,0,0,0.6)";
      ctx.shadowBlur = 8;
      ctx.fillText(name, nx, 118);
      ctx.shadowBlur = 0;
      const k = ease.outCubic(progress(t, 0.35, 0.9)) * out;
      if (k > 0) {
        ctx.save();
        ctx.globalAlpha = k;
        setFont(ctx, { family: "ui", weight: 700, size: 15 });
        ctx.fillStyle = accent;
        ctx.fillText(printable(player.title), nx, 146);
        setFont(ctx, { family: "display", italic: true, weight: 400, size: 15 });
        ctx.fillStyle = COLORS.lichen;
        ctx.fillText(`Jardinier n° ${player.arrival}, depuis ${since}`, nx, 170);
        ctx.restore();
      }
      let y = 204;
      if (player.motto) {
        const km = ease.outCubic(progress(t, 0.55, 1.1)) * out;
        if (km > 0) {
          ctx.save();
          ctx.globalAlpha = km;
          setFont(ctx, { family: "display", italic: true, weight: 400, size: 18 });
          ctx.fillStyle = alpha(COLORS.ink, 0.88);
          wrapLines(ctx, `« ${player.motto} »`, 372, 2).forEach((line, n) => ctx.fillText(line, 36, y + 6 + n * 24));
          ctx.restore();
        }
        y += 58;
      }

      // L'étiquette : les chiffres comptent jusqu'à leur valeur.
      const count = (value) => Math.round(value * ease.outCubic(progress(slow, 0.8, 1.8)));
      drawSpecimen(ctx, {
        x: 36,
        y,
        w: 372,
        title: "Herbier",
        number: `${Math.round((stats.owned / Math.max(1, stats.inPlay)) * 100)} %`,
        rows: [
          ["Collection", `${count(stats.owned)} sur ${stats.inPlay}`],
          ["Boosters ouverts", `${count(stats.opened)}`],
          ["Mythiques", `${count(stats.mythics)}`, stats.mythics ? "#ff6ad5" : undefined],
          ["Premières éclosions", `${count(stats.finds)}`],
          ["Série", plural(stats.streak, "jour")],
          ["Badges", `${count(stats.badges)} sur ${stats.badgesTotal}`],
        ],
        t: out > 0 ? t : 0,
        at: 0.7,
        rowHeight: player.motto ? 26 : 29,
        size: 15,
      });

      // Le rang : où il en est, jusqu'au suivant.
      const km = ease.outCubic(progress(t, 1.3, 1.8)) * out;
      if (km > 0) {
        ctx.save();
        ctx.globalAlpha = km;
        setFont(ctx, { family: "display", italic: true, weight: 400, size: 15 });
        ctx.fillStyle = COLORS.lichen;
        ctx.fillText(rank.next ? `${rank.name}, puis ${rank.next}` : `${rank.name}, le plus haut rang`, 36, H - 44);
        drawMeter(ctx, { x: 36, y: H - 34, w: 372, value: rank.next ? rank.toNext : 1, color: accent, t: slow, at: 1.4, duration: 1 });
        ctx.restore();
      }

      // À droite : sa carte de cœur, ou sa plus belle carte.
      if (entry && out > 0) {
        const { slot, sprite } = entry;
        const h = sprite.height;
        const p = progress(t, 0.5, 1.45);
        const settled = ease.outCubic(progress(p, 0.6, 1)) * out;
        if (rays) rays.draw(ctx, cx, cy, 0.3, 0.5 * settled, 1.1);
        drawAura(ctx, cx, cy, width, h, slot.card.rarity, slow, period, settled);
        drawCardShadow(ctx, cx, cy, width, h, settled);
        const b = bloom(ctx, { cx, cy, w: width, h, p, rarity: slot.card.rarity, seed: cardSeed(slot.card, 9) });
        if (b.visible) {
          const g = glint(slow, period, 0, 1, { from: 2.1 });
          const opened = ease.outCubic(progress(p, 0.6, 1));
          const face = sprite.render(t, { light: g.light, on: opened < 1 ? 0.9 - 0.6 * opened : g.on, spin: (360 * slow) / period, sweep: progress(slow, 2.6, 3.6) });
          drawCard3D(ctx, face, null, { cx, cy, scaleX: b.scaleX, alpha: out });
          if (b.flash > 0.01) {
            ctx.save();
            ctx.globalCompositeOperation = "lighter";
            drawCard3D(ctx, face, null, { cx, cy, scaleX: b.scaleX, alpha: b.flash * 0.85 });
            ctx.restore();
          }
          drawMotes(ctx, cx, cy, width, h, slot.card.rarity, slow, period, settled);
          drawChip(ctx, cx, cy - h / 2 - 20, featured ? "Carte de cœur" : "Sa plus belle carte", accent, settled);
        }
      }
      drawBrand(ctx, W - 28, 40);
    },
  };
}
