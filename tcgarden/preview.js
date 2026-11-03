// Aperçu sans Discord : `npm run tcgarden:preview -- <commande> <id Discord | nom de carte>`.
// Lit le site (TCGARDEN_URL, TCGARDEN_BOT_SECRET), rend le GIF comme le ferait le bot, et
// l'écrit dans .lab/. Exemple : npm run tcgarden:preview -- vitrine 277825453580877824
import { mkdirSync, writeFileSync } from "node:fs";

import { TcgardenApi, imageUrls } from "./api.js";
import { TCGARDEN } from "./config.js";
import { RenderQueue } from "./render/pool.js";

const [command, ...rest] = process.argv.slice(2);
const arg = rest.join(" ");
if (!command || !arg) {
  console.error("Usage : npm run tcgarden:preview -- <vitrine|best|profil|booster|carte> <id Discord | nom>");
  process.exit(1);
}
if (!TCGARDEN.secret) {
  console.error("TCGARDEN_BOT_SECRET manque (dans .env).");
  process.exit(1);
}

const api = new TcgardenApi({ url: TCGARDEN.url, secret: TCGARDEN.secret });
const queue = new RenderQueue();

async function load() {
  if (command === "carte") {
    const result = await api.card(/^\d{17,20}$/.test(arg) ? { member: arg } : { q: arg });
    return result?.card ? { entry: result.card } : null;
  }
  if (command === "booster") {
    const data = await api.lastOpening(arg);
    return data?.opening ? data : null;
  }
  const data = await api.player(arg);
  if (!data) return null;
  if (command === "vitrine") return data.showcase.length ? { player: data.player, showcase: data.showcase } : null;
  if (command === "best") return data.best.length ? { player: data.player, best: data.best } : null;
  return { player: data.player, featured: data.featured, best: data.best };
}

try {
  const data = await load();
  if (!data) {
    console.error("Rien à montrer : compte inconnu, vitrine vide, aucune ouverture ou carte introuvable.");
    process.exitCode = 1;
  } else {
    const buffers = await api.download(imageUrls(data));
    const { gif, stats } = await queue.render(command, data, buffers);
    mkdirSync(new URL("../.lab/", import.meta.url), { recursive: true });
    const file = new URL(`../.lab/${command}.gif`, import.meta.url);
    writeFileSync(file, gif);
    console.log(`${file.pathname} : ${(stats.bytes / 1024 / 1024).toFixed(2)} Mo, ${stats.frames} images, ${stats.ms} ms, ${Object.keys(buffers).length} images téléchargées`);
  }
} finally {
  await queue.close();
}
