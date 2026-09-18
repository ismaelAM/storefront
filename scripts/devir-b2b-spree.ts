import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  CATEGORY_FIELDS,
  PRODUCT_FIELDS,
  SpreeAdminError,
  attachCategoryMargins,
  boolField,
  customFields,
  ensureFields,
  list,
  numberField,
  productIndex,
  request,
  scopeHint,
  upsertFields,
  variantPrice,
  type Category,
  type CustomFieldDefinition,
  type PricingRuleLike,
  type Product,
  type Variant,
} from "./spree-admin";

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

interface PlanItem {
  status: "auto" | "review_required" | "approved";
  reviewReasons: string[];
  action: "create_draft" | "update" | "skip";
  supplierSku: string;
  sku: string;
  name: string;
  sourceUrl?: string | null;
  category: string | null;
  spreeCategoryId?: string | null;
  availability: string;
  releaseDate: string | null;
  pricing: PriceProposal | null;
}

interface Plan {
  generatedAt: string;
  pricingPolicy: { currency: string; costIncludesVat: boolean; vatRate: number };
  decisionsPath?: string;
  items: PlanItem[];
}

interface PricingConfig {
  categories: PricingRuleLike[];
}

interface Decisions {
  decisions?: Record<
    string,
    {
      approved?: boolean;
      mode?: "approve" | "split" | "skip";
      children?: Array<{ sku: string }>;
    }
  >;
}

const planPath = resolve(process.env.DEVIR_B2B_IMPORT_PLAN ?? ".local/devir-b2b-import-plan.json");
const pricingPath = resolve(process.env.DEVIR_B2B_PRICING_CONFIG ?? ".local/devir-pricing-rules.json");
const pricingTemplate = resolve(
  process.env.DEVIR_B2B_PRICING_TEMPLATE ?? "config/devir-pricing-rules.example.json",
);

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf8")) as T;
}

async function readJsonOr<T>(path: string, fallback: T): Promise<T> {
  try { return await readJson<T>(path); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return fallback;
    throw error;
  }
}

async function pricingConfig(): Promise<PricingConfig> {
  try { return await readJson<PricingConfig>(pricingPath); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    return await readJson<PricingConfig>(pricingTemplate);
  }
}

function pct(value: number | null): string {
  return value === null ? "—" : (value * 100).toFixed(1) + "%";
}

function money(value: number | null, currency = "EUR"): string {
  return value === null ? "—" : value.toFixed(2) + " " + currency;
}

function effectiveMargin(cost: number, price: number | null, vat: number, includesVat: boolean): number | null {
  if (!Number.isFinite(cost) || cost <= 0 || price === null || price <= 0) return null;
  const grossCost = includesVat ? cost : cost * (1 + vat);
  return (price - grossCost) / price;
}

function closeEnough(a: number | null, b: number | null): boolean {
  return a !== null && b !== null && Math.abs(a - b) < 0.005;
}

function fieldValues(item: PlanItem, plan: Plan): Record<string, unknown> {
  return {
    "devir.supplier_sku": item.supplierSku,
    "devir.source_url": item.sourceUrl ?? undefined,
    "devir.category_key": item.category ?? undefined,
    "devir.availability": item.availability,
    "devir.release_date": item.releaseDate ?? undefined,
    "devir.review_status": item.status === "review_required" ? "review_required" : "ready",
    "devir.review_reasons": item.reviewReasons.length ? item.reviewReasons.join(", ") : "none",
    "devir.last_sync_at": new Date().toISOString(),
    "pricing.applied_margin": item.pricing?.targetMargin,
    "pricing.effective_margin": item.pricing?.effectiveMargin,
    "pricing.rule_source": item.pricing?.ruleSource,
    "pricing.vat_rate": plan.pricingPolicy.vatRate,
    "pricing.cost_includes_vat": plan.pricingPolicy.costIncludesVat,
  };
}

function inlineFields(
  definitions: Map<string, CustomFieldDefinition>,
  values: Record<string, unknown>,
): Array<{ custom_field_definition_id: string; value: unknown }> {
  const output: Array<{ custom_field_definition_id: string; value: unknown }> = [];
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined || value === null || value === "") continue;
    const def = definitions.get("Spree::Product:" + key);
    if (!def) throw new Error("Falta definición Spree::Product:" + key);
    output.push({ custom_field_definition_id: def.id, value });
  }
  return output;
}

async function setup(): Promise<Map<string, CustomFieldDefinition>> {
  const definitions = await ensureFields();
  console.log(
    "Spree setup OK: " +
      PRODUCT_FIELDS.length +
      " campos de producto y " +
      CATEGORY_FIELDS.length +
      " de categoría.",
  );
  const cfg = await pricingConfig();
  await attachCategoryMargins(cfg.categories);
  console.log(
    "Márgenes: usa Pricing · Margen objetivo en la categoría; Pricing · Margen objetivo (override) en un producto.",
  );
  return definitions;
}

function createVariant(item: PlanItem): Record<string, unknown> {
  if (!item.pricing) throw new Error("Sin pricing para " + item.sku);
  return {
    options: [],
    sku: item.sku,
    cost_price: item.pricing.purchasePrice,
    cost_currency: item.pricing.currency,
    track_inventory: true,
    prices: [{ currency: item.pricing.currency, amount: item.pricing.retailPrice }],
  };
}

async function createDraft(
  item: PlanItem,
  plan: Plan,
  defs: Map<string, CustomFieldDefinition>,
): Promise<Product> {
  if (!item.pricing) throw new Error("Sin pricing para " + item.sku);
  const values = {
    ...fieldValues(item, plan),
    "pricing.last_synced_price": item.pricing.retailPrice,
    "pricing.manual_price_override": false,
  };
  return await request<Product>("POST", "/products", {
    name: item.name,
    status: "draft",
    tags: ["devir", item.status === "review_required" ? "devir-review" : "devir-ready"],
    ...(item.spreeCategoryId ? { category_ids: [item.spreeCategoryId] } : {}),
    variants: [createVariant(item)],
    custom_fields: inlineFields(defs, values),
  });
}

async function updateExisting(
  item: PlanItem,
  plan: Plan,
  defs: Map<string, CustomFieldDefinition>,
  match: { product: Product; variant: Variant },
): Promise<"updated" | "protected"> {
  if (!item.pricing) throw new Error("Sin pricing para " + item.sku);
  const fields = await customFields("products", match.product.id);
  const currentPrice = variantPrice(match.variant, item.pricing.currency);
  const lastAutoPrice = numberField(fields, "pricing.last_synced_price");
  const managed = (match.product.tags ?? []).includes("devir");
  const active = match.product.status === "active";
  const forceActive = ["1", "true", "yes"].includes(
    (process.env.DEVIR_B2B_UPDATE_ACTIVE ?? "").toLowerCase(),
  );
  const automaticPrice = managed && !active && closeEnough(currentPrice, lastAutoPrice);
  const canWritePrice = forceActive || automaticPrice;
  const manualOverride = currentPrice !== null && !canWritePrice;

  const tags = Array.from(
    new Set([
      ...(match.product.tags ?? []),
      "devir",
      item.status === "review_required" ? "devir-review" : "devir-ready",
    ]),
  ).filter((tag) =>
    item.status === "review_required" ? tag !== "devir-ready" : tag !== "devir-review",
  );

  const variantPatch: Record<string, unknown> = {
    id: match.variant.id,
    sku: item.sku,
    cost_price: item.pricing.purchasePrice,
    cost_currency: item.pricing.currency,
  };
  if (canWritePrice) {
    variantPatch.prices = [
      { currency: item.pricing.currency, amount: item.pricing.retailPrice },
    ];
  }

  await request("PATCH", "/products/" + match.product.id, {
    tags,
    variants: [variantPatch],
    ...(!active && managed ? { name: item.name } : {}),
  });

  const resultingPrice = canWritePrice ? item.pricing.retailPrice : currentPrice;
  await upsertFields(
    "products",
    match.product.id,
    defs,
    "Spree::Product",
    {
      ...fieldValues(item, plan),
      "pricing.effective_margin": effectiveMargin(
        item.pricing.purchasePrice,
        resultingPrice,
        plan.pricingPolicy.vatRate,
        plan.pricingPolicy.costIncludesVat,
      ),
      "pricing.manual_price_override": manualOverride,
      ...(canWritePrice ? { "pricing.last_synced_price": item.pricing.retailPrice } : {}),
    },
    fields,
  );
  return manualOverride ? "protected" : "updated";
}

async function archiveSplitParents(
  plan: Plan,
  defs: Map<string, CustomFieldDefinition>,
  existing: Map<string, { product: Product; variant: Variant }>,
  synced: Set<string>,
): Promise<number> {
  if (!plan.decisionsPath) return 0;
  const decisions = await readJsonOr<Decisions>(plan.decisionsPath, {});
  let count = 0;
  for (const [parentSku, decision] of Object.entries(decisions.decisions ?? {})) {
    if (!decision.approved || decision.mode !== "split" || !decision.children?.length) continue;
    if (!decision.children.every((child) => existing.has(child.sku) || synced.has(child.sku))) continue;
    const parent = existing.get(parentSku);
    if (!parent || parent.product.status !== "draft") continue;
    await request("PATCH", "/products/" + parent.product.id, { status: "archived" });
    await upsertFields("products", parent.product.id, defs, "Spree::Product", {
      "devir.review_status": "split_archived",
      "devir.review_reasons": "replaced_by_split_children",
      "devir.last_sync_at": new Date().toISOString(),
    });
    console.log("ARCHIVED " + parentSku + " — pack sustituido por productos hijo");
    count += 1;
  }
  return count;
}

async function sync(): Promise<void> {
  const plan = await readJson<Plan>(planPath);
  if (!plan.items?.length) throw new Error("Plan vacío: " + planPath);
  const duplicates = plan.items
    .map((item) => item.sku)
    .filter((sku, index, all) => all.indexOf(sku) !== index);
  if (duplicates.length) throw new Error("SKUs duplicados en plan: " + Array.from(new Set(duplicates)).join(", "));

  const defs = await setup();
  const existing = await productIndex();
  const synced = new Set<string>();
  let created = 0;
  let updated = 0;
  let protectedPrices = 0;
  let skipped = 0;
  let failed = 0;

  for (const item of plan.items) {
    try {
      if (item.action === "skip" || !item.pricing) {
        skipped += 1;
        console.log("SKIP     " + item.sku + " — " + (item.action === "skip" ? "operador" : "sin pricing"));
        continue;
      }
      const match = existing.get(item.sku);
      if (!match) {
        const product = await createDraft(item, plan, defs);
        synced.add(item.sku);
        created += 1;
        console.log(
          "CREATED  " +
            item.sku +
            " — DRAFT " +
            product.id +
            " · " +
            money(item.pricing.retailPrice, item.pricing.currency) +
            " · " +
            item.status,
        );
      } else {
        const result = await updateExisting(item, plan, defs, match);
        synced.add(item.sku);
        if (result === "protected") {
          protectedPrices += 1;
          console.log("PROTECT  " + item.sku + " — PVP manual preservado");
        } else {
          updated += 1;
          console.log("UPDATED  " + item.sku + " — " + (match.product.status ?? "draft"));
        }
      }
    } catch (error) {
      failed += 1;
      console.error("FAILED   " + item.sku + " — " + (error instanceof Error ? error.message : String(error)));
    }
  }

  const archived = failed ? 0 : await archiveSplitParents(plan, defs, existing, synced);
  console.log(
    "Spree: " +
      created +
      " drafts creados, " +
      updated +
      " actualizados, " +
      protectedPrices +
      " PVP protegidos, " +
      archived +
      " packs archivados, " +
      skipped +
      " omitidos, " +
      failed +
      " fallos.",
  );
  if (failed) throw new Error("La sincronización terminó con fallos.");
}

async function status(): Promise<void> {
  const index = await productIndex();
  const seen = new Set<string>();
  let count = 0;
  for (const [sku, match] of index) {
    if (seen.has(match.product.id) || !(match.product.tags ?? []).includes("devir")) continue;
    seen.add(match.product.id);
    count += 1;
    const fields = await customFields("products", match.product.id);
    const review = String(fields.find((f) => f.key === "devir.review_status")?.value ?? "?");
    const cost = Number(match.variant.cost_price);
    const price = variantPrice(match.variant);
    const margin = effectiveMargin(
      cost,
      price,
      numberField(fields, "pricing.vat_rate") ?? 0.21,
      boolField(fields, "pricing.cost_includes_vat") ?? false,
    );
    const manual = boolField(fields, "pricing.manual_price_override") ?? false;
    console.log(
      (match.product.status ?? "?").toUpperCase().padEnd(8) +
        " " +
        sku +
        " · " +
        review.padEnd(15) +
        " · coste " +
        money(Number.isFinite(cost) ? cost : null) +
        " · PVP " +
        money(price) +
        (manual ? " (manual)" : "") +
        " · margen " +
        pct(margin) +
        " · " +
        match.product.name,
    );
  }
  if (!count) console.log("No hay productos Devir sincronizados en Spree.");
}

async function margin(args: string[]): Promise<void> {
  const [ruleKey, raw] = args;
  const value = Number(raw);
  if (!ruleKey || !Number.isFinite(value) || value < 0 || value >= 0.95) {
    throw new Error("Uso: pnpm devir:spree:margin <tcg/mtg|tcg/yugioh|...> <0.25>");
  }
  const defs = await setup();
  const cfg = await pricingConfig();
  const rule = cfg.categories.find((r) => r.key === ruleKey);
  if (!rule) throw new Error("Categoría Devir desconocida: " + ruleKey);
  await attachCategoryMargins([rule]);
  if (!rule.spreeCategoryId) {
    throw new Error("No se pudo asociar " + ruleKey + " con una categoría Spree. Ejecuta pnpm devir:spree:categories.");
  }
  await upsertFields("categories", rule.spreeCategoryId, defs, "Spree::Taxon", {
    "pricing.target_margin": value,
  });
  console.log("Spree: " + (rule.spreeCategoryName ?? ruleKey) + " → margen " + pct(value));
}

async function marginProduct(args: string[]): Promise<void> {
  const [sku, raw] = args;
  const value = Number(raw);
  if (!sku || !Number.isFinite(value) || value < 0 || value >= 0.95) {
    throw new Error("Uso: pnpm devir:spree:margin-product <SKU> <0.25>");
  }
  const defs = await setup();
  const match = (await productIndex()).get(sku);
  if (!match) throw new Error("No existe SKU en Spree: " + sku);
  await upsertFields("products", match.product.id, defs, "Spree::Product", {
    "pricing.target_margin": value,
  });
  console.log("Spree: " + sku + " → override de margen " + pct(value));
}

async function activate(args: string[]): Promise<void> {
  if (!args.length) throw new Error("Uso: pnpm devir:spree:activate <SKU> [SKU...]");
  const index = await productIndex();
  for (const sku of args) {
    const match = index.get(sku);
    if (!match) throw new Error("No existe SKU en Spree: " + sku);
    const fields = await customFields("products", match.product.id);
    const review = String(fields.find((f) => f.key === "devir.review_status")?.value ?? "");
    const reasons = String(fields.find((f) => f.key === "devir.review_reasons")?.value ?? "");
    if (review === "review_required" || (reasons && reasons !== "none")) {
      throw new Error(sku + " sigue requiriendo revisión: " + (reasons || review));
    }
    if (match.product.status === "archived") throw new Error(sku + " está archivado.");
    await request("PATCH", "/products/" + match.product.id, { status: "active" });
    console.log("ACTIVE   " + sku + " — " + match.product.name);
  }
}

async function categories(): Promise<void> {
  const cfg = await pricingConfig();
  await attachCategoryMargins(cfg.categories);
  console.log("Reglas Devir → Spree:");
  for (const rule of cfg.categories) {
    console.log(
      "  " +
        rule.key.padEnd(18) +
        " → " +
        (rule.spreeCategoryName ?? "sin asociación").padEnd(28) +
        " · margen " +
        pct(rule.targetMargin) +
        " · " +
        (rule.marginSource ?? "local/fallback"),
    );
  }
  console.log("Categorías Spree:");
  for (const category of await list<Category>("/categories")) {
    console.log("  " + category.id + " · " + category.name + " · " + (category.permalink ?? ""));
  }
}

async function main(): Promise<void> {
  const [command = "status", ...args] = process.argv.slice(2);
  try {
    if (command === "setup") await setup();
    else if (command === "sync") await sync();
    else if (command === "status") await status();
    else if (command === "margin") await margin(args);
    else if (command === "margin-product") await marginProduct(args);
    else if (command === "activate") await activate(args);
    else if (command === "categories") await categories();
    else throw new Error("Comando desconocido: " + command);
  } catch (error) {
    const hint = scopeHint(error);
    if (hint) console.error("PERMISOS: " + hint);
    if (error instanceof SpreeAdminError) console.error(error.message);
    else console.error(error);
    process.exitCode = 1;
  }
}

main();
