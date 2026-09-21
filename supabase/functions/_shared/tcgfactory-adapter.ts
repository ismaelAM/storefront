import {
  type NormalizedSupplierCatalogItem,
  normalizeSupplierItem,
  normalizeText,
  type SupplierAvailability,
  type SupplierCatalogItem,
} from "./catalog-sourcing";

export const TCGFACTORY_SUPPLIER_CODE = "tcgfactory";
export const TCGFACTORY_ADAPTER_KEY = "tcgfactory_b2b_bridge_v1";
export const TCGFACTORY_SECRET_NAMES = {
  email: "TCGFACTORY_B2B_EMAIL",
  password: "TCGFACTORY_B2B_PASSWORD",
} as const;

export interface TcgFactoryCredentials {
  email: string;
  password: string;
}

export interface TcgFactoryFeedRecord {
  externalProductId?: string | number | null;
  externalVariantId: string | number;
  reference: string;
  productName: string;
  variantName?: string | null;
  ean?: string | null;
  sourceUrl?: string | null;
  categoryKey?: string | null;
  groupKey?: string | null;
  manufacturer?: string | null;
  manufacturerSku?: string | null;
  options?: Record<string, string | number | null>;
  purchasePriceNet?: number | string;
  purchasePriceGross?: number | string;
  shippingCostNet?: number | string;
  normalizedCost?: number | string;
  taxRate?: number | string | null;
  currency?: string;
  availability: string;
  stockQuantity?: number | string | null;
  releaseDate?: string | null;
  imageUrls?: string[];
}

function record(value: unknown): TcgFactoryFeedRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("El registro de TcgFactory debe ser un objeto");
  }
  return value as TcgFactoryFeedRecord;
}

function requiredText(value: unknown, field: string): string {
  const text = String(value ?? "").trim();
  if (!text) throw new Error(`Falta ${field}`);
  return text;
}

export function requireTcgFactoryCredentials(
  readSecret: (name: string) => string | undefined,
): TcgFactoryCredentials {
  const email = requiredText(
    readSecret(TCGFACTORY_SECRET_NAMES.email),
    TCGFACTORY_SECRET_NAMES.email,
  );
  const password = readSecret(TCGFACTORY_SECRET_NAMES.password);
  if (typeof password !== "string" || !password.trim()) {
    throw new Error(`Falta ${TCGFACTORY_SECRET_NAMES.password}`);
  }
  if (!email.includes("@")) {
    throw new Error(`${TCGFACTORY_SECRET_NAMES.email} no es un email válido`);
  }
  if (
    ["[SENSITIVE]", "[REDACTED]", "********", "*****"].includes(password.trim())
  ) {
    throw new Error(
      `${TCGFACTORY_SECRET_NAMES.password} contiene un marcador, no un secreto real`,
    );
  }
  return { email, password };
}

function optionalNumber(value: unknown, field: string): number | undefined {
  if (value === null || value === undefined || value === "") return undefined;
  const normalized =
    typeof value === "string" ? value.trim().replace(",", ".") : value;
  const number = Number(normalized);
  if (!Number.isFinite(number)) throw new Error(`${field} no es válido`);
  return number;
}

function sourceUrl(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = new URL(requiredText(value, "sourceUrl"));
  const officialHost =
    parsed.hostname === "tcgfactory.com" ||
    parsed.hostname.endsWith(".tcgfactory.com");
  if (parsed.protocol !== "https:" || !officialHost) {
    throw new Error("sourceUrl debe ser una URL HTTPS oficial de TcgFactory");
  }
  if (parsed.username || parsed.password) {
    throw new Error("sourceUrl no puede contener credenciales");
  }
  parsed.hash = "";
  return parsed.toString();
}

export function mapTcgFactoryAvailability(
  value: unknown,
): SupplierAvailability {
  const normalized = normalizeText(String(value ?? ""));
  if (
    ["disponible", "en-stock", "stock", "available", "in-stock"].includes(
      normalized,
    )
  ) {
    return "available";
  }
  if (
    ["preventa", "pre-order", "preorder", "reservar", "reserva"].includes(
      normalized,
    )
  ) {
    return "preorder";
  }
  if (
    [
      "agotado",
      "sin-stock",
      "no-disponible",
      "descatalogado",
      "unavailable",
      "out-of-stock",
    ].includes(normalized)
  ) {
    return "unavailable";
  }
  return "unknown";
}

export function tcgFactoryRecordToCatalogItem(
  value: unknown,
): SupplierCatalogItem {
  const input = record(value);
  const purchasePriceNet = optionalNumber(
    input.purchasePriceNet,
    "purchasePriceNet",
  );
  const purchasePriceGross = optionalNumber(
    input.purchasePriceGross,
    "purchasePriceGross",
  );
  if ((purchasePriceNet === undefined) === (purchasePriceGross === undefined)) {
    throw new Error(
      "Indica exactamente uno de purchasePriceNet o purchasePriceGross; un precio público no es un coste B2B",
    );
  }

  const taxIncluded = purchasePriceGross !== undefined;
  const taxRate = optionalNumber(input.taxRate, "taxRate");
  if (
    taxIncluded &&
    taxRate === undefined &&
    input.normalizedCost === undefined
  ) {
    throw new Error(
      "purchasePriceGross necesita taxRate o normalizedCost para compararse",
    );
  }

  const stockQuantity = optionalNumber(input.stockQuantity, "stockQuantity");
  if (stockQuantity !== undefined && stockQuantity < 0) {
    throw new Error("stockQuantity no puede ser negativo");
  }
  const reportedAvailability = requiredText(input.availability, "availability");
  const mappedAvailability = mapTcgFactoryAvailability(reportedAvailability);
  const availability =
    stockQuantity === 0 && mappedAvailability === "available"
      ? "unavailable"
      : mappedAvailability;

  return {
    supplierCode: TCGFACTORY_SUPPLIER_CODE,
    supplierName: "TcgFactory",
    adapterKey: TCGFACTORY_ADAPTER_KEY,
    externalProductId:
      input.externalProductId === null || input.externalProductId === undefined
        ? null
        : String(input.externalProductId),
    externalVariantId: requiredText(
      input.externalVariantId,
      "externalVariantId",
    ),
    supplierSku: requiredText(input.reference, "reference"),
    productName: requiredText(input.productName, "productName"),
    variantName: input.variantName?.trim() || null,
    sourceUrl: sourceUrl(input.sourceUrl),
    categoryKey: input.categoryKey?.trim() || null,
    groupKey: input.groupKey?.trim() || null,
    gtin: input.ean?.trim() || null,
    manufacturer: input.manufacturer?.trim() || null,
    manufacturerSku: input.manufacturerSku?.trim() || null,
    options: input.options,
    purchasePrice: purchasePriceNet ?? purchasePriceGross!,
    shippingCost: optionalNumber(input.shippingCostNet, "shippingCostNet") ?? 0,
    normalizedCost: optionalNumber(input.normalizedCost, "normalizedCost"),
    currency: input.currency?.trim().toUpperCase() || "EUR",
    taxIncluded,
    taxRate: taxRate ?? null,
    availability,
    stockQuantity: stockQuantity ?? null,
    releaseDate: input.releaseDate?.trim() || null,
    imageUrls: input.imageUrls,
    metadata: {
      feedContract: TCGFACTORY_ADAPTER_KEY,
      reportedAvailability,
    },
  };
}

export function normalizeTcgFactoryRecord(
  value: unknown,
): NormalizedSupplierCatalogItem {
  return normalizeSupplierItem(tcgFactoryRecordToCatalogItem(value));
}
