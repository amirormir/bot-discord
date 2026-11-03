// Les commandes TCGarden de Loli : des GIF animés dans la direction artistique du site.
//   !vitrine [@membre]   la vitrine d'un jardinier
//   !best [@membre]      ses trois plus belles cartes, en podium
//   !profil [@membre]    sa carte de visite
//   !booster             son dernier sachet, rejoué (le sien seulement)
//   !carte <nom|@membre> la fiche d'une carte
//   !tcg                 l'aide
import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  escapeMarkdown,
} from "discord.js";

import { Logger } from "../utils/logger.js";
import { TcgardenApi, TcgardenError, imageUrls } from "./api.js";
import { TCGARDEN, tcgardenEnabled } from "./config.js";
import { RenderQueue } from "./render/pool.js";

const ALIASES = {
  vitrine: "vitrine",
  best: "best",
  top: "best",
  profil: "profil",
  booster: "booster",
  sachet: "booster",
  carte: "carte",
  tcg: "aide",
  tcgarden: "aide",
};

/** Découpe « !vitrine @Amir » en { command: "vitrine", rest: "@Amir" } ; `null` sinon. */
export function parseCommand(content) {
  const match = /^!([a-zà-ÿ]+)(?:\s+([\s\S]*))?$/i.exec(content.trim());
  if (!match) return null;
  const command = ALIASES[match[1].toLowerCase()];
  return command ? { command, rest: (match[2] ?? "").trim() } : null;
}

const mint = 0x3ee6a8;

function linkRow(url, label) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setStyle(ButtonStyle.Link).setURL(url).setLabel(label),
  );
}

export class TcgardenHandler {
  constructor({ api, queue } = {}) {
    this.api = api ?? new TcgardenApi({ url: TCGARDEN.url, secret: TCGARDEN.secret });
    this.queue = queue ?? new RenderQueue();
    this.lastUse = new Map();
    if (!tcgardenEnabled())
      Logger.warning("[TCGARDEN] TCGARDEN_BOT_SECRET absent : les commandes TCGarden sont coupées.");
  }

  /** Traite le message s'il s'agit d'une commande TCGarden ; renvoie vrai dans ce cas. */
  async handleMessage(message) {
    const parsed = parseCommand(message.content ?? "");
    if (!parsed) return false;
    if (!tcgardenEnabled()) return false;
    if (TCGARDEN.channels.length && !TCGARDEN.channels.includes(message.channelId)) {
      await this.reply(message, {
        content: `Les commandes TCGarden répondent dans ${TCGARDEN.channels.map((id) => `<#${id}>`).join(", ")}.`,
      });
      return true;
    }
    if (parsed.command === "aide") {
      await this.reply(message, { embeds: [this.help()] });
      return true;
    }
    const wait = this.cooldownLeft(message.author.id);
    if (wait > 0) {
      await message.react("⏳").catch(() => {});
      return true;
    }
    this.lastUse.set(message.author.id, Date.now());

    const typing = setInterval(() => message.channel.sendTyping().catch(() => {}), 8000);
    await message.channel.sendTyping().catch(() => {});
    const started = Date.now();
    try {
      await this[parsed.command](message, parsed.rest);
      Logger.info(`[TCGARDEN] !${parsed.command} par ${message.author.tag} en ${Date.now() - started} ms`);
    } catch (error) {
      Logger.error(`[TCGARDEN] !${parsed.command} : ${error.message}`);
      const busy = error.message === "FILE_PLEINE";
      await this.reply(message, {
        content: busy
          ? "Le jardin fait éclore beaucoup de cartes en ce moment : réessaie dans quelques secondes."
          : error instanceof TcgardenError
            ? "Le jardin ne répond pas pour l'instant. Réessaie dans un moment."
            : "Cette animation n'a pas voulu éclore. Réessaie dans un moment.",
      });
      this.lastUse.delete(message.author.id);
    } finally {
      clearInterval(typing);
    }
    return true;
  }

  cooldownLeft(userId) {
    const last = this.lastUse.get(userId);
    if (!last) return 0;
    return Math.max(0, TCGARDEN.cooldown * 1000 - (Date.now() - last));
  }

  /** Le membre visé : la première mention (pas un bot), sinon l'auteur du message. */
  target(message) {
    const mentioned = message.mentions.users.find((user) => !user.bot);
    return mentioned ?? message.author;
  }

  async reply(message, payload) {
    return message.reply({ allowedMentions: { repliedUser: false, parse: [] }, ...payload }).catch((error) => {
      Logger.error(`[TCGARDEN] Réponse impossible : ${error.message}`);
    });
  }

  /** Un compte du jardin, ou une réponse qui explique qu'il n'y en a pas. */
  async account(message, user) {
    const data = await this.api.player(user.id);
    if (data) return data;
    await this.reply(message, {
      content:
        user.id === message.author.id
          ? "Tu n'as pas encore de jardin : connecte-toi au site avec Discord, cinq boosters t'y attendent."
          : `**${escapeMarkdown(user.displayName ?? user.username)}** n'a pas encore de jardin sur TCGarden.`,
      components: [linkRow(TCGARDEN.url, "Ouvrir TCGarden")],
    });
    return null;
  }

  /** Rend la scène et l'envoie. */
  async send(message, { scene, data, name, content, url, label }) {
    const buffers = await this.api.download(imageUrls(data));
    const { gif, stats } = await this.queue.render(scene, data, buffers);
    Logger.info(`[TCGARDEN] ${scene} : ${(stats.bytes / 1024 / 1024).toFixed(2)} Mo, ${stats.frames} images, ${stats.ms} ms`);
    if (gif.length > TCGARDEN.maxBytes) {
      await this.reply(message, { content, components: [linkRow(url, label)] });
      return;
    }
    await this.reply(message, {
      content,
      files: [new AttachmentBuilder(gif, { name: `${name}.gif`, description: content.replace(/\*/g, "") })],
      components: [linkRow(url, label)],
    });
  }

  async vitrine(message) {
    const user = this.target(message);
    const data = await this.account(message, user);
    if (!data) return;
    const name = escapeMarkdown(data.player.name);
    if (!data.showcase.length) {
      await this.reply(message, {
        content:
          user.id === message.author.id
            ? "Ta vitrine est vide : choisis jusqu'à six cartes à exposer depuis ta collection."
            : `La vitrine de **${name}** est encore vide.`,
        components: [linkRow(data.player.url, "Voir le profil")],
      });
      return;
    }
    await this.send(message, {
      scene: "vitrine",
      data: { player: data.player, showcase: data.showcase },
      name: "vitrine",
      content: `La vitrine de **${name}**`,
      url: data.player.url,
      label: "Voir le profil",
    });
  }

  async best(message) {
    const user = this.target(message);
    const data = await this.account(message, user);
    if (!data) return;
    const name = escapeMarkdown(data.player.name);
    if (!data.best.length) {
      await this.reply(message, {
        content: `Pas encore de carte dans le jardin de **${name}** : le premier sachet attend.`,
        components: [linkRow(data.player.url, "Voir le profil")],
      });
      return;
    }
    await this.send(message, {
      scene: "best",
      data: { player: data.player, best: data.best },
      name: "meilleures-cartes",
      content: `Les plus belles cartes de **${name}**`,
      url: data.player.url,
      label: "Voir le profil",
    });
  }

  async profil(message) {
    const user = this.target(message);
    const data = await this.account(message, user);
    if (!data) return;
    // L'avatar Discord du moment, plutôt que celui gardé par le site.
    const avatar = user.displayAvatarURL({ extension: "png", size: 256, forceStatic: true });
    await this.send(message, {
      scene: "profil",
      data: { player: { ...data.player, avatarUrl: avatar ?? data.player.avatarUrl }, featured: data.featured, best: data.best },
      name: "profil",
      content: `Le jardin de **${escapeMarkdown(data.player.name)}**`,
      url: data.player.url,
      label: "Voir le profil",
    });
  }

  async booster(message) {
    const other = message.mentions.users.find((user) => !user.bot && user.id !== message.author.id);
    if (other) {
      await this.reply(message, {
        content: "Le dernier sachet de chacun lui appartient : c'est à lui de taper `!booster`.",
      });
      return;
    }
    const data = await this.api.lastOpening(message.author.id);
    if (!data) {
      await this.account(message, message.author);
      return;
    }
    if (!data.opening) {
      await this.reply(message, {
        content: "Aucun sachet ouvert pour l'instant : le premier t'attend sur le site.",
        components: [linkRow(`${TCGARDEN.url}/boosters`, "Ouvrir un booster")],
      });
      return;
    }
    await this.send(message, {
      scene: "booster",
      data: { player: data.player, opening: data.opening },
      name: "dernier-sachet",
      content: `Le dernier sachet de **${escapeMarkdown(data.player.name)}**`,
      url: `${TCGARDEN.url}/boosters`,
      label: "Ouvrir un booster",
    });
  }

  async carte(message, rest) {
    const member = message.mentions.users.find((user) => !user.bot);
    const query = rest.replace(/<@!?\d+>/g, "").trim();
    if (!member && !query) {
      await this.reply(message, { content: "Quelle carte ? `!carte <nom>`, ou `!carte @membre` pour la carte d'un membre." });
      return;
    }
    const result = await this.api.card(member ? { member: member.id } : { q: query });
    if (!result?.card) {
      const others = (result?.suggestions ?? []).map((s) => `**${escapeMarkdown(s.name)}** (${s.rarityLabel})`);
      await this.reply(message, {
        content: member
          ? `**${escapeMarkdown(member.displayName ?? member.username)}** n'a pas encore sa carte dans le jardin.`
          : `Aucune carte ne s'appelle « ${escapeMarkdown(query.slice(0, 64))} ».${others.length ? ` Peut-être : ${others.join(", ")} ?` : ""}`,
      });
      return;
    }
    const { card } = result.card;
    const others = result.suggestions.map((s) => escapeMarkdown(s.name));
    await this.send(message, {
      scene: "carte",
      data: { entry: result.card },
      name: "carte",
      content: `**${escapeMarkdown(card.name)}**, ${card.rarityLabel.toLowerCase()}${others.length ? `\n-# Autres cartes proches : ${others.join(", ")}` : ""}`,
      url: card.url,
      label: "Voir la fiche",
    });
  }

  help() {
    return new EmbedBuilder()
      .setColor(mint)
      .setTitle("🌱 TCGarden sur Discord")
      .setDescription(
        [
          "Le jeu de cartes du serveur, en animations. Les données viennent du site, à jour à chaque commande.",
          "",
          "`!vitrine [@membre]` La vitrine d'un jardinier.",
          "`!best [@membre]` Ses trois plus belles cartes, en podium.",
          "`!profil [@membre]` Sa carte de visite : rang, collection, carte de cœur.",
          "`!booster` Ton dernier sachet, rejoué.",
          "`!carte <nom>` La fiche d'une carte ; `!carte @membre` pour la sienne.",
          "",
          "Les Secrètes restent voilées : le jardin les annonce sans jamais les montrer.",
        ].join("\n"),
      )
      .setURL(TCGARDEN.url)
      .setFooter({ text: `Une commande toutes les ${TCGARDEN.cooldown} secondes par membre` });
  }

  async stop() {
    await this.queue.close();
  }
}
