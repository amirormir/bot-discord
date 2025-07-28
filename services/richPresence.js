import { Client } from "discord-rpc";
import { Logger } from "../utils/logger.js";

export class RichPresenceService {
  constructor() {
    this.rpc = null;
    this.clientId = "YOUR_CLIENT_ID"; // Remplace par ton Client ID Discord
    this.isConnected = false;
  }

  async initialize() {
    try {
      this.rpc = new Client({ transport: "ipc" });

      this.rpc.on("ready", () => {
        Logger.info("[RICH_PRESENCE] Rich Presence connecté");
        this.isConnected = true;
        this.updatePresence();
      });

      this.rpc.on("disconnected", () => {
        Logger.info("[RICH_PRESENCE] Rich Presence déconnecté");
        this.isConnected = false;
      });

      await this.rpc.login({ clientId: this.clientId });
    } catch (error) {
      Logger.error(`[RICH_PRESENCE] Erreur initialisation: ${error.message}`);
    }
  }

  updatePresence() {
    if (!this.rpc || !this.isConnected) {
      Logger.warning("[RICH_PRESENCE] Rich Presence non connecté");
      return;
    }

    try {
      const presence = {
        state: "The Garden",
        details: "Inhouse",
        startTimestamp: 1507665886,
        endTimestamp: 1507665886,
        largeImageKey: "6c99abd903e05bfa6db276f99e83d731",
        largeImageText: "Numbami",
        smallImageKey: "rogue",
        smallImageText: "Rogue - Level 100",
        partyId: "ae488379-351d-4a4f-ad32-2b9b01c91657",
        partySize: 1,
        partyMax: 1,
        joinSecret: "MTI4NzM0OjFpMmhuZToxMjMxMjM=",
        instance: false,
      };

      this.rpc.setActivity(presence);
      Logger.info("[RICH_PRESENCE] Présence mise à jour");
    } catch (error) {
      Logger.error(
        `[RICH_PRESENCE] Erreur mise à jour présence: ${error.message}`
      );
    }
  }

  updateGameStatus(gameType = "Inhouse", playerCount = 0, maxPlayers = 10) {
    if (!this.rpc || !this.isConnected) {
      return;
    }

    try {
      const presence = {
        state: `Joueurs: ${playerCount}/${maxPlayers}`,
        details: gameType,
        startTimestamp: Date.now() / 1000,
        largeImageKey: "6c99abd903e05bfa6db276f99e83d731",
        largeImageText: "Numbami",
        smallImageKey: "rogue",
        smallImageText: "Rogue - Level 100",
        partyId: "ae488379-351d-4a4f-ad32-2b9b01c91657",
        partySize: playerCount,
        partyMax: maxPlayers,
        joinSecret: "MTI4NzM0OjFpMmhuZToxMjMxMjM=",
        instance: false,
      };

      this.rpc.setActivity(presence);
      Logger.info(
        `[RICH_PRESENCE] Statut de jeu mis à jour: ${gameType} (${playerCount}/${maxPlayers})`
      );
    } catch (error) {
      Logger.error(
        `[RICH_PRESENCE] Erreur mise à jour statut: ${error.message}`
      );
    }
  }

  clearPresence() {
    if (!this.rpc || !this.isConnected) {
      return;
    }

    try {
      this.rpc.clearActivity();
      Logger.info("[RICH_PRESENCE] Présence effacée");
    } catch (error) {
      Logger.error(
        `[RICH_PRESENCE] Erreur effacement présence: ${error.message}`
      );
    }
  }

  async destroy() {
    if (this.rpc) {
      try {
        await this.rpc.destroy();
        Logger.info("[RICH_PRESENCE] Rich Presence détruit");
      } catch (error) {
        Logger.error(`[RICH_PRESENCE] Erreur destruction: ${error.message}`);
      }
    }
  }
}
