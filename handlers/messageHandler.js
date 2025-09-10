import { Logger } from "../utils/logger.js";
import { ImageModerationHandler } from "./imageModerationHandler.js";
import { GlobalResponseHandler } from "./globalResponseHandler.js";
import { MessageTemplateHandler } from "./messageTemplateHandler.js";
import { CustomGameHandler } from "./customGameHandler.js";
import { WatchedUser } from "../models/WatchedUser.js";
import { RandomResponseUser } from "../models/RandomResponseUser.js";
import { EmbedBuilder } from "discord.js";

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

function canUseCustomCommands(member) {
  // Seuls les administrateurs et les utilisateurs avec le rôle "arbitre" peuvent utiliser les commandes custom
  const isAdmin = member.permissions.has("Administrator");
  const hasArbitreRole = member.roles.cache.some(
    (role) => role.name.toLowerCase() === "arbitre"
  );
  return isAdmin || hasArbitreRole;
}

function canUseAdminCommands(member) {
  return member.permissions.has("Administrator");
}

export class MessageHandler {
  constructor() {
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

    // Vérification des permissions pour les commandes admin
    if (
      message.content === "!resetclassement" &&
      !canUseAdminCommands(message.member)
    ) {
      await message.reply(
        "❌ Vous devez avoir la permission **Administrateur** pour utiliser cette commande."
      );
      return;
    }

    // Vérification des permissions pour les commandes custom et classement
    const customCommands = [
      "!custom start",
      "!custom stop",
      "!custom reroll",
      "!custom test",
      "!custom random",
      "!classement",
    ];
    const isCustomCommand = customCommands.some(
      (cmd) => message.content === cmd
    );

    if (isCustomCommand && !canUseCustomCommands(message.member)) {
      await message.reply(
        "❌ Seuls les administrateurs et les utilisateurs avec le rôle **Arbitre** peuvent utiliser les commandes custom."
      );
      return;
    }

    // Vérification des permissions pour les autres commandes (admin only)
    const otherCommands = [
      "!addwatch",
      "!removewatch",
      "!setrandomuser",
      "!removerandomuser",
      "!createtemplate",
      "!listtemplates",
      "!deletetemplate",
      "!sendmessage",
    ];
    const isOtherCommand = otherCommands.some((cmd) =>
      message.content.startsWith(cmd)
    );

    if (isOtherCommand && !canUseAdminCommands(message.member)) {
      await message.reply(
        "❌ Vous devez avoir la permission **Administrateur** pour utiliser cette commande."
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
    if (message.content === "!custom reroll") {
      await this.customGameHandler.rerollTeams(message);
      return;
    }
    if (message.content === "!custom test") {
      await this.customGameHandler.simulateTestPlayers(message);
      return;
    }
    if (message.content === "!custom random") {
      await this.customGameHandler.simulateRandomPlayers(message);
      return;
    }
    if (message.content === "!classement") {
      await this.customGameHandler.showLeaderboard(message);
      return;
    }
    if (message.content === "!resetclassement") {
      await this.customGameHandler.resetLeaderboard(message);
      return;
    }
    if (message.content.startsWith("!stats ")) {
      const userId = message.content.split(" ")[1];
      if (!userId) {
        await message.reply("Usage : !stats <@user>");
        return;
      }
      const cleanUserId = parseDiscordId(userId);
      await this.customGameHandler.showPlayerStats(message, cleanUserId);
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
    if (message.content === "!loli") {
      const helpEmbed = new EmbedBuilder()
        .setTitle("🤖 Commandes du Bot")
        .setColor("#00ff00")
        .addFields(
          {
            name: "🎮 Queue 5v5 Custom",
            value: [
              "`!custom start` - Démarrer une queue 5v5",
              "`!custom stop` - Arrêter, vider et reset la queue",
              "`!custom reroll` - Refaire les équipes avec les joueurs actuels",
              "`!custom test` - Créer 10 joueurs de test prédéfinis",
              "`!custom random` - Créer 10 joueurs avec rôles/niveaux aléatoires",
            ].join("\n"),
            inline: false,
          },
          {
            name: "📊 Statistiques et Classement",
            value: [
              "`!classement` - Afficher le classement des joueurs",
              "`!stats <@user>` - Afficher les stats détaillées d'un joueur",
              "`!resetclassement` - Réinitialiser le classement (Admin)",
            ].join("\n"),
            inline: false,
          },
          {
            name: "👥 Gestion des utilisateurs surveillés",
            value: [
              "`!addwatch <@user>` - Ajouter un utilisateur surveillé",
              "`!removewatch <@user>` - Retirer un utilisateur surveillé",
            ].join("\n"),
            inline: false,
          },
          {
            name: "🎲 Gestion des réponses aléatoires",
            value: [
              "`!setrandomuser <@user>` - Définir l'utilisateur pour les réponses aléatoires",
              "`!removerandomuser` - Retirer l'utilisateur des réponses aléatoires",
            ].join("\n"),
            inline: false,
          },
          {
            name: "📝 Gestion des templates de messages",
            value: [
              "`!createtemplate <nom> <contenu>` - Créer un template",
              "`!listtemplates` - Lister tous les templates",
              "`!deletetemplate <nom>` - Supprimer un template",
              "`!sendmessage` - Envoyer un template via sélecteur",
            ].join("\n"),
            inline: false,
          },
          {
            name: "🎯 Autres commandes",
            value: [
              "`!bazouzou` - Envoyer un bazouzou aléatoire",
              "`!loli` - Afficher cette aide",
            ].join("\n"),
            inline: false,
          }
        )
        .setFooter({
          text: "Commandes Custom/Classement: Tous les membres | Autres commandes: Administrateur uniquement",
        });

      await message.reply({ embeds: [helpEmbed] });
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

    // Gestion des réponses globales et ADC
    await this.globalResponseHandler.handleMessage(message);

    // Gestion des templates de messages
    await this.messageTemplateHandler.handleMessage(message);
  }
}
