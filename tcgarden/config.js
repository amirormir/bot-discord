// Réglages du module TCGarden, lus dans l'environnement (Railway, ou `.env` en local).
import "dotenv/config";

const list = (value) =>
  (value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

export const TCGARDEN = {
  /** Le site, d'où viennent les données (et les visuels servis par lui). */
  url: (process.env.TCGARDEN_URL || "https://tcgarden.vercel.app").replace(/\/+$/, ""),
  /** Le même secret que BOT_API_SECRET côté site. Sans lui, les commandes restent muettes. */
  secret: process.env.TCGARDEN_BOT_SECRET || "",
  /** Salons où les commandes répondent (identifiants séparés par des virgules) ; vide : partout. */
  channels: list(process.env.TCGARDEN_CHANNEL_IDS),
  /** Délai entre deux commandes d'un même membre, en secondes. */
  cooldown: Number(process.env.TCGARDEN_COOLDOWN || 15),
  /** Au-delà, Discord refuserait le fichier (limite d'un serveur sans boost : 10 Mo). */
  maxBytes: 9 * 1024 * 1024,
};

export const tcgardenEnabled = () => Boolean(TCGARDEN.secret);
