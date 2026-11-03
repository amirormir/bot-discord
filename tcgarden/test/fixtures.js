// Données fictives au format de l'API du site (/api/bot/v1), sans image ni réseau.

let n = 0;

export function card(rarity, name = `Carte ${++n}`, extra = {}) {
  if (rarity === "secrete")
    return { veiled: true, rarity, rarityLabel: "Secrète", label: "5 ex.", printRun: 5 };
  const labels = { commune: "Commune", "peu-commune": "Peu commune", rare: "Rare", epique: "Épique", legendaire: "Légendaire", mythique: "Mythique", variante: "Variante" };
  return {
    veiled: false,
    id: name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    name,
    title: "Gardien des essais",
    quote: "Chaque rencontre est une graine.",
    rarity,
    rarityLabel: labels[rarity],
    label: rarity === "variante" ? "1/1" : `#0${10 + n}/220`,
    seriesCode: "s1",
    url: `https://jardin.test/cartes/${n}`,
    art: { src: `https://jardin.test/art/${n}.webp`, animated: false },
    signature: null,
    ...extra,
  };
}

export const owned = (c, serial = 1, copies = 1) => ({ card: c, serial, copies });

export function player(extra = {}) {
  return {
    id: "01a00000-0000-7000-8000-000000000000",
    name: "Capucine 🌱",
    avatarUrl: null,
    url: "https://jardin.test/joueurs/1",
    joinedAt: "2026-10-31T20:00:00.000Z",
    arrival: 12,
    title: "Bourgeon",
    motto: "Les lucioles savent où poussent les plus belles cartes.",
    ambiance: "lucioles",
    accent: "#b07cff",
    rank: { index: 2, name: "Bourgeon", next: "Fleur", percent: 16, toNext: 0.44 },
    stats: { opened: 18, owned: 76, inPlay: 217, mythics: 1, finds: 57, streak: 3, badges: 4, badgesTotal: 22 },
    pinned: [],
    ...extra,
  };
}

export const showcase = () => [
  owned(card("rare", "Bidoum")),
  owned(card("epique", "Lo Li"), 1, 3),
  owned(card("mythique", "SUD | Nano")),
  owned(card("secrete"), 2),
  owned(card("legendaire", "Level up")),
  owned(card("commune", "Un nom de membre vraiment très long pour le cartouche")),
];

export const opening = () => ({
  at: "2026-11-02T20:00:00.000Z",
  boosters: 5,
  booster: 2,
  type: "golden",
  cards: [
    { card: card("peu-commune"), serial: 4, isNew: true, first: false },
    { card: card("peu-commune"), serial: 9, isNew: false, first: false },
    { card: card("rare"), serial: 2, isNew: true, first: true },
    { card: card("epique"), serial: 1, isNew: true, first: true },
    { card: card("variante", "peach"), serial: 1, isNew: true, first: true },
  ],
});
