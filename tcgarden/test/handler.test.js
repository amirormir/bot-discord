import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";

process.env.TCGARDEN_BOT_SECRET ??= "secret-de-test";

const { TcgardenApi } = await import("../api.js");
const { TcgardenHandler, parseCommand } = await import("../handler.js");
const { card, owned, player } = await import("./fixtures.js");

test("les commandes se reconnaissent, les autres messages passent", () => {
  assert.deepEqual(parseCommand("!vitrine"), { command: "vitrine", rest: "" });
  assert.deepEqual(parseCommand("  !Best <@123456789012345678>  "), { command: "best", rest: "<@123456789012345678>" });
  assert.deepEqual(parseCommand("!carte rosée du matin"), { command: "carte", rest: "rosée du matin" });
  assert.deepEqual(parseCommand("!tcg"), { command: "aide", rest: "" });
  assert.equal(parseCommand("!classement"), null);
  assert.equal(parseCommand("ma vitrine est belle"), null);
  assert.equal(parseCommand("!vitrines"), null);
});

/** Un message Discord minimal : il garde ses réponses. */
function fakeMessage(content, { mentions = [] } = {}) {
  const replies = [];
  const author = { id: "111111111111111111", tag: "capucine", username: "capucine", displayName: "Capucine", bot: false, displayAvatarURL: () => "https://cdn.test/avatar.png" };
  const users = new Map(mentions.map((u) => [u.id, u]));
  users.find = (fn) => [...users.values()].find(fn);
  return {
    content,
    channelId: "222222222222222222",
    author,
    mentions: { users },
    channel: { sendTyping: async () => {} },
    react: async () => {},
    reply: async (payload) => replies.push(payload),
    replies,
  };
}

let calls;
let handler;
beforeEach(() => {
  calls = [];
  const api = {
    player: async (id) => (calls.push(["player", id]), id === "111111111111111111" ? { player: player(), showcase: [owned(card("epique"))], best: [owned(card("epique"))], featured: null, ownCard: null } : null),
    lastOpening: async (id) => (calls.push(["last", id]), { player: { name: "Capucine", url: "https://jardin.test/joueurs/1" }, opening: null }),
    card: async (q) => (calls.push(["card", q]), { card: null, suggestions: [{ name: "Rosée du matin", rarityLabel: "Rare" }] }),
    download: async () => ({}),
  };
  const queue = { render: async (scene) => (calls.push(["render", scene]), { gif: Buffer.from("GIF89a"), stats: { bytes: 6, frames: 1, ms: 1 } }), close: async () => {} };
  handler = new TcgardenHandler({ api, queue });
});

test("!vitrine rend la scène et répond avec le GIF et un lien", async () => {
  const message = fakeMessage("!vitrine");
  assert.equal(await handler.handleMessage(message), true);
  assert.deepEqual(calls, [["player", "111111111111111111"], ["render", "vitrine"]]);
  const [reply] = message.replies;
  assert.match(reply.content, /La vitrine de \*\*Capucine/);
  assert.equal(reply.files.length, 1);
  assert.equal(reply.components.length, 1);
  assert.deepEqual(reply.allowedMentions, { repliedUser: false, parse: [] });
});

test("un membre sans compte reçoit une invitation, sans rendu", async () => {
  const other = { id: "333333333333333333", username: "lilas", displayName: "Lilas", bot: false };
  const message = fakeMessage("!best <@333333333333333333>", { mentions: [other] });
  await handler.handleMessage(message);
  assert.deepEqual(calls, [["player", "333333333333333333"]]);
  assert.match(message.replies[0].content, /Lilas\*\* n'a pas encore de jardin/);
});

test("!booster d'un autre membre reste privé", async () => {
  const other = { id: "333333333333333333", username: "lilas", bot: false };
  const message = fakeMessage("!booster <@333333333333333333>", { mentions: [other] });
  await handler.handleMessage(message);
  assert.deepEqual(calls, []);
  assert.match(message.replies[0].content, /lui appartient/);
});

test("!carte inconnue propose des noms proches", async () => {
  const message = fakeMessage("!carte rosee");
  await handler.handleMessage(message);
  assert.deepEqual(calls, [["card", { q: "rosee" }]]);
  assert.match(message.replies[0].content, /Peut-être : \*\*Rosée du matin\*\* \(Rare\)/);
});

test("une deuxième commande trop tôt attend son tour", async () => {
  await handler.handleMessage(fakeMessage("!vitrine"));
  const again = fakeMessage("!vitrine");
  await handler.handleMessage(again);
  assert.equal(again.replies.length, 0);
  assert.equal(calls.filter(([kind]) => kind === "render").length, 1);
});

test("le secret ne part que vers les routes du bot, jamais vers Cloudinary", async () => {
  const seen = [];
  const api = new TcgardenApi({
    url: "https://jardin.test",
    secret: "s3cr3t",
    fetch: async (url, init) => {
      seen.push([url, init.headers.Authorization ?? null]);
      return new Response(new Uint8Array([1, 2, 3]), { status: 200 });
    },
  });
  await api.download(["https://jardin.test/api/bot/v1/art/lys?v=1", "https://res.cloudinary.com/x/image.webp", "https://jardin.test/cards/lys.svg"]);
  assert.deepEqual(new Map(seen), new Map([
    ["https://jardin.test/api/bot/v1/art/lys?v=1", "Bearer s3cr3t"],
    ["https://res.cloudinary.com/x/image.webp", null],
    ["https://jardin.test/cards/lys.svg", null],
  ]));
  // En cache : la même adresse ne se retélécharge pas.
  await api.download(["https://res.cloudinary.com/x/image.webp"]);
  assert.equal(seen.length, 3);
});

test("un compte inconnu vaut null, une panne du site lève une erreur", async () => {
  const api = new TcgardenApi({ url: "https://jardin.test", secret: "s", fetch: async (url) => new Response("{}", { status: url.includes("404") ? 404 : 500 }) });
  assert.equal(await api.json("/players/404"), null);
  await assert.rejects(api.json("/players/500"), /Réponse 500/);
});
