import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { loadLocalEnv } from "./load-local-env";
import { attachCategoryMargins, customFields, numberField, request as spreeAdminRequest } from "./spree-admin";

loadLocalEnv();

type Availability = "available" | "preorder" | "unavailable" | "unknown";
type ReviewStatus = "auto" | "review_required" | "approved";
type PlanAction = "create_draft" | "update" | "skip";

interface DevirProduct {
  source?: string;
  url?: string;
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
}

interface SpreeProduct {
  id: string;
  name: string;
  slug?: string;
  default_variant_id?: string | null;
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

interface PricingCategoryRule {
  key: string;
  label: string;
  match?: string[];
  targetMargin: number | null;
  marginSource?: string;
  spreeCategoryId?: string;
  spreeCategoryName?: string;
}

interface PricingConfig {
  currency: string;
  vatRate: number;
  costIncludesVat: boolean;
  defaultTargetMargin: number;
  requireCategoryMargin: boolean;
  categories: PricingCategoryRule[];
}

interface OperatorSplitChild {
  sku: string;
  name: string;
  allocatedCost: number;
  category?: string;
  targetMargin?: number | null;
  retailPrice?: number | null;
}

interface OperatorDecision {
  approved?: boolean;
  mode?: "approve" | "split" | "skip";
  category?: string;
  targetMargin?: number | null;
  retailPrice?: number | null;
  children?: OperatorSplitChild[];
  note?: string;
}

interface OperatorDecisionFile {
  version?: number;
  decisions?: Record<string, OperatorDecision>;
}

interface PriceProposal {
  purchasePrice: number;
  costWithVat: number;
  retailPrice: number;
  effectiveMargin: number;
  targetMargin: number;
  currency: string;
  ruleSource: string;
  manualRetailPrice: boolean;
}

interface ImportPlanItem {
  status: ReviewStatus;
  reviewReasons: string[];
  action: PlanAction;
  supplierSku: string;
  sku: string;
  name: string;
  sourceUrl: string | null;
  category: string | null;
  spreeCategoryId: string | null;
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
  operatorNote?: string;
}

interface ReviewQueueItem {
  supplierSku: string;
  supplierName: string;
  purchasePrice: number | null;
  inferredCategory: string | null;
  reasons: string[];
  packCandidate: boolean;
  suggestedDecision: OperatorDecision;
}

const catalogPath = resolve(
  process.env.DEVIR_B2B_OUTPUT ?? ".local/devir-b2b-catalog.json",
);
const planPath = resolve(
  process.env.DEVIR_B2B_IMPORT_PLAN ?? ".local/devir-b2b-import-plan.json",
);
const reviewQueuePath = resolve(
  process.env.DEVIR_B2B_REVIEW_QUEUE ?? ".local/devir-b2b-review-queue.json",
);
const decisionsPath = resolve(
  process.env.DEVIR_B2B_OPERATOR_DECISIONS ?? ".local/devir-b2b-operator-decisions.json",
);
const pricingConfigPath = resolve(
  process.env.DEVIR_B2B_PRICING_CONFIG ?? ".local/devir-pricing-rules.json",
);
const pricingTemplatePath = resolve(
  process.env.DEVIR_B2B_PRICING_TEMPLATE ?? "config/devir-pricing-rules.example.json",
);
const pageSize = readIntegerEnv("DEVIR_SPREE_PAGE_SIZE", 100, 1, 100);
const maxPages = readIntegerEnv("DEVIR_SPREE_MAX_PAGES", 100, 1, 10_000);

function readIntegerEnv(name: string, fallback: number, min: number, max: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${name} debe ser un entero entre ${min} y ${max}.`);
  }
  return value;
}

function readRatioEnv(name: string, fallback: number, min: number, maxExclusive: number): number {
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

function assertRatio(name: string, value: number, maxExclusive: number): number {
  if (!Number.isFinite(value) || value < 0 || value >= maxExclusive) {
    throw new Error(`${name} debe estar entre 0 y menos de ${maxExclusive}.`);
  }
  return value;
}

function roundCurrency(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function roundUpTo99(value: number): number {
  let candidate = Math.floor(value) + 0.99;
  if (candidate + 1e-9 < value) candidate += 1;
  return roundCurrency(candidate);
}

function parseMoney(
  price: SpreePrice | undefined,
  fallbackCurrency: string | null = null,
): { amount: number | null; currency: string | null } {
  if (typeof price === "number") {
    return { amount: Number.isFinite(price) ? price : null, currency: fallbackCurrency };
  }
  if (typeof price === "string") {
    const amount = Number(price);
    return { amount: Number.isFinite(amount) ? amount : null, currency: fallbackCurrency };
  }
  if (!price) return { amount: null, currency: fallbackCurrency };

  const amount = Number(price.amount);
  return {
    amount: Number.isFinite(amount) ? amount : null,
    currency: price.currency ?? fallbackCurrency,
  };
}

function getVariantMoney(
  variant: SpreeVariant,
  currency: string,
): { amount: number | null; currency: string | null } {
  const direct = parseMoney(variant.price, variant.currency ?? null);
  if (direct.amount !== null) return direct;
  const preferred =
    variant.prices?.find((price) => price.currency?.toUpperCase() === currency) ??
    variant.prices?.[0];
  return parseMoney(preferred ?? null, preferred?.currency ?? null);
}

function formatMoney(value: number | null, currency: string): string {
  return value === null ? "—" : `${value.toFixed(2)} ${currency}`;
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function isPackCandidate(product: DevirProduct): boolean {
  const value = `${product.name} ${product.url ?? ""}`.toLocaleLowerCase();
  return (
    /\bcaja\s+(?:de\s+)?\d+\s+(?:barajas|mazos|decks)\b/.test(value) ||
    /\bstarter\s+commander\s+decks?\b/.test(value) ||
    /\bcommander\s+decks?\s+set\b/.test(value)
  );
}

function inferCategory(product: DevirProduct, config: PricingConfig): PricingCategoryRule | null {
  const haystack = `${product.name} ${product.url ?? ""}`.toLocaleLowerCase();
  return (
    config.categories.find((rule) =>
      (rule.match ?? []).some((needle) => haystack.includes(needle.toLocaleLowerCase())),
    ) ?? null
  );
}

function findCategory(config: PricingConfig, key: string | undefined): PricingCategoryRule | null {
  if (!key) return null;
  return config.categories.find((rule) => rule.key === key) ?? null;
}

function calculateRetailPrice({
  purchasePrice,
  targetMargin,
  vatRate,
  costIncludesVat,
  currency,
  ruleSource,
  manualRetailPrice,
}: {
  purchasePrice: number | null;
  targetMargin: number;
  vatRate: number;
  costIncludesVat: boolean;
  currency: string;
  ruleSource: string;
  manualRetailPrice?: number | null;
}): PriceProposal | null {
  if (purchasePrice === null || !Number.isFinite(purchasePrice) || purchasePrice <= 0) {
    return null;
  }
  const costWithVat = costIncludesVat ? purchasePrice : purchasePrice * (1 + vatRate);
  const retailPrice =
    manualRetailPrice !== null && manualRetailPrice !== undefined
      ? roundCurrency(manualRetailPrice)
      : roundUpTo99(costWithVat / (1 - targetMargin));
  if (!Number.isFinite(retailPrice) || retailPrice <= 0) return null;

  return {
    purchasePrice: roundCurrency(purchasePrice),
    costWithVat: roundCurrency(costWithVat),
    retailPrice,
    effectiveMargin: (retailPrice - costWithVat) / retailPrice,
    targetMargin,
    currency,
    ruleSource,
    manualRetailPrice: manualRetailPrice !== null && manualRetailPrice !== undefined,
  };
}

async function readJsonIfExists<T>(path: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return fallback;
    throw error;
  }
}

async function loadPricingConfig(): Promise<PricingConfig> {
  let raw: PricingConfig;
  try {
    raw = JSON.parse(await readFile(pricingConfigPath, "utf8")) as PricingConfig;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    raw = JSON.parse(await readFile(pricingTemplatePath, "utf8")) as PricingConfig;
    await mkdir(dirname(pricingConfigPath), { recursive: true });
    await writeFile(pricingConfigPath, JSON.stringify(raw, null, 2));
    console.log(`Configuración privada de márgenes creada en ${pricingConfigPath}`);
  }

  const config: PricingConfig = {
    currency: (process.env.DEVIR_PRICE_CURRENCY ?? raw.currency ?? "EUR").trim().toUpperCase(),
    vatRate: readRatioEnv("DEVIR_PRICE_VAT_RATE", raw.vatRate ?? 0.21, 0, 1),
    costIncludesVat: readBooleanEnv(
      "DEVIR_PRICE_COST_INCLUDES_VAT",
      raw.costIncludesVat ?? false,
    ),
    defaultTargetMargin: readRatioEnv(
      "DEVIR_PRICE_TARGET_MARGIN",
      raw.defaultTargetMargin ?? 0.25,
      0,
      0.95,
    ),
    requireCategoryMargin: raw.requireCategoryMargin ?? true,
    categories: raw.categories ?? [],
  };
  if (!config.currency) throw new Error("La moneda de precios no puede estar vacía.");
  for (const category of config.categories) {
    if (category.targetMargin !== null) {
      assertRatio(`Margen de ${category.key}`, category.targetMargin, 0.95);
    }
  }
  return config;
}

async function spreeGet<T>(path: string): Promise<T> {
  return await spreeAdminRequest<T>("GET", path);
}

function addVariant(
  bySku: Map<string, { product: SpreeProduct; variant: SpreeVariant }>,
  product: SpreeProduct,
  variant: SpreeVariant,
): void {
  const sku = variant.sku?.trim();
  if (!sku) return;
  if (bySku.has(sku)) throw new Error(`SKU duplicado en Spree: ${sku}`);
  bySku.set(sku, { product, variant });
}

async function loadProductVariants(product: SpreeProduct): Promise<SpreeVariant[]> {
  const variants: SpreeVariant[] = [];
  for (let page = 1; page <= maxPages; page += 1) {
    const params = new URLSearchParams({ page: String(page), limit: String(pageSize) });
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
  const bySku = new Map<string, { product: SpreeProduct; variant: SpreeVariant }>();
  let productCount = 0;
  for (let page = 1; page <= maxPages; page += 1) {
    const params = new URLSearchParams({ page: String(page), limit: String(pageSize) });
    const response = await spreeGet<SpreeListResponse<SpreeProduct>>(`/products?${params}`);
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

function resolvePricing({
  purchasePrice,
  category,
  decision,
  config,
  explicitMarginSource,
}: {
  purchasePrice: number | null;
  category: PricingCategoryRule | null;
  decision?: OperatorDecision;
  config: PricingConfig;
  explicitMarginSource?: string;
}): { pricing: PriceProposal | null; reasons: string[] } {
  const reasons: string[] = [];
  const explicitMargin = decision?.targetMargin;
  if (explicitMargin !== null && explicitMargin !== undefined) {
    assertRatio("Margen manual", explicitMargin, 0.95);
  }

  const categoryMargin = category?.targetMargin ?? null;
  const targetMargin = explicitMargin ?? categoryMargin ?? config.defaultTargetMargin;
  const ruleSource =
    explicitMargin !== null && explicitMargin !== undefined
      ? explicitMarginSource ?? "operator_margin"
      : categoryMargin !== null
        ? category?.marginSource ?? `category:${category?.key}`
        : "default_reference";

  if (!category) reasons.push("category_unclassified");
  if (
    config.requireCategoryMargin &&
    category &&
    category.targetMargin === null &&
    explicitMargin == null &&
    decision?.retailPrice == null
  ) {
    reasons.push("category_margin_unconfigured");
  }
  if (!purchasePrice || purchasePrice <= 0) reasons.push("missing_purchase_price");

  const pricing = calculateRetailPrice({
    purchasePrice,
    targetMargin,
    vatRate: config.vatRate,
    costIncludesVat: config.costIncludesVat,
    currency: config.currency,
    ruleSource,
    manualRetailPrice: decision?.retailPrice,
  });
  return { pricing, reasons };
}

function makePlanItem({
  supplier,
  sku,
  name,
  purchasePrice,
  category,
  decision,
  reasons,
  pricing,
  spreeBySku,
  config,
}: {
  supplier: DevirProduct;
  sku: string;
  name: string;
  purchasePrice: number | null;
  category: PricingCategoryRule | null;
  decision?: OperatorDecision;
  reasons: string[];
  pricing: PriceProposal | null;
  spreeBySku: Map<string, { product: SpreeProduct; variant: SpreeVariant }>;
  config: PricingConfig;
}): ImportPlanItem {
  const match = spreeBySku.get(sku);
  const approved = decision?.approved === true && reasons.length === 0;
  const status: ReviewStatus = approved ? "approved" : reasons.length > 0 ? "review_required" : "auto";
  const current = match ? getVariantMoney(match.variant, config.currency) : null;

  return {
    status,
    reviewReasons: reasons,
    action: decision?.mode === "skip" ? "skip" : match ? "update" : "create_draft",
    supplierSku: supplier.sku,
    sku,
    name,
    sourceUrl: supplier.url ?? null,
    category: category?.key ?? decision?.category ?? null,
    spreeCategoryId: category?.spreeCategoryId ?? null,
    availability: supplier.availability,
    releaseDate: supplier.releaseDate,
    pricing: pricing
      ? { ...pricing, purchasePrice: roundCurrency(purchasePrice ?? pricing.purchasePrice) }
      : null,
    spree: match
      ? {
          productId: match.product.id,
          productName: match.product.name,
          variantId: match.variant.id,
          currentPrice: current?.amount ?? null,
          currentCurrency: current?.currency ?? null,
        }
      : null,
    ...(decision?.note ? { operatorNote: decision.note } : {}),
  };
}

async function productMarginOverride(
  sku: string,
  spreeBySku: Map<string, { product: SpreeProduct; variant: SpreeVariant }>,
  cache: Map<string, number | null>,
): Promise<{ margin: number | null; source?: string }> {
  const match = spreeBySku.get(sku);
  if (!match) return { margin: null };
  if (cache.has(match.product.id)) {
    const margin = cache.get(match.product.id) ?? null;
    return { margin, ...(margin === null ? {} : { source: "spree_product:" + match.product.id }) };
  }
  try {
    const margin = numberField(
      await customFields("products", match.product.id),
      "pricing.target_margin",
    );
    const valid = margin !== null && margin >= 0 && margin < 0.95 ? margin : null;
    cache.set(match.product.id, valid);
    return { margin: valid, ...(valid === null ? {} : { source: "spree_product:" + match.product.id }) };
  } catch {
    cache.set(match.product.id, null);
    return { margin: null };
  }
}

function validateSplitDecision(product: DevirProduct, decision: OperatorDecision): string[] {
  const reasons: string[] = [];
  const children = decision.children ?? [];
  if (children.length < 2) reasons.push("split_children_missing");
  const childSkus = new Set<string>();
  let allocated = 0;
  for (const child of children) {
    if (!child.sku.trim() || !child.name.trim()) reasons.push("split_child_identity_missing");
    if (!Number.isFinite(child.allocatedCost) || child.allocatedCost <= 0) {
      reasons.push("split_child_cost_invalid");
    } else {
      allocated += child.allocatedCost;
    }
    if (child.sku && childSkus.has(child.sku)) reasons.push("split_child_sku_duplicated");
    childSkus.add(child.sku);
  }
  if (
    product.purchasePrice !== null &&
    Math.abs(roundCurrency(allocated) - roundCurrency(product.purchasePrice)) > 0.01
  ) {
    reasons.push("split_cost_total_mismatch");
  }
  return Array.from(new Set(reasons));
}

async function main(): Promise<void> {
  const config = await loadPricingConfig();
  await attachCategoryMargins(config.categories);
  const catalog = JSON.parse(await readFile(catalogPath, "utf8")) as { products: DevirProduct[] };
  const products = catalog.products ?? [];
  if (!products.length) throw new Error(`El catálogo Devir está vacío: ${catalogPath}`);

  const decisions = await readJsonIfExists<OperatorDecisionFile>(decisionsPath, {
    version: 1,
    decisions: {},
  });
  const decisionBySku = decisions.decisions ?? {};

  const seenDevirSkus = new Set<string>();
  for (const product of products) {
    if (seenDevirSkus.has(product.sku)) {
      throw new Error(`SKU duplicado en el catálogo Devir: ${product.sku}`);
    }
    seenDevirSkus.add(product.sku);
  }

  const spreeBySku = await loadSpreeVariants();
  const productMarginCache = new Map<string, number | null>();
  const plan: ImportPlanItem[] = [];
  const reviewQueue: ReviewQueueItem[] = [];

  console.log("\nDRY-RUN — no se modifica Spree.\n");
  console.log(
    `Precio base: coste Devir ${config.costIncludesVat ? "con IVA" : "sin IVA"}; IVA ${formatPercent(config.vatRate)}; margen fallback ${formatPercent(config.defaultTargetMargin)}; redondeo al siguiente .99; moneda ${config.currency}.`,
  );
  console.log("Prioridad: operador → override de producto en Spree → categoría Spree/local → fallback de referencia.\n");

  for (const supplier of products) {
    const inferredCategory = inferCategory(supplier, config);
    const decision = decisionBySku[supplier.sku];
    const packCandidate = isPackCandidate(supplier);

    if (decision?.mode === "split") {
      const splitReasons = validateSplitDecision(supplier, decision);
      const children = decision.children ?? [];
      const splitPlan: ImportPlanItem[] = [];
      for (const child of children) {
        const category =
          findCategory(config, child.category ?? decision.category) ?? inferredCategory;
        const productOverride = await productMarginOverride(child.sku, spreeBySku, productMarginCache);
        const inheritedMargin = child.targetMargin ?? decision.targetMargin;
        const childDecision: OperatorDecision = {
          approved: decision.approved,
          mode: "approve",
          category: child.category ?? decision.category,
          targetMargin: inheritedMargin ?? productOverride.margin,
          retailPrice: child.retailPrice,
          note: decision.note,
        };
        const { pricing, reasons } = resolvePricing({
          purchasePrice: child.allocatedCost,
          category,
          decision: childDecision,
          config,
          explicitMarginSource:
            inheritedMargin != null ? "operator_margin" : productOverride.source,
        });
        const allReasons = Array.from(new Set([...splitReasons, ...reasons]));
        const item = makePlanItem({
          supplier,
          sku: child.sku,
          name: child.name,
          purchasePrice: child.allocatedCost,
          category,
          decision: childDecision,
          reasons: allReasons,
          pricing,
          spreeBySku,
          config,
        });
        splitPlan.push(item);
        plan.push(item);
      }
      const splitReviewReasons = Array.from(
        new Set([
          ...(children.length === 0 ? ["split_children_missing"] : []),
          ...splitReasons,
          ...splitPlan.flatMap((item) => item.reviewReasons),
        ]),
      );
      if (splitReviewReasons.length > 0) {
        reviewQueue.push({
          supplierSku: supplier.sku,
          supplierName: supplier.name,
          purchasePrice: supplier.purchasePrice,
          inferredCategory: inferredCategory?.key ?? null,
          reasons: splitReviewReasons,
          packCandidate: true,
          suggestedDecision: {
            approved: false,
            mode: "split",
            category: decision.category ?? inferredCategory?.key,
            children,
          },
        });
      }
      continue;
    }

    const category = findCategory(config, decision?.category) ?? inferredCategory;
    const productOverride = await productMarginOverride(supplier.sku, spreeBySku, productMarginCache);
    const effectiveDecision: OperatorDecision | undefined =
      decision?.targetMargin != null || productOverride.margin == null
        ? decision
        : { ...(decision ?? {}), targetMargin: productOverride.margin };
    const { pricing, reasons } = resolvePricing({
      purchasePrice: supplier.purchasePrice,
      category,
      decision: effectiveDecision,
      config,
      explicitMarginSource:
        decision?.targetMargin != null ? "operator_margin" : productOverride.source,
    });
    if (packCandidate && !decision?.approved) reasons.unshift("pack_requires_operator_split");
    if (decision?.mode === "skip" && decision.approved) reasons.length = 0;

    const item = makePlanItem({
      supplier,
      sku: supplier.sku,
      name: supplier.name,
      purchasePrice: supplier.purchasePrice,
      category,
      decision: effectiveDecision,
      reasons: Array.from(new Set(reasons)),
      pricing,
      spreeBySku,
      config,
    });
    plan.push(item);

    if (item.status === "review_required") {
      reviewQueue.push({
        supplierSku: supplier.sku,
        supplierName: supplier.name,
        purchasePrice: supplier.purchasePrice,
        inferredCategory: category?.key ?? null,
        reasons: item.reviewReasons,
        packCandidate,
        suggestedDecision: packCandidate
          ? {
              approved: false,
              mode: "split",
              category: category?.key,
              children: [],
            }
          : {
              approved: false,
              mode: "approve",
              category: category?.key,
              targetMargin: category?.targetMargin,
            },
      });
    }
  }

  for (const item of plan) {
    const prefix = item.status === "review_required" ? "REVIEW" : item.status.toUpperCase();
    console.log(`${prefix.padEnd(8)} ${item.sku} — ${item.name}`);
    console.log(
      `  ${item.action.toUpperCase()} · categoría ${item.category ?? "sin clasificar"}${item.reviewReasons.length ? ` · ${item.reviewReasons.join(", ")}` : ""}`,
    );
    if (item.pricing) {
      console.log(
        `  coste ${formatMoney(item.pricing.purchasePrice, config.currency)} → coste+IVA ${formatMoney(item.pricing.costWithVat, config.currency)} → PVP ${formatMoney(item.pricing.retailPrice, config.currency)} · margen ${formatPercent(item.pricing.effectiveMargin)} · regla ${item.pricing.ruleSource}`,
      );
    }
    if (item.spree) {
      console.log(
        `  Spree ${formatMoney(item.spree.currentPrice, item.spree.currentCurrency ?? config.currency)} · variante ${item.spree.variantId}`,
      );
    }
  }

  const summary = {
    auto: plan.filter((item) => item.status === "auto").length,
    approved: plan.filter((item) => item.status === "approved").length,
    reviewRequired: plan.filter((item) => item.status === "review_required").length,
    createDraft: plan.filter((item) => item.action === "create_draft").length,
    update: plan.filter((item) => item.action === "update").length,
    skip: plan.filter((item) => item.action === "skip").length,
    totalPlanItems: plan.length,
    supplierProducts: products.length,
  };

  await mkdir(dirname(planPath), { recursive: true });
  await writeFile(
    planPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        dryRun: true,
        pricingPolicy: {
          currency: config.currency,
          costIncludesVat: config.costIncludesVat,
          vatRate: config.vatRate,
          defaultTargetMargin: config.defaultTargetMargin,
          requireCategoryMargin: config.requireCategoryMargin,
          rounding: "ceil_to_.99",
          configPath: pricingConfigPath,
        },
        decisionsPath,
        summary,
        items: plan,
      },
      null,
      2,
    ),
  );
  await writeFile(
    reviewQueuePath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        decisionsPath,
        pending: reviewQueue,
      },
      null,
      2,
    ),
  );

  console.log(
    `\nResultado: ${summary.auto} AUTO, ${summary.approved} APPROVED, ${summary.reviewRequired} REVIEW_REQUIRED; ${summary.createDraft} CREATE-DRAFT, ${summary.update} UPDATE, ${summary.skip} SKIP.`,
  );
  console.log(`Plan: ${planPath}`);
  console.log(`Cola de revisión: ${reviewQueuePath}`);
  if (reviewQueue.length > 0) {
    console.log("Ejecuta `pnpm devir:review` para preparar/actualizar tus decisiones de operador.");
  }
  console.log(
    "No se han enviado PATCH/POST/DELETE y no se han escrito productos, precios, stock ni estados.",
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
