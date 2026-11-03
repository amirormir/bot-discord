// Client de l'API du site pour le bot (/api/bot/v1). Le bot n'a pas accès à la base : il lit
// ce que le site veut bien lui donner, avec son secret, et télécharge les visuels des cartes.

export class TcgardenError extends Error {
  constructor(message, { status = 0, cause } = {}) {
    super(message, { cause });
    this.name = "TcgardenError";
    this.status = status;
  }
}

/** Petit cache mémoire, du plus ancien au plus récent, plafonné en octets. */
class ByteCache {
  constructor(limit) {
    this.limit = limit;
    this.size = 0;
    this.items = new Map();
  }
  get(key) {
    const value = this.items.get(key);
    if (!value) return undefined;
    this.items.delete(key);
    this.items.set(key, value);
    return value;
  }
  set(key, value) {
    if (this.items.has(key)) this.size -= this.items.get(key).length;
    this.items.set(key, value);
    this.size += value.length;
    for (const [oldest, bytes] of this.items) {
      if (this.size <= this.limit) break;
      this.items.delete(oldest);
      this.size -= bytes.length;
    }
  }
}

const IMAGE_MAX = 6 * 1024 * 1024;

export class TcgardenApi {
  constructor({ url, secret, fetch: fetchImpl = globalThis.fetch, timeout = 10_000 }) {
    this.url = url;
    this.origin = new URL(url).origin;
    this.secret = secret;
    this.fetch = fetchImpl;
    this.timeout = timeout;
    // Les adresses des visuels portent leur empreinte : une adresse ne change jamais d'image.
    this.images = new ByteCache(80 * 1024 * 1024);
  }

  async json(path) {
    let response;
    try {
      response = await this.fetch(`${this.url}/api/bot/v1${path}`, {
        headers: { Authorization: `Bearer ${this.secret}`, Accept: "application/json" },
        signal: AbortSignal.timeout(this.timeout),
      });
    } catch (cause) {
      throw new TcgardenError("Le site ne répond pas", { cause });
    }
    if (response.status === 404) return null;
    if (!response.ok) throw new TcgardenError(`Réponse ${response.status} du site`, { status: response.status });
    return response.json();
  }

  /** Profil, vitrine, meilleures cartes ; `null` si ce membre n'a pas de compte. */
  player(discordId) {
    return this.json(`/players/${encodeURIComponent(discordId)}`);
  }

  /** Le dernier sachet révélé ; `null` si ce membre n'a pas de compte. */
  lastOpening(discordId) {
    return this.json(`/players/${encodeURIComponent(discordId)}/last-opening`);
  }

  /** Une carte, par son nom ou par le membre qu'elle représente. */
  card({ q, member }) {
    const params = new URLSearchParams(member ? { membre: member } : { q });
    return this.json(`/cards?${params}`);
  }

  /**
   * Télécharge des images : { adresse: octets }. Une image qui manque n'empêche rien (la carte
   * s'affiche sans). Le secret ne part que vers le site lui-même, jamais vers Cloudinary.
   */
  async download(urls) {
    const out = {};
    const wanted = [...new Set(urls.filter((u) => typeof u === "string" && /^https?:\/\//.test(u)))];
    await Promise.all(
      wanted.map(async (url) => {
        const cached = this.images.get(url);
        if (cached) {
          out[url] = cached;
          return;
        }
        try {
          const own = new URL(url).origin === this.origin;
          const response = await this.fetch(url, {
            headers: {
              Accept: "image/webp,image/png,image/jpeg,image/svg+xml",
              ...(own && url.includes("/api/bot/") ? { Authorization: `Bearer ${this.secret}` } : {}),
            },
            signal: AbortSignal.timeout(this.timeout),
          });
          if (!response.ok) return;
          const length = Number(response.headers.get("content-length") || 0);
          if (length > IMAGE_MAX) return;
          const bytes = Buffer.from(await response.arrayBuffer());
          if (bytes.length > IMAGE_MAX) return;
          this.images.set(url, bytes);
          out[url] = bytes;
        } catch {
          // Visuel injoignable : la carte garde une fenêtre sombre.
        }
      }),
    );
    return out;
  }
}

/** Les adresses d'images d'une réponse de l'API (visuels, signatures, avatar). */
export function imageUrls(value, out = []) {
  if (Array.isArray(value)) value.forEach((v) => imageUrls(v, out));
  else if (value && typeof value === "object")
    for (const [key, v] of Object.entries(value)) {
      if ((key === "src" || key === "avatarUrl") && typeof v === "string") out.push(v);
      else imageUrls(v, out);
    }
  return out;
}
