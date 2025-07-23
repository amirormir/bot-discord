import { Logger } from "./logger.js";

export class ImageDetector {
  static isImageUrl(url) {
    return /\.(jpg|jpeg|png|gif|webp)$/i.test(url);
  }

  static isGifPlatform(url) {
    return url.includes("tenor.com") || url.includes("giphy.com");
  }

  static hasImageInAttachments(attachments) {
    for (const [, attachment] of attachments) {
      const url = attachment.url;
      Logger.link(`Pièce jointe détectée : ${attachment.name} (${url})`);

      if (this.isImageUrl(url)) {
        Logger.image("Image/GIF détectée dans pièce jointe");
        return true;
      }
    }
    return false;
  }

  static hasImageInContent(content) {
    const urlRegex =
      /(https?:\/\/(?:[\w-]+\.)+[\w-]+(?:[\w\-\._~:/?#[\]@!$&'()*+,;=]+)?)/gi;
    const urls = content.match(urlRegex) || [];

    for (const url of urls) {
      if (this.isImageUrl(url) || this.isGifPlatform(url)) {
        Logger.link(`Lien image/GIF détecté dans le texte : ${url}`);
        return true;
      }
    }
    return false;
  }

  static detectImage(message) {
    // Vérifier les pièces jointes
    if (
      message.attachments.size &&
      this.hasImageInAttachments(message.attachments)
    ) {
      return true;
    }

    // Vérifier les liens dans le texte
    if (this.hasImageInContent(message.content)) {
      return true;
    }

    return false;
  }
}
