import assert from "node:assert/strict";
import { test } from "node:test";

import omggif from "omggif";

import { renderScene } from "../render/render.js";
import { card, opening, owned, player, showcase } from "./fixtures.js";

/** Chaque scène donne un GIF valide, à la bonne taille, assez léger pour Discord. */
async function check(scene, data) {
  const { gif, stats } = await renderScene(scene, data, {});
  const reader = new omggif.GifReader(new Uint8Array(gif));
  assert.equal(reader.width, 720);
  assert.equal(reader.height, 540);
  assert.equal(reader.numFrames(), stats.frames);
  assert.ok(stats.frames >= 80, `${stats.frames} images`);
  assert.ok(gif.length < 6 * 1024 * 1024, `${(gif.length / 1024 / 1024).toFixed(2)} Mo`);
  // La première image n'est jamais vide : c'est l'aperçu que Discord montre.
  const pixels = new Uint8ClampedArray(720 * 540 * 4);
  reader.decodeAndBlitFrameRGBA(0, pixels);
  let lit = 0;
  for (let p = 0; p < pixels.length; p += 4) if (pixels[p] + pixels[p + 1] + pixels[p + 2] > 330) lit++;
  assert.ok(lit > 400, `première image presque noire (${lit} pixels clairs)`);
  return stats;
}

test("vitrine de six cartes, Secrète voilée comprise", async () => {
  await check("vitrine", { player: player(), showcase: showcase() });
});

test("vitrine d'une seule carte", async () => {
  await check("vitrine", { player: player(), showcase: [owned(card("rare"))] });
});

test("podium, de une à trois cartes", async () => {
  await check("best", { player: player(), best: [owned(card("mythique")), owned(card("legendaire"), 3, 2), owned(card("epique"))] });
  await check("best", { player: player(), best: [owned(card("commune"))] });
});

test("profil, avec et sans carte de cœur", async () => {
  await check("profil", { player: player(), featured: owned(card("variante", "peach")), best: [] });
  await check("profil", { player: player({ motto: null, ambiance: "inconnue" }), featured: null, best: [] });
});

test("dernier sachet", async () => {
  await check("booster", { player: player(), opening: opening() });
});

test("fiche d'une carte", async () => {
  await check("carte", {
    entry: { card: card("legendaire", "Level up"), seriesName: "Saison 1 — Racines", copies: 3, owners: 2, discoveredBy: 2, firstFinder: "Herboriste", firstFoundAt: "2026-11-01T10:00:00.000Z", printRun: null, member: null },
  });
});
