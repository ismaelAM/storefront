export const DAILY_OFFER_CATEGORIES = [
  "tcg",
  "juegos-de-mesa",
  "accesorios",
  "merchandising",
] as const;
export type DailyOfferCategory = (typeof DAILY_OFFER_CATEGORIES)[number];
export const DAILY_OFFERS_PER_CATEGORY = 3;
export const DAILY_OFFER_TARGET_COUNT =
  DAILY_OFFER_CATEGORIES.length * DAILY_OFFERS_PER_CATEGORY;

/** Only explicit catalog taxonomy can occupy a daily offer quota. */
export function dailyOfferCategory(
  categoryKey: string | null | undefined,
): DailyOfferCategory | null {
  const root = categoryKey?.trim().toLowerCase().split("/")[0];
  if (root === "rol") return "juegos-de-mesa";
  return DAILY_OFFER_CATEGORIES.find((category) => category === root) ?? null;
}

/** Preserve ranking within each category while sharing a bounded inspection budget. */
export function interleaveDailyOfferCandidates<
  T extends { category: DailyOfferCategory },
>(ranked: readonly T[], limit = 120): T[] {
  const groups = DAILY_OFFER_CATEGORIES.map((category) =>
    ranked.filter((candidate) => candidate.category === category),
  );
  const result: T[] = [];
  for (let index = 0; result.length < limit; index += 1) {
    let added = false;
    for (const group of groups) {
      const candidate = group[index];
      if (candidate && result.length < limit) {
        result.push(candidate);
        added = true;
      }
    }
    if (!added) break;
  }
  return result;
}
