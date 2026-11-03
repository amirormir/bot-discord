import assert from "node:assert/strict";
import { test } from "node:test";

import omggif from "omggif";

import { encodeAnimation } from "../render/gif.js";

/** Une petite animation : un carré qui avance sur un dégradé fixe. */
function frameAt(i, width, height) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const p = (y * width + x) * 4;
      const inSquare = x >= i * 4 && x < i * 4 + 10 && y >= 10 && y < 20;
      data[p] = inSquare ? 255 : Math.round((x / width) * 60);
      data[p + 1] = inSquare ? 106 : Math.round((y / height) * 80);
      data[p + 2] = inSquare ? 213 : 30;
      data[p + 3] = 255;
    }
  return data;
}

test("le GIF se relit, image par image, fidèle à l'animation", () => {
  const width = 64;
  const height = 32;
  const frames = 8;
  const { gif, stats } = encodeAnimation({ width, height, frames, fps: 20, render: (i) => frameAt(i, width, height) });
  const reader = new omggif.GifReader(new Uint8Array(gif));
  assert.equal(reader.width, width);
  assert.equal(reader.height, height);
  assert.equal(reader.numFrames(), frames);
  assert.equal(reader.loopCount(), 0, "le GIF boucle sans fin");
  assert.equal(stats.frames, frames);
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let f = 0; f < frames; f++) {
    reader.decodeAndBlitFrameRGBA(f, pixels);
    assert.equal(reader.frameInfo(f).delay, 5, "20 images par seconde");
    const expected = frameAt(f, width, height);
    let worst = 0;
    for (let p = 0; p < pixels.length; p += 4)
      for (let c = 0; c < 3; c++) worst = Math.max(worst, Math.abs(pixels[p + c] - expected[p + c]));
    // Tramage et palette : un écart de quelques niveaux, jamais une image fausse.
    assert.ok(worst <= 24, `image ${f} : écart de ${worst}`);
  }
});

test("une image identique à la précédente ne coûte presque rien", () => {
  const width = 120;
  const height = 90;
  const still = frameAt(0, width, height);
  const one = encodeAnimation({ width, height, frames: 1, fps: 20, render: () => still });
  const many = encodeAnimation({ width, height, frames: 30, fps: 20, render: () => still });
  assert.equal(many.stats.changedPerFrame, 0);
  assert.ok(many.gif.length < one.gif.length + 30 * 200, `${many.gif.length} octets pour 30 images fixes`);
});
