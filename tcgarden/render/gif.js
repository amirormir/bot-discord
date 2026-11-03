// Encodage GIF soigné, pour des dégradés lisses et des fichiers légers :
// - une palette commune à toutes les images, calculée sur un échantillon de l'animation ;
// - un tramage ordonné (bruit de gradient entrelacé), fixe d'une image à l'autre : une zone
//   immobile garde exactement les mêmes pixels, donc rien ne « grouille » ;
// - chaque image n'écrit que les pixels qui changent (les autres sont transparents).
import gifenc from "gifenc";

const { GIFEncoder, quantize } = gifenc;

/** Bruit de gradient entrelacé (Jimenez, 2014) : un tramage presque bleu, sans texture. */
function ditherTable(width, height) {
  const table = new Float32Array(width * height);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const v = 52.9829189 * ((0.06711056 * x + 0.00583715 * y) % 1);
      table[y * width + x] = (v % 1) - 0.5;
    }
  return table;
}

/**
 * Échantillon pour la palette : un pixel sur `stride`, décalé à chaque ligne. Les pixels vifs
 * ou clairs (cartes, lucioles, prisme) comptent triple : sans cela, la nuit, qui couvre presque
 * tout, prendrait toutes les couleurs et les reflets perdraient leur éclat.
 */
function sample(rgba, width, height, stride, out) {
  for (let y = 0; y < height; y++) {
    for (let x = (y * 7) % stride; x < width; x += stride) {
      const q = (y * width + x) * 4;
      const r = rgba[q];
      const g = rgba[q + 1];
      const b = rgba[q + 2];
      const vivid = Math.max(r, g, b) - Math.min(r, g, b) > 70 || r + g + b > 520;
      for (let k = vivid ? 3 : 1; k > 0; k--) out.push(r, g, b);
    }
  }
}

function nearestIndex(palette, r, g, b) {
  let best = 0;
  let bestDistance = Infinity;
  for (let i = 0; i < palette.length; i++) {
    const c = palette[i];
    const dr = c[0] - r;
    const dg = c[1] - g;
    const db = c[2] - b;
    const d = 2 * dr * dr + 4 * dg * dg + 3 * db * db;
    if (d < bestDistance) {
      bestDistance = d;
      best = i;
    }
  }
  return best;
}

/**
 * Encode une animation. `render(i)` rend l'image i et renvoie ses pixels RGBA : il est appelé
 * deux fois pour quelques images (l'échantillon de la palette), une fois pour les autres, et doit
 * donc donner toujours la même image pour le même i.
 */
export function encodeAnimation({
  width,
  height,
  frames,
  fps,
  render,
  sampleEvery = 4,
  dither = 9,
}) {
  const started = Date.now();
  const pixels = width * height;

  // 1. Palette commune (255 couleurs, la 256e sert de transparence).
  const picked = [];
  const sampledFrames = new Set();
  for (let i = 0; i < frames; i += sampleEvery) sampledFrames.add(i);
  sampledFrames.add(frames - 1);
  for (const i of sampledFrames) sample(render(i), width, height, 3, picked);
  const rgba = new Uint8Array((picked.length / 3) * 4);
  for (let i = 0, j = 0; i < picked.length; i += 3, j += 4) {
    rgba[j] = picked[i];
    rgba[j + 1] = picked[i + 1];
    rgba[j + 2] = picked[i + 2];
    rgba[j + 3] = 255;
  }
  const colors = quantize(rgba, 255, { format: "rgb565" });
  const transparent = colors.length;
  const palette = [...colors, [0, 0, 0]];

  // 2. Correspondance couleur → indice, sur 6 bits par canal, remplie à la demande.
  const lut = new Int16Array(1 << 18).fill(-1);
  const noise = ditherTable(width, height);

  const gif = GIFEncoder({ initialCapacity: 1 << 20 });
  let previous = null;
  let changed = 0;
  for (let i = 0; i < frames; i++) {
    const data = render(i);
    const index = new Uint8Array(pixels);
    for (let p = 0, q = 0; p < pixels; p++, q += 4) {
      const d = noise[p] * dither;
      let r = data[q] + d;
      let g = data[q + 1] + d;
      let b = data[q + 2] + d;
      r = r < 0 ? 0 : r > 255 ? 255 : r;
      g = g < 0 ? 0 : g > 255 ? 255 : g;
      b = b < 0 ? 0 : b > 255 ? 255 : b;
      const key = ((r >> 2) << 12) | ((g >> 2) << 6) | (b >> 2);
      let k = lut[key];
      if (k < 0)
        k = lut[key] = nearestIndex(
          colors,
          ((r >> 2) << 2) + 2,
          ((g >> 2) << 2) + 2,
          ((b >> 2) << 2) + 2,
        );
      index[p] = k;
    }

    if (!previous) {
      gif.writeFrame(index, width, height, {
        palette,
        delay: 1000 / fps,
        repeat: 0,
        dispose: 1,
      });
    } else {
      // Seuls les pixels qui changent : les autres restent ceux de l'image précédente.
      const delta = new Uint8Array(pixels);
      for (let p = 0; p < pixels; p++) {
        if (index[p] === previous[p]) delta[p] = transparent;
        else {
          delta[p] = index[p];
          changed++;
        }
      }
      gif.writeFrame(delta, width, height, {
        delay: 1000 / fps,
        transparent: true,
        transparentIndex: transparent,
        dispose: 1,
      });
    }
    previous = index;
  }
  gif.finish();
  const bytes = Buffer.from(gif.bytes());
  return {
    gif: bytes,
    stats: {
      bytes: bytes.length,
      frames,
      colors: colors.length,
      changedPerFrame: Math.round(changed / Math.max(1, frames - 1)),
      ms: Date.now() - started,
    },
  };
}
