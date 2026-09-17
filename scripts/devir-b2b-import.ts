import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

type Availability = "available" | "preorder" | "unavailable" | "unknown";

interface DevirProduct {
  sku: string;
  name: string;
  purchasePrice: number | null;
  availability: Availability | string;
  releaseDate: string | null;
}

interface SpreeMoney {
  amount?: string | number | null;
  currency?: string | null;
  display_amount?: string | null;
}

type SpreePrice = SpreeMoney | string | number | null;

interface SpreeVariant {
  id: string;
  sku?: string | null;
  price?: SpreePrice;
  prices?: SpreeMoney[];
  currency?: string | null;
  cost_price?: string | number | null;
  preorderable?: boolean;
  preorder_ships_at?: string | null;
}

interface SpreeProduct {
  id: string;
  name: string;
  slug?: string;
  default_variant_id?: string | null;
  price?: SpreePrice;
}

interface SpreeListResponse<T> {
  data: T[];
  meta?: {
    page?: number;
    pages?: number;
    count?: number;
    total_count?: number;
  };
}

interface PriceProposal {
  purchasePrice: number;
  costWithVat: number;
  retailPrice: number;
  effectiveMargin: number;
  currency: string;
}

interface ImportPlanItem {
  action: "create_draft" | "update";
  sku: string;
  name: string;
  availability: string;
  releaseDate: string | null;
  pricing: PriceProposal | null;
  spree: {
    productId: string;
    productName: string;
    variantId: string;
    currentPrice: number | null;
    currentCurrency: string | null;
  } | null;
}

const catalogPath = resolve(
  process.env.DEVIR_B2B_OUTPUT ?? ".local/devir-b2b-catalog.json",
);
const planPath = resolve(
  process.env.DEVIR_B2B_IMPORT_PLAN ?? ".local/devir-b2b-import-plan.json",
);
const spreeApiUrl = process.env.SPREE_API_URL?.replace(/\/$/, "");
const adminApiKey = process.env.SPREE_ADMIN_API_KEY;
const pageSize = readIntegerEnv("DEVIR_SPREE_PAGE_SIZE", 100, 1, 100);
const maxPages = readIntegerEnv("DEVIR_SPREE_MAX_PAGES", 100, 1, 10_000);
const vatRate = readRatioEnv("DEVIR_PRICE_VAT_RATE", 0.21, 0, 1);
const targetMargin = readRatioEnv("DEVIR_PRICE_TARGET_MARGIN", 0.25, 0, 0.95);
const costIncludesVat = readBooleanEnv("DEVIR_PRICE_COST_INCLUDES_VAT", false);
const priceCurrency = (process.env.DEVIR_PRICE_CURRENCY ?? "EUR").trim().toUpperCase();

if (!spreeApiUrl) {
  throw new Error("Falta SPREE_API_URL.");
}
if (!adminApiKey) {
  throw new Error(
    "Falta SPREE_ADMIN_API_KEY. Debe ser una secret key de Admin API con al menos read_products.",
  );
}
if (!priceCurrency) {
  throw new Error("DEVIR_PRICE_CURRENCY no puede estar vacío.");
}
const spreeAdminApiKey = adminApiKey;

function readIntegerEnv(
  name: string,
  fallback: number,
  min: number,
  max: number,
): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${name} debe ser un entero entre ${min} y ${max}.`);
  }
  return value;
}

function readRatioEnv(
  name: string,
  fallback: number,
  min: number,
  maxExclusive: number,
): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < min || value >= maxExclusive) {
    throw new Error(`${name} debe estar entre ${min} y menos de ${maxExclusive}.`);
  }
  return value;
}

function readBooleanEnv(name: string, fallback: boolean): boolean {
  const raw = process.env[name]?.trim().toLowerCase();
  if (!raw) return fallback;
  if (["1", "true", "yes", "si", "sí"].includes(raw)) return true;
  if (["0", "false", "no"].includes(raw)) return false;
  throw new Error(`${name} debe ser true/false (o 1/0).`);
}

function roundCurrency(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function roundUpTo99(value: number): number {
  let candidate = Math.floor(value) + 0.99;
  if (candidate + 1e-9 < value) candidate += 1;
  return roundCurrency(candidate);
}

function calculateRetailPrice(purchasePrice: number | null): PriceProposal | null {
  if (purchasePrice === null || !Number.isFinite(purchasePrice) || purchasePrice <= 0) {
    return null;
  }

  const costWithVat = costIncludesVat
    ? purchasePrice
    : purchasePrice * (1 + vatRate);
  const minimumRetail = costWithVat / (1 - targetMargin);
  const retailPrice = roundUpTo99(minimumRetail);

  return {
    purchasePrice: roundCurrency(purchasePrice),
    costWithVat: roundCurrency(costWithVat),
    retailPrice,
    effectiveMargin: (retailPrice - costWithVat) / retailPrice,
    currency: priceCurrency,
  };
}

function parseMoney(
  price: SpreePrice | undefined,
  fallbackCurrency: string | null = null,
): { amount: number | null; currency: string | null } {
  if (typeof price === "number") {
    return {
      amount: Number.isFinite(price) ? price : null,
      currency: fallbackCurrency,
    };
  }
  if (typeof price === "string") {
    const amount = Number(price);
    return {
      amount: Number.isFinite(amount) ? amount : null,
      currency: fallbackCurrency,
    };
  }
  if (!price) return { amount: null, currency: fallbackCurrency };

  const amount = Number(price.amount);
  return {
    amount: Number.isFinite(amount) ? amount : null,
    currency: price.currency ?? fallbackCurrency,
  };
}

function getVariantMoney(variant: SpreeVariant): {
  amount: number | null;
  currency: string | null;
} {
  const direct = parseMoney(variant.price, variant.currency ?? null);
  if (direct.amount !== null) return direct;

  const preferred =
    variant.prices?.find(
      (price) => price.currency?.toUpperCase() === priceCurrency,
    ) ?? variant.prices?.[0];
  return parseMoney(preferred ?? null, preferred?.currency ?? null);
}

function formatMoney(value: number | null, currency = priceCurrency): string {
  return value === null ? "—" : `${value.toFixed(2)} ${currency}`;
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

async function spreeGet<T>(path: string): Promise<T> {
  const response = await fetch(`${spreeApiUrl}/api/v3/admin${path}`, {
    headers: {
      Accept: "application/json",
      "X-Spree-Api-Key": spreeAdminApiKey,
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `Spree Admin API ${response.status} en ${path}: ${body.slice(0, 500)}`,
    );
  }

  return (await response.json()) as T;
}

function addVariant(
  bySku: Map<string, { product: SpreeProduct; variant: SpreeVariant }>,
  product: SpreeProduct,
  variant: SpreeVariant,
): void {
  const sku = variant.sku?.trim();
  if (!sku) return;
  if (bySku.has(sku)) {
    throw new Error(`SKU duplicado en Spree: ${sku}`);
  }
  bySku.set(sku, { product, variant });
}

async function loadProductVariants(
  product: SpreeProduct,
): Promise<SpreeVariant[]> {
  const variants: SpreeVariant[] = [];

  for (let page = 1; page <= maxPages; page += 1) {
    const params = new URLSearchParams({
      page: String(page),
      limit: String(pageSize),
    });
    const response = await spreeGet<SpreeListResponse<SpreeVariant>>(
      `/products/${encodeURIComponent(product.id)}/variants?${params}`,
    );
    variants.push(...(response.data ?? []));

    const pages = response.meta?.pages ?? page;
    if (page >= pages || response.data.length === 0) break;
  }

  return variants;
}

async function loadSpreeVariants(): Promise<
  Map<string, { product: SpreeProduct; variant: SpreeVariant }>
> {
  const bySku = new Map<
    string,
    { product: SpreeProduct; variant: SpreeVariant }
  >();
  let productCount = 0;

  for (let page = 1; page <= maxPages; page += 1) {
    const params = new URLSearchParams({
      page: String(page),
      limit: String(pageSize),
    });
    const response = await spreeGet<SpreeListResponse<SpreeProduct>>(
      `/products?${params}`,
    );

    for (const product of response.data ?? []) {
      productCount += 1;
      const variants = await loadProductVariants(product);
      for (const variant of variants) addVariant(bySku, product, variant);
    }

    const pages = response.meta?.pages ?? page;
    console.log(
      `Spree: página ${page}/${pages} — ${productCount} productos, ${bySku.size} SKUs indexados.`,
    );
    if (page >= pages || response.data.length === 0) break;
  }

  return bySku;
}

async function main(): Promise<void> {
  const catalog = JSON.parse(await readFile(catalogPath, "utf8")) as {
    products: DevirProduct[];
  };
  const products = catalog.products ?? [];

  if (!products.length) {
    throw new Error(`El catálogo Devir está vacío: ${catalogPath}`);
  }

  const seenDevirSkus = new Set<string>();
  for (const product of products) {
    if (seenDevirSkus.has(product.sku)) {
      throw new Error(`SKU duplicado en el catálogo Devir: ${product.sku}`);
    }
    seenDevirSkus.add(product.sku);
  }

  const spreeBySku = await loadSpreeVariants();
  const plan: ImportPlanItem[] = [];
  let matched = 0;
  let toCreate = 0;
  let withoutPrice = 0;

  console.log("\nDRY-RUN — no se modifica Spree.\n");
  console.log(
    `Precio: coste Devir ${costIncludesVat ? "con IVA" : "sin IVA"}; IVA ${formatPercent(vatRate)}; margen objetivo ${formatPercent(targetMargin)}; redondeo al siguiente .99; moneda ${priceCurrency}.\n`,
  );

  for (const devir of products) {
    const pricing = calculateRetailPrice(devir.purchasePrice);
    if (!pricing) withoutPrice += 1;
    const match = spreeBySku.get(devir.sku);

    if (!match) {
      toCreate += 1;
      plan.push({
        action: "create_draft",
        sku: devir.sku,
        name: devir.name,
        availability: devir.availability,
        releaseDate: devir.releaseDate,
        pricing,
        spree: null,
      });

      console.log(`CREATE-DRAFT ${devir.sku} — ${devir.name}`);
      console.log(
        pricing
          ? `  Devir: ${formatMoney(pricing.purchasePrice)} → coste con IVA ${formatMoney(pricing.costWithVat)} → PVP ${formatMoney(pricing.retailPrice)} (margen efectivo ${formatPercent(pricing.effectiveMargin)})`
          : "  Devir: sin coste válido; no se puede proponer PVP",
      );
      console.log(
        `  Estado Devir: ${devir.availability}${devir.releaseDate ? ` — fecha ${devir.releaseDate}` : ""}`,
      );
      continue;
    }

    matched += 1;
    const { product, variant } = match;
    const current = getVariantMoney(variant);
    plan.push({
      action: "update",
      sku: devir.sku,
      name: devir.name,
      availability: devir.availability,
      releaseDate: devir.releaseDate,
      pricing,
      spree: {
        productId: product.id,
        productName: product.name,
        variantId: variant.id,
        currentPrice: current.amount,
        currentCurrency: current.currency,
      },
    });

    const delta =
      pricing && current.amount !== null
        ? roundCurrency(pricing.retailPrice - current.amount)
        : null;
    console.log(
      `MATCH ${devir.sku} — ${product.name} — variante ${variant.id}`,
    );
    console.log(
      `  Spree: ${formatMoney(current.amount, current.currency ?? priceCurrency)}${pricing ? ` → PVP propuesto ${formatMoney(pricing.retailPrice)}${delta !== null ? ` (Δ ${delta >= 0 ? "+" : ""}${delta.toFixed(2)} ${priceCurrency})` : ""}` : " — sin PVP propuesto"}`,
    );
    if (pricing) {
      console.log(
        `  Devir: ${formatMoney(pricing.purchasePrice)} → coste con IVA ${formatMoney(pricing.costWithVat)} — margen efectivo ${formatPercent(pricing.effectiveMargin)}`,
      );
    }
  }

  await mkdir(dirname(planPath), { recursive: true });
  await writeFile(
    planPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        dryRun: true,
        pricingPolicy: {
          currency: priceCurrency,
          costIncludesVat,
          vatRate,
          targetMargin,
          rounding: "ceil_to_.99",
        },
        summary: {
          matched,
          toCreate,
          withoutPrice,
          total: products.length,
        },
        items: plan,
      },
      null,
      2,
    ),
  );

  console.log(
    `\nResultado: ${matched} MATCH, ${toCreate} CREATE-DRAFT, ${withoutPrice} sin PVP, ${products.length} Devir en total.`,
  );
  console.log(`Plan guardado en ${planPath}`);
  console.log(
    "No se han enviado PATCH/POST/DELETE y no se han escrito productos, precios, stock ni estados.",
  );

  if (withoutPrice > 0) {
    process.exitCode = 2;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
