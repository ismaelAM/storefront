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

export function dailyOfferSelectionComplete(
  offers:
    | readonly {
        productId?: string;
        variantId?: string;
        amount?: number;
        compareAtAmount?: number;
        category?: string;
      }[]
    | null
    | undefined,
): boolean {
  return (
    offers?.length === DAILY_OFFER_TARGET_COUNT &&
    new Set(offers.map((offer) => offer.productId)).size ===
      DAILY_OFFER_TARGET_COUNT &&
    offers.every(
      (offer) =>
        Boolean(offer.productId && offer.variantId) &&
        Number.isFinite(offer.amount) &&
        Number(offer.amount) > 0 &&
        Number.isFinite(offer.compareAtAmount) &&
        Number(offer.compareAtAmount) > Number(offer.amount),
    ) &&
    DAILY_OFFER_CATEGORIES.every(
      (category) =>
        offers.filter((offer) => offer.category === category).length ===
        DAILY_OFFERS_PER_CATEGORY,
    )
  );
}

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

export interface DailyOfferRefreshCandidate {
  id: string;
  source_url: string;
  productId: string;
  category: DailyOfferCategory;
  lastSeenAt: string;
  lastAttemptedAt?: string;
  priceReady: boolean;
  cost: number;
}

/** Maintain one small, priced daily cohort before the ordinary full crawl. */
export function planDailyOfferRefresh(
  candidates: readonly DailyOfferRefreshCandidate[],
  now: number,
  freshForMs = 6 * 60 * 60 * 1000,
): {
  offers: Array<{ id: string; source_url: string }>;
  counts: Record<DailyOfferCategory, number>;
} {
  const freshAfter = now - freshForMs;
  const retryAfter = now - 30 * 60 * 1000;
  const counts = Object.fromEntries(
    DAILY_OFFER_CATEGORIES.map((category) => [
      category,
      new Set(
        candidates
          .filter(
            (candidate) =>
              candidate.category === category &&
              candidate.priceReady &&
              Date.parse(candidate.lastSeenAt) > freshAfter &&
              Date.parse(candidate.lastSeenAt) <= now,
          )
          .map((candidate) => candidate.productId),
      ).size,
    ]),
  ) as Record<DailyOfferCategory, number>;
  const offers: Array<{ id: string; source_url: string }> = [];
  const seen = new Set(
    candidates
      .filter(
        (candidate) =>
          candidate.priceReady &&
          Date.parse(candidate.lastSeenAt) > freshAfter &&
          Date.parse(candidate.lastSeenAt) <= now,
      )
      .map((candidate) => candidate.productId),
  );
  const lastCategoryAttempt = (category: DailyOfferCategory) =>
    Math.max(
      0,
      ...candidates
        .filter((candidate) => candidate.category === category)
        .map((candidate) =>
          Date.parse(candidate.lastAttemptedAt ?? candidate.lastSeenAt),
        )
        .filter(Number.isFinite),
    );
  const groups = [...DAILY_OFFER_CATEGORIES].sort(
    (a, b) =>
      counts[a] - counts[b] || lastCategoryAttempt(a) - lastCategoryAttempt(b),
  );
  for (const category of groups) {
    let missing = Math.max(0, DAILY_OFFERS_PER_CATEGORY - counts[category]);
    const due = candidates
      .filter(
        (candidate) =>
          candidate.category === category &&
          Number.isFinite(Date.parse(candidate.lastSeenAt)) &&
          Date.parse(candidate.lastAttemptedAt ?? candidate.lastSeenAt) <=
            retryAfter &&
          (!candidate.priceReady ||
            Date.parse(candidate.lastSeenAt) <= freshAfter),
      )
      .sort(
        (a, b) =>
          // A recently validated product is a better cohort candidate than a
          // month-old dead URL. The cooldown still moves failed attempts aside.
          Date.parse(b.lastSeenAt) - Date.parse(a.lastSeenAt) ||
          Date.parse(a.lastAttemptedAt ?? a.lastSeenAt) -
            Date.parse(b.lastAttemptedAt ?? b.lastSeenAt) ||
          Number(b.priceReady) - Number(a.priceReady) ||
          b.cost - a.cost,
      );
    for (const candidate of due) {
      if (!missing || offers.length >= 3) break;
      if (seen.has(candidate.productId)) continue;
      offers.push({ id: candidate.id, source_url: candidate.source_url });
      seen.add(candidate.productId);
      missing--;
    }
    if (offers.length >= 3) break;
  }
  return { offers, counts };
}
