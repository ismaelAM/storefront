export type SupplierAvailability =
  | "available"
  | "preorder"
  | "unavailable"
  | "unknown";

export interface SupplierCatalogItem {
  supplierCode: string;
  supplierName?: string;
  adapterKey?: string;
  externalProductId?: string | null;
  externalVariantId: string;
  supplierSku: string;
  productName: string;
  variantName?: string | null;
  sourceUrl?: string | null;
  categoryKey?: string | null;
  groupKey?: string | null;
  gtin?: string | null;
  manufacturer?: string | null;
  manufacturerSku?: string | null;
  options?: Record<string, string | number | null | undefined>;
  purchasePrice: number;
  shippingCost?: number;
  normalizedCost?: number;
  currency?: string;
  taxIncluded?: boolean;
  taxRate?: number | null;
  referencePriceNet?: number | null;
  availability: SupplierAvailability;
  stockQuantity?: number | null;
  releaseDate?: string | null;
  imageUrls?: string[];
  metadata?: Record<string, unknown>;
}

export interface NormalizedSupplierCatalogItem
  extends Omit<
    SupplierCatalogItem,
    | "supplierCode"
    | "externalVariantId"
    | "supplierSku"
    | "productName"
    | "options"
    | "purchasePrice"
    | "shippingCost"
    | "normalizedCost"
    | "currency"
    | "taxIncluded"
    | "taxRate"
    | "imageUrls"
  > {
  supplierCode: string;
  externalVariantId: string;
  supplierSku: string;
  productName: string;
  options: Record<string, string>;
  purchasePrice: number;
  shippingCost: number;
  normalizedCost: number;
  currency: string;
  taxIncluded: boolean;
  taxRate: number | null;
  imageUrls: string[];
}

export type MatchStrategy =
  | "gtin"
  | "isbn"
  | "manufacturer_sku"
  | "exact_group_and_options"
  | "exact_title_and_options";

export interface CanonicalIdentity {
  productKey: string;
  variantKey: string;
  canonicalSku: string;
  optionSignature: string;
  normalizedOptions: Record<string, string>;
  matchStrategy: MatchStrategy;
  matchConfidence: "high" | "medium";
  requiresReview: boolean;
  identifiers: Array<{ namespace: string; value: string }>;
}

export interface SupplierOfferCandidate {
  id: string;
  supplierId: string;
  supplierCode: string;
  supplierSku: string;
  supplierPriority: number;
  supplierEnabled: boolean;
  staleAfterHours: number;
  normalizedCost: number;
  currency: string;
  availability: SupplierAvailability;
  active: boolean;
  lastSeenAt: string;
}

export interface OfferSelection {
  selected: SupplierOfferCandidate | null;
  rejected: Array<{
    id: string;
    reason:
      | "supplier_disabled"
      | "inactive"
      | "unavailable"
      | "invalid_cost"
      | "currency_mismatch"
      | "stale";
  }>;
}

function requiredText(value: unknown, field: string): string {
  const result = typeof value === "string" ? value.trim() : "";
  if (!result) throw new Error(`Falta ${field}`);
  return result;
}

function finiteNumber(value: unknown, field: string): number {
  const result = Number(value);
  if (!Number.isFinite(result))
    throw new Error(`${field} no es un número válido`);
  return result;
}

export function normalizeText(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 180);
}

export function normalizeSupplierCode(value: string): string {
  const code = normalizeText(value).replace(/-/g, "_").slice(0, 48);
  if (!code) throw new Error("Código de distribuidor inválido");
  return code;
}

export function normalizeOptions(
  options: SupplierCatalogItem["options"],
): Record<string, string> {
  const pairs = Object.entries(options ?? {})
    .map(
      ([key, value]) =>
        [normalizeText(key), String(value ?? "").trim()] as const,
    )
    .filter(([key, value]) => Boolean(key && value))
    .map(([key, value]) => [key, value.replace(/\s+/g, " ")] as const)
    .sort(([left], [right]) => left.localeCompare(right));
  return Object.fromEntries(pairs);
}

export function optionSignature(options: Record<string, string>): string {
  return Object.entries(options)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${normalizeText(value)}`)
    .join("&");
}

function validGtin(value: string): boolean {
  if (![8, 12, 13, 14].includes(value.length) || !/^\d+$/.test(value)) {
    return false;
  }
  const digits = value.split("").map(Number);
  const checkDigit = digits.pop();
  if (checkDigit === undefined) return false;
  const sum = digits
    .reverse()
    .reduce(
      (total, digit, index) => total + digit * (index % 2 === 0 ? 3 : 1),
      0,
    );
  return (10 - (sum % 10)) % 10 === checkDigit;
}

function validIsbn10(value: string): boolean {
  if (!/^\d{9}[\dX]$/.test(value)) return false;
  const sum = value.split("").reduce((total, digit, index) => {
    const numeric = digit === "X" ? 10 : Number(digit);
    return total + numeric * (10 - index);
  }, 0);
  return sum % 11 === 0;
}

export function normalizeGlobalIdentifier(
  value: string | null | undefined,
): { namespace: "gtin" | "isbn"; value: string } | null {
  const compact = String(value ?? "")
    .toUpperCase()
    .replace(/[^0-9X]/g, "");
  if (validGtin(compact)) return { namespace: "gtin", value: compact };
  if (validIsbn10(compact)) return { namespace: "isbn", value: compact };
  return null;
}

export function normalizeSupplierItem(
  item: SupplierCatalogItem,
): NormalizedSupplierCatalogItem {
  const supplierCode = normalizeSupplierCode(
    requiredText(item.supplierCode, "supplierCode"),
  );
  const externalVariantId = requiredText(
    item.externalVariantId,
    "externalVariantId",
  );
  const supplierSku = requiredText(item.supplierSku, "supplierSku");
  const productName = requiredText(item.productName, "productName");
  const purchasePrice = finiteNumber(item.purchasePrice, "purchasePrice");
  const shippingCost = finiteNumber(item.shippingCost ?? 0, "shippingCost");
  if (purchasePrice <= 0)
    throw new Error("purchasePrice debe ser mayor que cero");
  if (shippingCost < 0) throw new Error("shippingCost no puede ser negativo");

  const taxIncluded = item.taxIncluded === true;
  const taxRate =
    item.taxRate === null || item.taxRate === undefined
      ? null
      : finiteNumber(item.taxRate, "taxRate");
  if (taxRate !== null && (taxRate < 0 || taxRate >= 1)) {
    throw new Error("taxRate debe estar entre 0 y 1");
  }

  let normalizedCost: number;
  if (item.normalizedCost !== undefined) {
    normalizedCost = finiteNumber(item.normalizedCost, "normalizedCost");
  } else if (!taxIncluded) {
    normalizedCost = purchasePrice + shippingCost;
  } else if (taxRate !== null) {
    normalizedCost = purchasePrice / (1 + taxRate) + shippingCost;
  } else {
    throw new Error(
      "Una tarifa con IVA necesita taxRate o normalizedCost para poder compararse",
    );
  }
  if (normalizedCost <= 0) {
    throw new Error("normalizedCost debe ser mayor que cero");
  }

  const currency = String(item.currency ?? "EUR")
    .trim()
    .toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency))
    throw new Error("currency debe ser ISO-4217");
  if (
    !["available", "preorder", "unavailable", "unknown"].includes(
      item.availability,
    )
  ) {
    throw new Error("availability no es válida");
  }

  return {
    ...item,
    supplierCode,
    externalVariantId,
    supplierSku,
    productName,
    options: normalizeOptions(item.options),
    purchasePrice,
    shippingCost,
    normalizedCost,
    currency,
    taxIncluded,
    taxRate,
    imageUrls: Array.from(
      new Set(
        (item.imageUrls ?? [])
          .filter((value): value is string => typeof value === "string")
          .map((value) => value.trim())
          .filter(Boolean),
      ),
    ),
  };
}

export function buildCanonicalIdentity(
  rawItem: SupplierCatalogItem | NormalizedSupplierCatalogItem,
): CanonicalIdentity {
  const item = normalizeSupplierItem(rawItem);
  const globalIdentifier =
    normalizeGlobalIdentifier(item.gtin) ??
    normalizeGlobalIdentifier(item.supplierSku);
  const manufacturer = normalizeText(item.manufacturer ?? "");
  const manufacturerSku = normalizeText(item.manufacturerSku ?? "");
  const manufacturerIdentifier =
    manufacturer && manufacturerSku
      ? { namespace: `manufacturer:${manufacturer}`, value: manufacturerSku }
      : null;
  const category =
    normalizeText(item.categoryKey ?? "uncategorized") || "uncategorized";
  const title = normalizeText(item.productName);
  const group = normalizeText(item.groupKey ?? "");
  const normalizedOptions = normalizeOptions(item.options);
  const signature = optionSignature(normalizedOptions);
  const variantName = normalizeText(item.variantName ?? item.productName);

  const familyKey = group
    ? `group:${category}:${group}`
    : `title:${category}:${title}`;
  const hasFamily = Boolean(group || signature || item.variantName);
  const productKey = hasFamily
    ? familyKey
    : globalIdentifier
      ? `item:${globalIdentifier.namespace}:${globalIdentifier.value}`
      : manufacturerIdentifier
        ? `item:${manufacturerIdentifier.namespace}:${manufacturerIdentifier.value}`
        : familyKey;

  let variantKey: string;
  let canonicalSku: string;
  let matchStrategy: MatchStrategy;
  let matchConfidence: CanonicalIdentity["matchConfidence"];
  let requiresReview: boolean;

  if (globalIdentifier) {
    variantKey = `item:${globalIdentifier.namespace}:${globalIdentifier.value}`;
    canonicalSku = globalIdentifier.value;
    matchStrategy = globalIdentifier.namespace;
    matchConfidence = "high";
    requiresReview = false;
  } else if (manufacturerIdentifier) {
    variantKey = `item:${manufacturerIdentifier.namespace}:${manufacturerIdentifier.value}`;
    canonicalSku = `${manufacturer}-${manufacturerSku}`.toUpperCase();
    matchStrategy = "manufacturer_sku";
    matchConfidence = "high";
    requiresReview = false;
  } else {
    variantKey = `${familyKey}:variant:${signature || variantName || "default"}`;
    canonicalSku = `${item.supplierCode}-${normalizeText(item.supplierSku)}`
      .toUpperCase()
      .slice(0, 120);
    matchStrategy = group
      ? "exact_group_and_options"
      : "exact_title_and_options";
    matchConfidence = group ? "high" : "medium";
    requiresReview = !group;
  }

  const identifiers: CanonicalIdentity["identifiers"] = [
    {
      namespace: `supplier:${item.supplierCode}`,
      value: normalizeText(item.supplierSku),
    },
    ...(globalIdentifier ? [globalIdentifier] : []),
    ...(manufacturerIdentifier ? [manufacturerIdentifier] : []),
    { namespace: "canonical-match", value: variantKey },
  ];

  return {
    productKey,
    variantKey,
    canonicalSku,
    optionSignature: signature,
    normalizedOptions,
    matchStrategy,
    matchConfidence,
    requiresReview,
    identifiers,
  };
}

function availabilityRank(value: SupplierAvailability): number {
  if (value === "available") return 0;
  if (value === "preorder") return 1;
  return 2;
}

export function selectBestOffer(
  offers: SupplierOfferCandidate[],
  options: { targetCurrency?: string; now?: Date } = {},
): OfferSelection {
  const targetCurrency = (options.targetCurrency ?? "EUR").toUpperCase();
  const now = options.now ?? new Date();
  const eligible: SupplierOfferCandidate[] = [];
  const rejected: OfferSelection["rejected"] = [];

  for (const offer of offers) {
    let reason: OfferSelection["rejected"][number]["reason"] | null = null;
    if (!offer.supplierEnabled) reason = "supplier_disabled";
    else if (!offer.active) reason = "inactive";
    else if (
      offer.availability !== "available" &&
      offer.availability !== "preorder"
    )
      reason = "unavailable";
    else if (
      !Number.isFinite(offer.normalizedCost) ||
      offer.normalizedCost <= 0
    ) {
      reason = "invalid_cost";
    } else if (offer.currency.toUpperCase() !== targetCurrency) {
      reason = "currency_mismatch";
    } else {
      const lastSeen = new Date(offer.lastSeenAt).getTime();
      const staleAfterMs = offer.staleAfterHours * 60 * 60 * 1000;
      if (
        !Number.isFinite(lastSeen) ||
        !Number.isFinite(staleAfterMs) ||
        staleAfterMs <= 0 ||
        now.getTime() - lastSeen > staleAfterMs
      ) {
        reason = "stale";
      }
    }

    if (reason) rejected.push({ id: offer.id, reason });
    else eligible.push(offer);
  }

  eligible.sort(
    (left, right) =>
      left.normalizedCost - right.normalizedCost ||
      availabilityRank(left.availability) -
        availabilityRank(right.availability) ||
      left.supplierPriority - right.supplierPriority ||
      left.supplierCode.localeCompare(right.supplierCode) ||
      left.supplierSku.localeCompare(right.supplierSku) ||
      left.id.localeCompare(right.id),
  );

  return { selected: eligible[0] ?? null, rejected };
}
