// Fil de rendu : les GIF se calculent ici, pour que le bot reste réactif pendant ce temps.
import { parentPort } from "node:worker_threads";

import { renderScene } from "./render.js";

parentPort.on("message", async ({ id, scene, data, buffers }) => {
  try {
    const { gif, stats } = await renderScene(scene, data, buffers);
    parentPort.postMessage({ id, gif, stats });
  } catch (error) {
    parentPort.postMessage({ id, error: error?.message ?? String(error) });
  }
});
