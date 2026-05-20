import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import { TicketPanelConfig } from "../models/TicketPanelConfig.js";
import { PlayerCostTicket } from "../models/PlayerCostTicket.js";
import { Logger } from "../utils/logger.js";

const OPEN_TICKET_BUTTON_ID = "player_cost_ticket_open";
const TICKET_MODAL_ID = "player_cost_ticket_modal";

function isValidUrl(value) {
  return /^https?:\/\/\S+$/i.test(value);
}

function hasAdminPermission(member) {
  return member?.permissions?.has("Administrator") ?? false;
}

export class TicketRequestHandler {
  buildPanelPayload() {
    const embed = new EmbedBuilder()
      .setTitle("Demandes de cost joueur")
      .setDescription(
        [
          "Clique sur le bouton ci-dessous pour envoyer une demande au comite.",
          "",
          "Formulaire demande :",
          "- Lien DPM du joueur",
          "- Cost souhaite (1 a 5)",
          "- Roles ou il jouera",
          "- Message optionnel",
        ].join("\n")
      )
      .setColor("#5865F2")
      .setFooter({
        text: "Le comite recevra ta demande et pourra te repondre directement.",
      })
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(OPEN_TICKET_BUTTON_ID)
        .setLabel("Envoyer une demande")
        .setStyle(ButtonStyle.Primary)
    );

    return { embeds: [embed], components: [row] };
  }

  buildCommitteeEmbed(interaction, payload, ticketId) {
    return new EmbedBuilder()
      .setTitle("Nouvelle demande de cost")
      .setDescription("Reponds a ce message pour contacter directement le demandeur.")
      .setColor("#F1C40F")
      .addFields(
        {
          name: "Demandeur",
          value: `<@${interaction.user.id}> (${interaction.user.tag})`,
          inline: false,
        },
        {
          name: "Lien DPM du joueur",
          value: payload.dpmLink,
          inline: false,
        },
        {
          name: "Cost souhaite",
          value: `${payload.desiredCost}/5`,
          inline: true,
        },
        {
          name: "Roles ou il jouera",
          value: payload.roles,
          inline: true,
        },
        {
          name: "Message optionnel",
          value: payload.optionalMessage || "Aucun message.",
          inline: false,
        }
      )
      .setFooter({
        text: `Ticket ${ticketId} • Reponse par reply sur ce message`,
      })
      .setTimestamp();
  }

  buildDmEmbed(guildName, ticket, responseText, responderTag) {
    return new EmbedBuilder()
      .setTitle("Reponse du comite")
      .setDescription(`Ta demande de cost sur **${guildName}** a recu une reponse.`)
      .setColor("#2ECC71")
      .addFields(
        {
          name: "Lien DPM du joueur",
          value: ticket.dpmLink,
          inline: false,
        },
        {
          name: "Cost souhaite",
          value: `${ticket.desiredCost}/5`,
          inline: true,
        },
        {
          name: "Roles ou il jouera",
          value: ticket.roles,
          inline: true,
        },
        {
          name: "Reponse du comite",
          value: responseText,
          inline: false,
        }
      )
      .setFooter({
        text: `Repondu par ${responderTag}`,
      })
      .setTimestamp();
  }

  async handleSetup(interaction) {
    try {
      if (!hasAdminPermission(interaction.member)) {
        await interaction.reply({
          content:
            "Vous devez avoir la permission Administrateur pour configurer les tickets.",
          ephemeral: true,
        });
        return;
      }

      const requestChannel = interaction.options.getChannel("request_channel", true);
      const committeeChannel = interaction.options.getChannel(
        "committee_channel",
        true
      );
      const committeeRole = interaction.options.getRole("committee_role", true);

      if (requestChannel.type !== ChannelType.GuildText) {
        await interaction.reply({
          content: "Le salon des demandes doit etre un salon texte classique.",
          ephemeral: true,
        });
        return;
      }

      if (committeeChannel.type !== ChannelType.GuildText) {
        await interaction.reply({
          content: "Le salon comite doit etre un salon texte classique.",
          ephemeral: true,
        });
        return;
      }

      const panelMessage = await requestChannel.send(this.buildPanelPayload());

      await TicketPanelConfig.findOneAndUpdate(
        { guildId: interaction.guildId },
        {
          guildId: interaction.guildId,
          requestChannelId: requestChannel.id,
          committeeChannelId: committeeChannel.id,
          committeeRoleId: committeeRole.id,
          panelMessageId: panelMessage.id,
          createdBy: interaction.user.id,
          updatedBy: interaction.user.id,
        },
        {
          upsert: true,
          new: true,
          setDefaultsOnInsert: true,
        }
      );

      await interaction.reply({
        content: `Configuration enregistree. Le panneau a ete poste dans <#${requestChannel.id}> et les demandes partiront vers <#${committeeChannel.id}> avec mention <@&${committeeRole.id}>.`,
        allowedMentions: { roles: [committeeRole.id] },
        ephemeral: true,
      });

      Logger.info(
        `[TICKET] Setup configure par ${interaction.user.tag} sur ${interaction.guild?.name}`
      );
    } catch (error) {
      Logger.error(`[TICKET] Erreur setup: ${error.message}`);
      if (interaction.deferred || interaction.replied) {
        await interaction.followUp({
          content: `Erreur lors de la configuration: ${error.message}`,
          ephemeral: true,
        });
        return;
      }
      await interaction.reply({
        content: `Erreur lors de la configuration: ${error.message}`,
        ephemeral: true,
      });
    }
  }

  async handleOpenModal(interaction) {
    const config = await TicketPanelConfig.findOne({ guildId: interaction.guildId });
    if (!config) {
      await interaction.reply({
        content: "Aucune configuration ticket n'a ete trouvee pour ce serveur.",
        ephemeral: true,
      });
      return;
    }

    if (interaction.channelId !== config.requestChannelId) {
      await interaction.reply({
        content: "Ce bouton doit etre utilise dans le salon configure pour les demandes.",
        ephemeral: true,
      });
      return;
    }

    const modal = new ModalBuilder()
      .setCustomId(TICKET_MODAL_ID)
      .setTitle("Demande de cost");

    const dpmLinkInput = new TextInputBuilder()
      .setCustomId("dpm_link")
      .setLabel("Lien DPM du joueur")
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setPlaceholder("https://...")
      .setMaxLength(500);

    const desiredCostInput = new TextInputBuilder()
      .setCustomId("desired_cost")
      .setLabel("Cost souhaite (1 a 5)")
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setPlaceholder("3")
      .setMaxLength(1);

    const rolesInput = new TextInputBuilder()
      .setCustomId("roles")
      .setLabel("Roles ou il jouera")
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setPlaceholder("TOP, MID")
      .setMaxLength(100);

    const optionalMessageInput = new TextInputBuilder()
      .setCustomId("optional_message")
      .setLabel("Message optionnel")
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(false)
      .setPlaceholder("Contexte complementaire si besoin")
      .setMaxLength(1000);

    modal.addComponents(
      new ActionRowBuilder().addComponents(dpmLinkInput),
      new ActionRowBuilder().addComponents(desiredCostInput),
      new ActionRowBuilder().addComponents(rolesInput),
      new ActionRowBuilder().addComponents(optionalMessageInput)
    );

    await interaction.showModal(modal);
  }

  async handleModalSubmit(interaction) {
    try {
      const config = await TicketPanelConfig.findOne({ guildId: interaction.guildId });
      if (!config) {
        await interaction.reply({
          content: "Aucune configuration ticket n'a ete trouvee pour ce serveur.",
          ephemeral: true,
        });
        return;
      }

      const dpmLink = interaction.fields.getTextInputValue("dpm_link").trim();
      const desiredCostRaw = interaction.fields
        .getTextInputValue("desired_cost")
        .trim();
      const roles = interaction.fields.getTextInputValue("roles").trim();
      const optionalMessage = interaction.fields
        .getTextInputValue("optional_message")
        .trim();

      if (!isValidUrl(dpmLink)) {
        await interaction.reply({
          content: "Le lien DPM doit etre une URL valide commencant par http:// ou https://",
          ephemeral: true,
        });
        return;
      }

      const desiredCost = Number.parseInt(desiredCostRaw, 10);
      if (!Number.isInteger(desiredCost) || desiredCost < 1 || desiredCost > 5) {
        await interaction.reply({
          content: "Le cost souhaite doit etre un nombre entier entre 1 et 5.",
          ephemeral: true,
        });
        return;
      }

      const committeeChannel = await interaction.guild.channels.fetch(
        config.committeeChannelId
      );

      if (!committeeChannel || committeeChannel.type !== ChannelType.GuildText) {
        await interaction.reply({
          content:
            "Le salon comite configure est introuvable ou n'est plus un salon texte.",
          ephemeral: true,
        });
        return;
      }

      const draftTicket = {
        guildId: interaction.guildId,
        userId: interaction.user.id,
        requestChannelId: config.requestChannelId,
        committeeChannelId: config.committeeChannelId,
        committeeRoleId: config.committeeRoleId,
        dpmLink,
        desiredCost,
        roles,
        optionalMessage,
      };

      const ticketPreview = new PlayerCostTicket({
        ...draftTicket,
        committeeMessageId: `pending-${Date.now()}`,
      });
      const embed = this.buildCommitteeEmbed(
        interaction,
        draftTicket,
        ticketPreview._id.toString()
      );

      const committeeMessage = await committeeChannel.send({
        content: `<@&${config.committeeRoleId}> Nouvelle demande de cost.`,
        embeds: [embed],
        allowedMentions: { roles: [config.committeeRoleId] },
      });

      await PlayerCostTicket.create({
        ...draftTicket,
        committeeMessageId: committeeMessage.id,
      });

      await interaction.reply({
        content:
          "Ta demande a bien ete envoyee au comite. Tu recevras leur reponse en message prive.",
        ephemeral: true,
      });

      Logger.info(
        `[TICKET] Demande creee par ${interaction.user.tag} sur ${interaction.guild?.name}`
      );
    } catch (error) {
      Logger.error(`[TICKET] Erreur soumission modal: ${error.message}`);
      if (interaction.deferred || interaction.replied) {
        await interaction.followUp({
          content: `Erreur lors de l'envoi de la demande: ${error.message}`,
          ephemeral: true,
        });
        return;
      }
      await interaction.reply({
        content: `Erreur lors de l'envoi de la demande: ${error.message}`,
        ephemeral: true,
      });
    }
  }

  async handleCommitteeReply(message) {
    try {
      if (message.author.bot || !message.guildId || !message.reference?.messageId) {
        return false;
      }

      const config = await TicketPanelConfig.findOne({ guildId: message.guildId });
      if (!config || message.channelId !== config.committeeChannelId) {
        return false;
      }

      const ticket = await PlayerCostTicket.findOne({
        guildId: message.guildId,
        committeeMessageId: message.reference.messageId,
      });
      if (!ticket) {
        return false;
      }

      const attachmentUrls = [...message.attachments.values()]
        .map((attachment) => attachment.url)
        .filter(Boolean);
      const responseParts = [message.content.trim(), ...attachmentUrls].filter(Boolean);
      const responseText = responseParts.join("\n");

      if (!responseText) {
        await message.reply(
          "Ta reponse est vide. Ajoute du texte ou une piece jointe pour contacter le demandeur."
        );
        return true;
      }

      const requester = await message.client.users.fetch(ticket.userId);
      const dmEmbed = this.buildDmEmbed(
        message.guild.name,
        ticket,
        responseText,
        message.author.tag
      );

      await requester.send({ embeds: [dmEmbed] });

      ticket.status = "ANSWERED";
      ticket.lastResponse = responseText;
      ticket.lastRespondedBy = message.author.id;
      ticket.lastRespondedAt = new Date();
      await ticket.save();

      await message.react("✅");
      Logger.info(
        `[TICKET] Reponse envoyee a ${requester.tag} par ${message.author.tag}`
      );
      return true;
    } catch (error) {
      Logger.error(`[TICKET] Erreur reponse comite: ${error.message}`);
      await message.reply(
        `Impossible d'envoyer la reponse au demandeur: ${error.message}`
      );
      return true;
    }
  }
}
