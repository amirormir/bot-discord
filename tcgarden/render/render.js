// Rend une scène en GIF. Les images (visuels, avatars, signatures) arrivent déjà téléchargées :
// le rendu ne touche jamais au réseau, et donne le même GIF pour les mêmes données.
import { createCanvas, loadImage } from "@napi-rs/canvas";

import { registerFonts } from "./fonts.js";
import { encodeAnimation } from "./gif.js";
import { loadLogo } from "./stage.js";
import { bestScene } from "./scenes/best.js";
import { boosterScene } from "./scenes/booster.js";
import { carteScene } from "./scenes/carte.js";
import { profilScene } from "./scenes/profil.js";
import { vitrineScene } from "./scenes/vitrine.js";

export const SCENES = {
  vitrine: vitrineScene,
  best: bestScene,
  profil: profilScene,
  booster: boosterScene,
  carte: carteScene,
};

/**
 * `buffers` : { [adresse]: octets } des images de la scène. Une image illisible est ignorée
 * (la carte garde alors une fenêtre sombre, comme le site sans visuel).
 */
export async function renderScene(name, data, buffers = {}) {
  const make = SCENES[name];
  if (!make) throw new Error(`Scène inconnue : ${name}`);
  registerFonts();
  await loadLogo();
  const images = new Map();
  for (const [url, bytes] of Object.entries(buffers)) {
    try {
      images.set(url, await loadImage(Buffer.from(bytes)));
    } catch {
      // Visuel corrompu ou format inconnu : la carte s'affiche sans.
    }
  }
  const scene = await make(data, { images });
  const canvas = createCanvas(scene.width, scene.height);
  const ctx = canvas.getContext("2d");
  return encodeAnimation({
    width: scene.width,
    height: scene.height,
    frames: scene.frames,
    fps: scene.fps,
    render(i) {
      ctx.save();
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = "#030907";
      ctx.fillRect(0, 0, scene.width, scene.height);
      scene.draw(ctx, i);
      ctx.restore();
      return ctx.getImageData(0, 0, scene.width, scene.height).data;
    },
  });
}
