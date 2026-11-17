/** Supplier category keys and native Spree permalinks share this vocabulary. */
export const TCG_GAMES = [
  ["mtg", "Magic: The Gathering", "MTG"],
  ["one-piece", "One Piece Card Game", "OP"],
  ["yugioh", "Yu-Gi-Oh!", "YGO"],
  ["lorcana", "Disney Lorcana", "DL"],
  ["pokemon", "Pokémon TCG", "PKM"],
  ["digimon", "Digimon Card Game", "DCG"],
  ["dbscg-fusion-world", "Dragon Ball Fusion World", "FW"],
  ["dbscg-masters", "Dragon Ball Masters", "DB"],
  ["gundam", "Gundam Card Game", "GCG"],
  ["cyberpunk", "Cyberpunk TCG", "CP"],
  ["vanguard", "Cardfight!! Vanguard", "VG"],
  ["weiss-schwarz", "Weiß Schwarz", "WS"],
  ["hololive", "Hololive Card Game", "HL"],
  ["palworld", "Palworld", "PW"],
  ["shadowverse", "Shadowverse: Evolve", "SE"],
] as const;

export const TCG_FORMATS = ["boosters", "decks", "sets", "accessories"] as const;
export type TcgFormat = (typeof TCG_FORMATS)[number];
export const TCG_CATALOG_TAG = "bison-tcg-catalog";
export const TCG_FORMAT_TAG_PREFIX = "bison-format:";

export function tcgGameForPath(path: string | null | undefined) {
  const [group, game, ...rest] = (path ?? "").trim().toLowerCase().split("/");
  return group === "tcg" && rest.length === 0 ? TCG_GAMES.find(([key]) => key === game) : undefined;
}

export function isTcgShopProduct(name: string, path: string | null | undefined): boolean {
  return Boolean(tcgGameForPath(path)) &&
    !/\b(?:panini|cromos?|stickers?|topps|funko|army painter)\b/i.test(name);
}

export function tcgFormatForName(name: string): TcgFormat | undefined {
  if (/\b(?:sleeves?|fundas|playmats?|tapetes?|deck box|deckbox|[aá]lbum(?:es)?)\b/i.test(name)) {
    return "accessories";
  }
  // "Commander" alone is ambiguous (e.g. Commander Legends Booster Box).
  if (/\b(?:mazos?|decks?|starter kit|precons?)\b/i.test(name)) return "decks";
  if (/\b(?:bundles?|sets?|prerelease|kits?|preludio|begin+er|begginer|principiante|double pack|limited card (?:pack|park)|collection|selection box)\b/i.test(name)) {
    return "sets";
  }
  if (/\b(?:boosters?|sobres?|blisters?)\b/i.test(name)) return "boosters";
  return undefined;
}
