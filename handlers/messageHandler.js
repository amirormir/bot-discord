import { Logger } from "../utils/logger.js";
import { ImageModerationHandler } from "./imageModerationHandler.js";
import { GlobalResponseHandler } from "./globalResponseHandler.js";
import { MessageTemplateHandler } from "./messageTemplateHandler.js";
import { ReactionRoleHandler } from "./reactionRoleHandler.js";
import { CustomGameHandler } from "./customGameHandler.js";
import { AdminHandler } from "./adminHandler.js";
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
    this.adminHandler = new AdminHandler();
    this.imageModerationHandler = new ImageModerationHandler();
    this.globalResponseHandler = new GlobalResponseHandler(this.adminHandler);
    this.messageTemplateHandler = new MessageTemplateHandler();
    this.reactionRoleHandler = new ReactionRoleHandler();
    this.customGameHandler = new CustomGameHandler();
  }

  async handleMessage(message) {
    Logger.user(
      `Nouveau message de ${message.author.tag} (${message.author.id}) : ${message.content}`
    );

    if (message.author.bot) {
      return;
    }

    // Gestion des commandes admin
    const adminCommandHandled = await this.adminHandler.handleAdminCommand(
      message
    );
    if (adminCommandHandled) {
      return;
    }

    // Gestion des commandes publiques
    const publicCommandHandled = await this.adminHandler.handlePublicCommand(
      message
    );
    if (publicCommandHandled) {
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
      "!custom start test",
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
      "!rr ",
      "!msg ",
      "!embed",
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
    if (message.content === "!custom start test") {
      await this.customGameHandler.simulateTestEloPlayers(message);
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
      const helpPages = [
        {
          title: "🤖 Commandes du Bot",
          description: "Page 1/3 • Queue, stats et ELO",
          fields: [
            {
              name: "🎮 Queue 5v5 Custom",
              value: [
                "`!custom start` - Démarrer une queue 5v5",
                "`!custom stop` - Arrêter et vider la queue",
                "`!custom reroll` - Refaire les équipes avec les joueurs actuels",
                "`!custom test` - Créer 10 joueurs de test prédéfinis",
                "`!custom random` - Créer 10 joueurs aléatoires",
                "`!custom start test` - Générer 10 joueurs de test avec ELO",
              ].join("\n"),
              inline: false,
            },
            {
              name: "📊 Stats et classement",
              value: [
                "`!classement` - Afficher le classement",
                "`!stats <@user>` - Afficher les stats détaillées d'un joueur",
                "`!elo <@user>` - Afficher l'ELO et les stats rapides d'un joueur",
                "`!resetclassement` - Réinitialiser le classement",
              ].join("\n"),
              inline: false,
            },
            {
              name: "🛠️ Administration ELO",
              value: [
                "`!admin elo add <@user> <points>` - Ajouter des points ELO",
                "`!admin elo remove <@user> <points>` - Retirer des points ELO",
                "`!admin elo set <@user> <points>` - Définir un ELO précis",
                "`!admin eloreset` - Préparer un reset complet de l'ELO",
                "`!admin elo reset` - Alias de `!admin eloreset`",
                "`!admin eloreset confirm` - Confirmer le reset ELO",
              ].join("\n"),
              inline: false,
            },
          ],
          footer: "Page 1/3",
        },
        {
          title: "🤖 Commandes du Bot",
          description: "Page 2/3 • Outils d'administration",
          fields: [
            {
              name: "👥 Utilisateurs et réponses auto",
              value: [
                "`!addwatch <@user>` - Ajouter un utilisateur surveillé",
                "`!removewatch <@user>` - Retirer un utilisateur surveillé",
                "`!setrandomuser <@user>` - Définir l'utilisateur cible des réponses random",
                "`!removerandomuser` - Désactiver les réponses random ciblées",
                "`!admin pauseglobal` - Activer ou mettre en pause les réponses globales",
              ].join("\n"),
              inline: false,
            },
            {
              name: "📝 Messages et templates",
              value: [
                "`!msg #channel <contenu>` - Envoyer un message rapidement",
                "`!embed` - Créer un embed interactif",
                "`!createtemplate <nom> <contenu>` - Créer un template",
                "`!listtemplates` - Lister les templates",
                "`!deletetemplate <nom>` - Supprimer un template",
                "`!sendmessage` - Envoyer un template via sélecteur",
                "`!sendmessage <nom> #channel` - Envoyer un template directement",
              ].join("\n"),
              inline: false,
            },
            {
              name: "🏷️ Reaction roles",
              value: [
                "`!rr setup` - Configurer un reaction role interactif",
                "`!rr add <msgId> <emoji> @role` - Ajouter une réaction à un message",
                "`!rr remove <msgId> <emoji>` - Retirer une réaction",
                "`!rr list` - Lister les reaction roles",
                "`!rr delete <msgId>` - Supprimer une config reaction role",
              ].join("\n"),
              inline: false,
            },
          ],
          footer: "Page 2/3",
        },
        {
          title: "🤖 Commandes du Bot",
          description: "Page 3/3 • Slash commands et permissions",
          fields: [
            {
              name: "💬 Slash commands `/team`",
              value: [
                "`/team create` - Créer une team",
                "`/team add-player` - Ajouter un joueur à une team",
                "`/team view` - Voir une team existante",
              ].join("\n"),
              inline: false,
            },
            {
              name: "🎯 Divers",
              value: [
                "`!bazouzou` - Envoyer un bazouzou aléatoire",
                "`!loli` - Afficher cette aide complète",
              ].join("\n"),
              inline: false,
            },
            {
              name: "🔐 Permissions",
              value: [
                "`Public` : `!elo`, `!stats`, `!bazouzou`, `!loli`, `/team view`",
                "`Admin ou Arbitre` : toutes les commandes `!custom`, `!classement`, `!admin elo ...`, `!admin pauseglobal`",
                "`Admin uniquement` : `!resetclassement`, `!admin eloreset`, `!admin elo reset`, `!admin eloreset confirm`, commandes templates/messages, `!rr ...`, watchlist, `/team create`, `/team add-player`",
              ].join("\n"),
              inline: false,
            },
          ],
          footer: "Page 3/3",
        },
      ];

      const helpEmbeds = helpPages.map((page) =>
        new EmbedBuilder()
          .setTitle(page.title)
          .setDescription(page.description)
          .setColor("#00ff00")
          .addFields(page.fields)
          .setFooter({ text: page.footer })
      );

      await message.reply({ embeds: helpEmbeds });
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

    // Gestion des reaction roles
    if (message.content.startsWith("!rr ")) {
      await this.reactionRoleHandler.handleMessage(message);
      return;
    }

    // Gestion de la modération des images
    await this.imageModerationHandler.handleMessage(message);

    // Gestion des réponses globales et bazouzou
    await this.globalResponseHandler.handleMessage(message);

    // Gestion des templates de messages et envoi (!msg, !embed, !sendmessage, !createtemplate, etc.)
    await this.messageTemplateHandler.handleMessage(message);
  }
}
