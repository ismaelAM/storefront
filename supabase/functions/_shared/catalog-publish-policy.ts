export type CatalogAvailability =
  | "available"
  | "preorder"
  | "unavailable"
  | "unknown"
  | "missing";

export function shouldAutoPublishCatalogProduct(input: {
  review: boolean;
  availability: CatalogAvailability;
}): boolean {
  return (
    !input.review &&
    (input.availability === "available" || input.availability === "preorder")
  );
}

export function isAutoManagedPrice(input: {
  currentPrice: number | null;
  lastAutoPrice: number | null;
}): boolean {
  return (
    input.currentPrice !== null &&
    input.lastAutoPrice !== null &&
    Number.isFinite(input.currentPrice) &&
    Number.isFinite(input.lastAutoPrice) &&
    Math.abs(input.currentPrice - input.lastAutoPrice) < 0.005
  );
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
  return (
    input.forceDraftForSplit ||
    isAutoManagedPrice({
      currentPrice: input.currentPrice,
      lastAutoPrice: input.lastAutoPrice,
    })
  );
}
