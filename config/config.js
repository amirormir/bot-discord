import dotenv from "dotenv";

dotenv.config();

export const CONFIG = {
  DISCORD_TOKEN: process.env.DISCORD_TOKEN,
  INTENTS: ["Guilds", "GuildMessages", "MessageContent"],
};

export const WATCHED_USERS = [
  "320579673828360194",
  "374853015296933890",
  "1223954854138085387",
];

export const RANDOM_RESPONSE_USER = "277825453580877824";

export const RANDOM_RESPONSES = [
  "bien dit goat",
  "les termes",
  "reel",
  "OWN THIS FRAUD",
  "MY midlaner",
];

export const REPLACEMENT_GIF =
  "https://tenor.com/view/om-ome-flight-flightreacts-ome3-gif-11351943889690488996";

export const MESSAGE_DELETE_DELAY = 5000; // 5 secondes
