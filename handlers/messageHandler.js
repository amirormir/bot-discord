import { Logger } from "../utils/logger.js";
import { RandomResponseHandler } from "./randomResponseHandler.js";
import { ImageModerationHandler } from "./imageModerationHandler.js";
import { GlobalResponseHandler } from "./globalResponseHandler.js";
import { MessageTemplateHandler } from "./messageTemplateHandler.js";
import { CustomGameHandler } from "./customGameHandler.js";
import { WatchedUser } from "../models/WatchedUser.js";
import { RandomResponseUser } from "../models/RandomResponseUser.js";

function parseDiscordId(input) {
  // Enlève <@, <@!, >, espaces, etc. pour ne garder que l'ID pur
  return input.replace(/<@!?([0-9]+)>/, "$1").trim();
}

async function addWatchedUser(userId) {
  const cleanId = parseDiscordId(userId);
  try {
    const existing = await WatchedUser.findOne({ userId: cleanId });
    if (existing) return false;
    await WatchedUser.create({ userId: cleanId });
    Logger.info(`[DEBUG] Utilisateur surveillé ajouté: '${cleanId}'`);
    return true;
  } catch (e) {
    Logger.error(`[DEBUG] Erreur lors de l'ajout: ${e.message}`);
    return false;
  }
}

async function removeWatchedUser(userId) {
  const cleanId = parseDiscordId(userId);
  try {
    const res = await WatchedUser.deleteOne({ userId: cleanId });
    Logger.info(`[DEBUG] Utilisateur surveillé supprimé: '${cleanId}'`);
    return res.deletedCount > 0;
  } catch (e) {
    Logger.error(`[DEBUG] Erreur lors de la suppression: ${e.message}`);
    return false;
  }
}

async function setRandomResponseUser(userId) {
  let config = await RandomResponseUser.findOne();
  if (config) {
    config.userId = userId;
    await config.save();
  } else {
    await RandomResponseUser.create({ userId });
  }
}

async function removeRandomResponseUser() {
  await RandomResponseUser.deleteMany({});
}

function hasAdminPermission(member) {
  return member.permissions.has("Administrator");
}

export class MessageHandler {
  constructor() {
    this.randomResponseHandler = new RandomResponseHandler();
    this.imageModerationHandler = new ImageModerationHandler();
    this.globalResponseHandler = new GlobalResponseHandler();
    this.messageTemplateHandler = new MessageTemplateHandler();
    this.customGameHandler = new CustomGameHandler();
  }

  async handleMessage(message) {
    Logger.user(
      `Nouveau message de ${message.author.tag} (${message.author.id}) : ${message.content}`
    );

    if (message.author.bot) {
      return;
    }

    // Vérification des permissions pour toutes les commandes
    if (
      message.content.startsWith("!") &&
      !hasAdminPermission(message.member)
    ) {
      await message.reply(
        "❌ Vous devez avoir la permission **Administrateur** pour utiliser les commandes du bot."
      );
      return;
    }

    // Commandes Custom 5v5
    if (message.content === "!custom start") {
      await this.customGameHandler.startCustomGame(message);
      return;
    }
    if (message.content === "!custom stop") {
      await this.customGameHandler.stopCustomGame(message);
      return;
    }
    if (message.content === "!custom reset") {
      await this.customGameHandler.resetCustomGame(message);
      return;
    }
    if (message.content === "!custom reroll") {
      await this.customGameHandler.rerollTeams(message);
      return;
    }

    // Commandes de gestion des utilisateurs surveillés
    if (message.content.startsWith("!addwatch ")) {
      const userId = message.content.split(" ")[1];
      if (!userId) {
        await message.reply("Usage : !addwatch <userId>");
        return;
      }
      const added = await addWatchedUser(userId);
      if (added) {
        await message.reply(`Utilisateur surveillé ajouté : ${userId}`);
      } else {
        await message.reply(
          `L'utilisateur ${userId} est déjà surveillé ou une erreur est survenue.`
        );
      }
      return;
    }
    if (message.content.startsWith("!removewatch ")) {
      const userId = message.content.split(" ")[1];
      if (!userId) {
        await message.reply("Usage : !removewatch <userId>");
        return;
      }
      const removed = await removeWatchedUser(userId);
      if (removed) {
        await message.reply(
          `Utilisateur retiré de la surveillance : ${userId}`
        );
      } else {
        await message.reply(
          `L'utilisateur ${userId} n'était pas surveillé ou une erreur est survenue.`
        );
      }
      return;
    }

    // Commandes pour gérer l'utilisateur random response
    if (message.content.startsWith("!setrandomuser ")) {
      const userId = message.content.split(" ")[1];
      if (!userId) {
        await message.reply("Usage : !setrandomuser <userId>");
        return;
      }
      await setRandomResponseUser(userId);
      await message.reply(
        `Utilisateur cible des réponses random défini : ${userId}`
      );
      return;
    }
    if (message.content.startsWith("!removerandomuser")) {
      await removeRandomResponseUser();
      await message.reply(
        "Aucun utilisateur n'a désormais accès aux réponses random."
      );
      return;
    }

    // Commande pour lister toutes les commandes
    if (message.content === "!help") {
      await message.reply(
        `**Commandes disponibles :**\n\n` +
          `**🎮 Custom 5v5 :**\n` +
          `!custom start : Démarrer une queue 5v5\n` +
          `!custom stop : Arrêter la queue\n` +
          `!custom reset : Vider la queue\n` +
          `!custom reroll : Refaire les équipes\n\n` +
          `**👥 Gestion des utilisateurs surveillés :**\n` +
          `!addwatch <userId> : Ajouter un utilisateur surveillé\n` +
          `!removewatch <userId> : Retirer un utilisateur surveillé\n\n` +
          `**🎲 Gestion des réponses random :**\n` +
          `!setrandomuser <userId> : Définir l'utilisateur cible des réponses random\n` +
          `!removerandomuser : Désactiver les réponses random\n\n` +
          `**📝 Gestion des templates :**\n` +
          `!createtemplate <nom> <contenu> : Créer un template de message\n` +
          `!listtemplates : Lister tous les templates\n` +
          `!deletetemplate <nom> : Supprimer un template\n` +
          `!sendmessage : Envoyer un message via sélecteur\n\n` +
          `**🎯 Autres :**\n` +
          `!bazouzou : Afficher tous les bazouzou disponibles\n` +
          `!help : Afficher cette liste de commandes\n\n` +
          `⚠️ **Toutes les commandes nécessitent la permission Administrateur**`
      );
      return;
    }

    // Commande pour afficher les bazouzou
    if (message.content === "!bazouzou") {
      const bazouzouList = [
        "8=D",
        "8==D",
        "8===D",
        "8>D",
        "8=D~",
        "8=D💦",
        "8====D",
        "8=====D",
        "8======D",
        "8=====D~",
        "8====D💦",
        "8====D~",
        "8========D",
        "8=========D",
        "8===========D",
        "8============D💦",
        "8=========D~~",
        "8=========D🍑",
        "8==D~",
        "8=)D",
        "8==D🍌",
        "(8====D)",
        "[8====D]",
        "/8===D\\",
        "8==D👉👌",
        "8=D ¿",
        "8=3D",
        "8==D⛓️",
        "8===D🐍",
        "8===D🔥",
        "8===D😳",
        "8===D🚀",
        "8===D💀",
      ];

      const randomBazouzou =
        bazouzouList[Math.floor(Math.random() * bazouzouList.length)];
      await message.reply(randomBazouzou);
      return;
    }

    // Gestion de la modération des images
    await this.imageModerationHandler.handleMessage(message);

    // Gestion des réponses aléatoires
    await this.randomResponseHandler.handleMessage(message);

    // Gestion des réponses globales et ADC
    await this.globalResponseHandler.handleMessage(message);

    // Gestion des templates de messages
    await this.messageTemplateHandler.handleMessage(message);
  }
}
