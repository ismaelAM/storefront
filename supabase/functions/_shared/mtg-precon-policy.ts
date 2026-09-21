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
  if (!/\b(?:mtg|magic|mg)\b/.test(value)) return false;

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


/**
 * Generic supplier-pack safety rule.
 *
 * Devir also uses commercial presentations such as "Presentación: X (5+1)"
 * or "Venta en pack de 15 u." for cartons containing several retail units.
 * Those supplier SKUs must stay in draft/review until an operator splits them
 * into the actual products sold by the shop.
 *
 * This intentionally does not match normal MTG prerelease kits or booster
 * displays unless the title explicitly says that several retail units are
 * bundled together.
 */
export function requiresManualPackSplitReview(
  candidate: MtgPreconReviewCandidate,
): boolean {
  const value = normalize(`${candidate.name} ${candidate.url ?? ""}`);

  const promotionalPresentation =
    /\bpresentacion\b/.test(value) &&
    /\(\s*\d+\s*\+\s*\d+\s*\)/.test(value);

  const supplierUnitPack =
    /\bventa\s+en\s+pack\s+de\s+\d+\s*(?:u\.?|uds?\.?|unidades?)\b/.test(
      value,
    );

  const explicitRetailCarton =
    /\b(?:caja|carton|expositor)\s+(?:de\s+)?\d+\s+(?:juegos?|unidades?|uds?\.?)\b/.test(
      value,
    );

  const explicitDeckCarton =
    /\b(?:caja|carton|expositor)\s+de\s+(?:barajas|mazos|decks?|juegos?)\b.*\(\s*\d+\s*(?:u\.?|uds?\.?|unidades?)\b/.test(
      value,
    );

  // These families are distributed as displays containing multiple retail
  // expansion packs, not as one consumer product. Keep them in review even
  // when Devir omits the unit count from the B2B title.
  const knownExpansionDisplay =
    /\b(?:hero realms|star realms)\b/.test(value) &&
    /\bdisplay\b/.test(value);

  return promotionalPresentation ||
    supplierUnitPack ||
    explicitRetailCarton ||
    explicitDeckCarton ||
    knownExpansionDisplay ||
    requiresMtgPreconSplitReview(candidate);
}
