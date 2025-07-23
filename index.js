import dotenv from "dotenv";
import { Client, GatewayIntentBits } from "discord.js";
import axios from "axios";
import fs from "fs";

dotenv.config();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

client.on("ready", () => {
  console.log(`✅ Connecté en tant que ${client.user.tag}`);
});

// Liste des utilisateurs surveillés
const WATCHED_USERS = [
  "320579673828360194",
  "374853015296933890",
  "1223954854138085387",
  "310504912192536593",
  "324201004176375808",
];

// GIF de remplacement
const REPLACEMENT_GIF =
  "https://tenor.com/view/om-ome-flight-flightreacts-ome3-gif-11351943889690488996";

client.on("messageCreate", async (message) => {
  console.log(
    `📝 Nouveau message de ${message.author.tag} (${message.author.id}) : ${message.content}`
  );

  if (message.author.bot) return;

  // Vérifier si l'utilisateur est dans la liste surveillée
  if (!WATCHED_USERS.includes(message.author.id)) {
    return;
  }

  console.log(`👀 Utilisateur surveillé détecté : ${message.author.tag}`);

  let hasImage = false;

  // 1. Vérifier les pièces jointes
  if (message.attachments.size) {
    for (const [, attachment] of message.attachments) {
      const url = attachment.url;
      const isImage = /\.(jpg|jpeg|png|gif|webp)$/i.test(url);
      console.log(`🔗 Pièce jointe détectée : ${attachment.name} (${url})`);

      if (isImage) {
        console.log("🖼️ Image/GIF détectée dans pièce jointe");
        hasImage = true;
        break;
      }
    }
  }

  // 2. Vérifier les liens dans le texte
  if (!hasImage) {
    const urlRegex =
      /(https?:\/\/(?:[\w-]+\.)+[\w-]+(?:[\w\-\._~:/?#[\]@!$&'()*+,;=]+)?)/gi;
    const urls = message.content.match(urlRegex) || [];

    for (const url of urls) {
      if (
        /\.(jpg|jpeg|png|gif|webp)$/i.test(url) ||
        url.includes("tenor.com") ||
        url.includes("giphy.com")
      ) {
        console.log(`🔗 Lien image/GIF détecté dans le texte : ${url}`);
        hasImage = true;
        break;
      }
    }
  }

  // Si une image/GIF est détectée, supprimer et remplacer
  if (hasImage) {
    try {
      console.log("🚫 Suppression du message contenant une image/GIF");
      await message.delete();

      console.log("🔄 Envoi du message de remplacement");
      const replacementMessage = await message.channel.send({
        content: `${REPLACEMENT_GIF}\n\n**crois le**`,
      });

      // Supprimer le message de remplacement après 5 secondes
      setTimeout(async () => {
        try {
          await replacementMessage.delete();
          console.log("⏰ Message de remplacement supprimé après 5 secondes");
        } catch (err) {
          console.error(
            "❌ Erreur lors de la suppression du message de remplacement:",
            err.message
          );
        }
      }, 5000);
    } catch (err) {
      console.error(
        "❌ Erreur lors de la suppression/remplacement:",
        err.message
      );
    }
  } else {
    console.log("✅ Aucune image/GIF détectée, message conservé");
  }
});

client.login(process.env.DISCORD_TOKEN);
