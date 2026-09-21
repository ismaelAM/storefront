export interface MtgPreconReviewCandidate {
  name: string;
  url?: string | null;
  purchasePrice?: number | null;
}

function normalize(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

/**
 * Devir sometimes sells heterogeneous MTG preconstructed decks as one carton.
 * Those cartons must never be auto-published as a single retail product because
 * the shop sells the individual decks. Booster displays are intentionally not
 * matched: those are sold as sealed boxes.
 *
 * Ambiguous MTG Commander listings with a high wholesale cost are also held for
 * review. False positives are safer than accidentally publishing a full carton.
 */
export function requiresMtgPreconSplitReview(
  candidate: MtgPreconReviewCandidate,
): boolean {
  const value = normalize(`${candidate.name} ${candidate.url ?? ""}`);
  if (!/\b(?:mtg|magic)\b/.test(value)) return false;

  const preconFamily =
    /\bcommander\b/.test(value) ||
    /\bpre[- ]?con(?:structed)?\b/.test(value) ||
    /\bcollector\s+deck\b/.test(value);
  if (!preconFamily) return false;

  const explicitMultipack =
    /\b(?:caja|carton|display|pack|set)\b/.test(value) ||
    /\b\d+\s*(?:barajas|mazos|decks?)\b/.test(value) ||
    /\bstarter\s+commander\s+decks?\b/.test(value);

  if (explicitMultipack) return true;

  const purchasePrice = Number(candidate.purchasePrice);
  return Number.isFinite(purchasePrice) && purchasePrice >= 80;
}
