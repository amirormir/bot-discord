import { Logger } from "../utils/logger.js";
import { PlayerStats } from "../models/PlayerStats.js";
import { Match } from "../models/Match.js";
import { EmbedBuilder } from "discord.js";

export class AdminHandler {
  constructor() {
    this.globalResponsesPaused = false;
  }

  /**
   * Vérifie si l'utilisateur a les permissions admin
   * @param {GuildMember} member - Le membre Discord
   * @returns {boolean}
   */
  hasAdminPermission(member) {
    return member.permissions.has("Administrator");
  }

  /**
   * Vérifie si l'utilisateur peut utiliser les commandes admin (admin ou arbitre)
   * @param {GuildMember} member - Le membre Discord
   * @returns {boolean}
   */
  canUseAdminCommands(member) {
    const isAdmin = member.permissions.has("Administrator");
    const hasArbitreRole = member.roles.cache.some(
      (role) => role.name.toLowerCase() === "arbitre"
    );
    return isAdmin || hasArbitreRole;
  }

  /**
   * Gère les commandes admin
   * @param {Message} message - Le message Discord
   * @returns {Promise<boolean>} - true si une commande admin a été traitée
   */
  async handleAdminCommand(message) {
    if (!this.canUseAdminCommands(message.member)) {
      return false;
    }

    const content = message.content.toLowerCase().trim();

    // Debug log
    Logger.info(`[ADMIN_DEBUG] Commande reçue: "${content}"`);

    // Commande pour mettre en pause/activer les réponses globales
    if (content === "!admin pauseglobal") {
      Logger.info(`[ADMIN_DEBUG] Commande pauseglobal détectée`);
      await this.toggleGlobalResponses(message);
      return true;
    }

    // Commande reset ELO (vérifier avant les autres commandes elo)
    if (content === "!admin eloreset" || content === "!admin elo reset") {
      Logger.info(`[ADMIN_DEBUG] Commande eloreset détectée`);
      await this.resetAllElo(message);
      return true;
    }

    // Commande confirm reset ELO
    if (content === "!admin eloreset confirm") {
      Logger.info(`[ADMIN_DEBUG] Commande eloreset confirm détectée`);
      await this.confirmEloReset(message);
      return true;
    }

    // Commandes ELO
    if (content.startsWith("!admin elo")) {
      Logger.info(`[ADMIN_DEBUG] Commande elo détectée: "${content}"`);
      await this.handleEloCommand(message);
      return true;
    }

    return false;
  }

  /**
   * Gère les commandes publiques (accessibles à tous)
   * @param {Message} message - Le message Discord
   * @returns {Promise<boolean>} - true si une commande publique a été traitée
   */
  async handlePublicCommand(message) {
    const content = message.content.toLowerCase().trim();

    // Commande pour afficher l'ELO d'un joueur
    if (content.startsWith("!elo")) {
      await this.showPlayerElo(message);
      return true;
    }

    return false;
  }

  /**
   * Met en pause ou active les réponses globales
   * @param {Message} message - Le message Discord
   */
  async toggleGlobalResponses(message) {
    this.globalResponsesPaused = !this.globalResponsesPaused;

    const status = this.globalResponsesPaused
      ? "⏸️ **PAUSÉES**"
      : "▶️ **ACTIVES**";
    const emoji = this.globalResponsesPaused ? "⏸️" : "▶️";

    const embed = new EmbedBuilder()
      .setColor(this.globalResponsesPaused ? 0xff6b6b : 0x51cf66)
      .setTitle(`${emoji} Réponses Globales`)
      .setDescription(`Les réponses globales sont maintenant ${status}`)
      .setTimestamp();

    await message.reply({ embeds: [embed] });

    Logger.info(
      `[ADMIN] Réponses globales ${
        this.globalResponsesPaused ? "pausées" : "activées"
      } par ${message.author.tag}`
    );
  }

  /**
   * Vérifie si les réponses globales sont pausées
   * @returns {boolean}
   */
  isGlobalResponsesPaused() {
    return this.globalResponsesPaused;
  }

  /**
   * Gère les commandes ELO (ajouter/enlever)
   * @param {Message} message - Le message Discord
   */
  async handleEloCommand(message) {
    // Parser la commande de manière plus robuste
    const content = message.content;
    const user = message.mentions.users.first();

    if (!user) {
      await message.reply("❌ Veuillez mentionner un utilisateur valide.");
      return;
    }

    // Extraire l'action (add/remove/set)
    const actionMatch = content.match(/!admin elo (add|remove|set)/i);
    if (!actionMatch) {
      const embed = new EmbedBuilder()
        .setColor(0xff6b6b)
        .setTitle("❌ Syntaxe Incorrecte")
        .setDescription(
          "**Utilisation:**\n" +
            "`!admin elo add @utilisateur <points>` - Ajouter des points ELO\n" +
            "`!admin elo remove @utilisateur <points>` - Enlever des points ELO\n" +
            "`!admin elo set @utilisateur <points>` - Définir l'ELO exact"
        )
        .addFields({
          name: "Exemples",
          value:
            "`!admin elo add @Nickel 50`\n`!admin elo remove @Nickel 25`\n`!admin elo set @Nickel 1200`",
        });

      await message.reply({ embeds: [embed] });
      return;
    }

    const action = actionMatch[1].toLowerCase();

    // Extraire les points (dernier nombre dans la commande)
    const pointsMatch = content.match(/(\d+)\s*$/);
    if (!pointsMatch) {
      await message.reply("❌ Veuillez entrer un nombre de points valide.");
      return;
    }

    const points = parseInt(pointsMatch[1]);

    if (isNaN(points) || points < 0) {
      await message.reply(
        "❌ Veuillez entrer un nombre de points valide (positif)."
      );
      return;
    }

    try {
      let playerStats = await PlayerStats.findOne({ userId: user.id });

      if (!playerStats) {
        // Créer les stats si elles n'existent pas
        playerStats = await PlayerStats.create({
          userId: user.id,
          username: user.username,
          elo: 1000,
          gamesPlayed: 0,
        });
      }

      const oldElo = playerStats.elo;
      let newElo;

      switch (action) {
        case "add":
          newElo = oldElo + points;
          break;
        case "remove":
          newElo = Math.max(0, oldElo - points);
          break;
        case "set":
          newElo = points;
          break;
        default:
          await message.reply(
            "❌ Action invalide. Utilisez `add`, `remove` ou `set`."
          );
          return;
      }

      // Ajouter à l'historique ELO
      playerStats.eloHistory.push({
        elo: newElo,
        change: newElo - oldElo,
        matchId: `admin_${Date.now()}`,
        date: new Date(),
      });

      playerStats.elo = newElo;
      playerStats.lastUpdated = new Date();
      await playerStats.save();

      const changeText =
        newElo - oldElo > 0 ? `+${newElo - oldElo}` : `${newElo - oldElo}`;
      const actionText =
        action === "add" ? "ajouté" : action === "remove" ? "retiré" : "défini";

      const embed = new EmbedBuilder()
        .setColor(0x51cf66)
        .setTitle("✅ ELO Modifié")
        .setDescription(`ELO ${actionText} pour **${user.username}**`)
        .addFields(
          { name: "Ancien ELO", value: `${oldElo}`, inline: true },
          { name: "Nouveau ELO", value: `${newElo}`, inline: true },
          { name: "Changement", value: `${changeText}`, inline: true }
        )
        .setFooter({ text: `Modifié par ${message.author.username}` })
        .setTimestamp();

      await message.reply({ embeds: [embed] });

      Logger.info(
        `[ADMIN] ELO ${actionText} pour ${user.username} (${user.id}): ${oldElo} → ${newElo} (${changeText}) par ${message.author.tag}`
      );
    } catch (error) {
      Logger.error(
        `[ADMIN] Erreur lors de la modification ELO: ${error.message}`
      );
      await message.reply(
        "❌ Une erreur est survenue lors de la modification de l'ELO."
      );
    }
  }

  /**
   * Remet l'ELO de tous les joueurs à 1000 et leurs matchs à 0
   * @param {Message} message - Le message Discord
   */
  async resetAllElo(message) {
    // Vérification supplémentaire pour cette commande critique
    if (!this.hasAdminPermission(message.member)) {
      await message.reply(
        "❌ Seuls les administrateurs peuvent utiliser cette commande critique."
      );
      return;
    }

    try {
      // Confirmation avec embed
      const confirmEmbed = new EmbedBuilder()
        .setColor(0xff6b6b)
        .setTitle("⚠️ CONFIRMATION REQUISE")
        .setDescription(
          "**ATTENTION:** Cette action va:\n" +
            "• Remettre l'ELO de **TOUS** les joueurs à 1000\n" +
            "• Remettre les matchs joués de **TOUS** les joueurs à 0\n" +
            "• **SUPPRIMER** tous les matchs de l'historique\n\n" +
            "**Cette action est IRRÉVERSIBLE !**\n\n" +
            "Tapez `!admin eloreset confirm` pour confirmer."
        )
        .setFooter({ text: "Commande critique - Admin uniquement" });

      await message.reply({ embeds: [confirmEmbed] });
    } catch (error) {
      Logger.error(
        `[ADMIN] Erreur lors de la demande de confirmation: ${error.message}`
      );
      await message.reply("❌ Une erreur est survenue.");
    }
  }

  /**
   * Confirme et exécute le reset ELO
   * @param {Message} message - Le message Discord
   */
  async confirmEloReset(message) {
    if (!this.hasAdminPermission(message.member)) {
      await message.reply(
        "❌ Seuls les administrateurs peuvent utiliser cette commande critique."
      );
      return;
    }

    try {
      const loadingEmbed = new EmbedBuilder()
        .setColor(0xffa500)
        .setTitle("🔄 Reset ELO en cours...")
        .setDescription(
          "Veuillez patienter, cette opération peut prendre quelques secondes."
        );

      const loadingMessage = await message.reply({ embeds: [loadingEmbed] });

      // Compter les joueurs avant reset
      const playerCount = await PlayerStats.countDocuments();
      const matchCount = await Match.countDocuments();

      // Supprimer toutes les stats et matchs (clean reset)
      await PlayerStats.deleteMany({});
      await Match.deleteMany({});

      const successEmbed = new EmbedBuilder()
        .setColor(0x51cf66)
        .setTitle("✅ Reset ELO Terminé")
        .setDescription("Le reset ELO a été effectué avec succès !")
        .addFields(
          {
            name: "Joueurs réinitialisés",
            value: `${playerCount}`,
            inline: true,
          },
          { name: "Matchs supprimés", value: `${matchCount}`, inline: true },
          { name: "Nouvel ELO", value: "1000 pour tous", inline: true }
        )
        .setFooter({ text: `Reset effectué par ${message.author.username}` })
        .setTimestamp();

      await loadingMessage.edit({ embeds: [successEmbed] });

      Logger.info(
        `[ADMIN] Reset ELO complet effectué par ${message.author.tag} - ${playerCount} joueurs, ${matchCount} matchs supprimés`
      );
    } catch (error) {
      Logger.error(`[ADMIN] Erreur lors du reset ELO: ${error.message}`);
      await message.reply("❌ Une erreur est survenue lors du reset ELO.");
    }
  }

  /**
   * Affiche l'ELO et les stats d'un joueur (commande publique)
   * @param {Message} message - Le message Discord
   */
  async showPlayerElo(message) {
    const content = message.content;
    const user = message.mentions.users.first();

    if (!user) {
      const embed = new EmbedBuilder()
        .setColor(0xff6b6b)
        .setTitle("❌ Utilisateur Non Spécifié")
        .setDescription(
          "**Utilisation:**\n" +
            "`!elo @utilisateur` - Afficher l'ELO et les stats d'un joueur\n\n" +
            "**Exemple:**\n" +
            "`!elo @Nickel`"
        );

      await message.reply({ embeds: [embed] });
      return;
    }

    try {
      const playerStats = await PlayerStats.findOne({ userId: user.id });

      if (!playerStats) {
        const embed = new EmbedBuilder()
          .setColor(0xffa500)
          .setTitle("📊 Stats du Joueur")
          .setDescription(
            `**${user.username}** n'a pas encore joué de parties.`
          )
          .addFields({
            name: "ELO",
            value: "1000 (défaut)",
            inline: true,
          })
          .addFields({
            name: "Parties Jouées",
            value: "0",
            inline: true,
          })
          .addFields({
            name: "Winrate",
            value: "N/A",
            inline: true,
          })
          .setThumbnail(user.displayAvatarURL())
          .setTimestamp();

        await message.reply({ embeds: [embed] });
        return;
      }

      // Calculer le winrate
      const winrate =
        playerStats.totalGames > 0
          ? ((playerStats.wins / playerStats.totalGames) * 100).toFixed(1)
          : "0.0";

      // Déterminer la couleur selon l'ELO
      let color = 0x808080; // Gris par défaut
      if (playerStats.elo >= 1500) color = 0xffd700; // Or
      else if (playerStats.elo >= 1300) color = 0xc0c0c0; // Argent
      else if (playerStats.elo >= 1100) color = 0xcd7f32; // Bronze
      else if (playerStats.elo < 900) color = 0xff6b6b; // Rouge (ELO bas)

      // Déterminer le rang selon l'ELO
      let rank = "🥉 Bronze";
      if (playerStats.elo >= 1500) rank = "🥇 Or";
      else if (playerStats.elo >= 1300) rank = "🥈 Argent";
      else if (playerStats.elo >= 1100) rank = "🥉 Bronze";
      else if (playerStats.elo < 900) rank = "🔻 ELO Bas";

      const embed = new EmbedBuilder()
        .setColor(color)
        .setTitle(`📊 Stats de ${user.username}`)
        .setDescription(`**${rank}**`)
        .addFields(
          { name: "ELO", value: `${playerStats.elo}`, inline: true },
          {
            name: "Parties Jouées",
            value: `${playerStats.totalGames}`,
            inline: true,
          },
          { name: "Winrate", value: `${winrate}%`, inline: true },
          { name: "Victoires", value: `${playerStats.wins}`, inline: true },
          { name: "Défaites", value: `${playerStats.losses}`, inline: true },
          {
            name: "Dernière Mise à Jour",
            value: `<t:${Math.floor(
              playerStats.lastUpdated.getTime() / 1000
            )}:R>`,
            inline: true,
          }
        )
        .setThumbnail(user.displayAvatarURL())
        .setFooter({ text: `Demandé par ${message.author.username}` })
        .setTimestamp();

      // Ajouter des infos supplémentaires si disponibles
      if (
        playerStats.avgOpponentCostWhenWin > 0 ||
        playerStats.avgOpponentCostWhenLose > 0
      ) {
        embed.addFields({
          name: "📈 Stats Avancées",
          value: `Coût moyen adversaires (victoires): ${playerStats.avgOpponentCostWhenWin.toFixed(
            1
          )}\nCoût moyen adversaires (défaites): ${playerStats.avgOpponentCostWhenLose.toFixed(
            1
          )}`,
          inline: false,
        });
      }

      await message.reply({ embeds: [embed] });

      Logger.info(
        `[PUBLIC] Stats ELO affichées pour ${user.username} (${user.id}) par ${message.author.tag}`
      );
    } catch (error) {
      Logger.error(
        `[PUBLIC] Erreur lors de l'affichage des stats: ${error.message}`
      );
      await message.reply(
        "❌ Une erreur est survenue lors de la récupération des stats."
      );
    }
  }
}
