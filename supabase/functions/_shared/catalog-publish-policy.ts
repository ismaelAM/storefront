export type CatalogAvailability =
  | "available"
  | "preorder"
  | "unavailable"
  | "unknown"
  | "missing";

export type CatalogReviewDecision = "pending" | "approved" | "rejected";

export type CatalogFulfillmentMode =
  | "supplier_or_physical"
  | "physical_only"
  | "disabled";

export function catalogReviewFingerprint(reasons: Iterable<string>): string {
  return Array.from(new Set(Array.from(reasons).map((reason) => reason.trim()).filter(Boolean)))
    .sort()
    .join("|");
}

export function isCatalogReviewApproved(input: {
  reasons: Iterable<string>;
  decision?: CatalogReviewDecision | null;
  approvedFingerprint?: string | null;
}): boolean {
  if (input.decision !== "approved") return false;
  const fingerprint = catalogReviewFingerprint(input.reasons);
  return Boolean(fingerprint) && fingerprint === (input.approvedFingerprint ?? "");
}

export function shouldRequireCatalogReview(input: {
  reasons: Iterable<string>;
  decision?: CatalogReviewDecision | null;
  approvedFingerprint?: string | null;
}): boolean {
  const reasons = Array.from(input.reasons);
  if (input.decision === "rejected") return true;
  if (reasons.length === 0) return false;
  return !isCatalogReviewApproved({
    reasons,
    decision: input.decision,
    approvedFingerprint: input.approvedFingerprint,
  });
}

export function supplierAvailabilityIsSellable(
  availability: CatalogAvailability,
): boolean {
  return availability === "available" || availability === "preorder";
}

export function shouldAllowSupplierBackorder(input: {
  availability: CatalogAvailability;
  fulfillmentMode?: CatalogFulfillmentMode | null;
}): boolean {
  const mode = input.fulfillmentMode ?? "supplier_or_physical";
  return mode === "supplier_or_physical" &&
    supplierAvailabilityIsSellable(input.availability);
}

export function shouldAutoPublishCatalogProduct(input: {
  review: boolean;
  availability: CatalogAvailability;
  physicalStockOnHand?: number | null;
  fulfillmentMode?: CatalogFulfillmentMode | null;
}): boolean {
  if (input.review || input.fulfillmentMode === "disabled") return false;
  const physicalStock =
    Number.isFinite(Number(input.physicalStockOnHand)) &&
    Number(input.physicalStockOnHand) > 0;
  return physicalStock ||
    shouldAllowSupplierBackorder({
      availability: input.availability,
      fulfillmentMode: input.fulfillmentMode,
    });
}

export function isAutoManagedPrice(input: {
  currentPrice: number | null;
  lastAutoPrice: number | null;
}): boolean {
  return input.currentPrice !== null &&
    input.lastAutoPrice !== null &&
    Number.isFinite(input.currentPrice) &&
    Number.isFinite(input.lastAutoPrice) &&
    Math.abs(input.currentPrice - input.lastAutoPrice) < 0.005;
}

export function canWriteManagedCatalogPrice(input: {
  createdVariant: boolean;
  managed: boolean;
  forceDraftForSplit: boolean;
  currentPrice: number | null;
  lastAutoPrice: number | null;
}): boolean {
  if (input.createdVariant) return true;
  if (!input.managed) return false;
  return input.forceDraftForSplit ||
    isAutoManagedPrice({
      currentPrice: input.currentPrice,
      lastAutoPrice: input.lastAutoPrice,
    });
}
