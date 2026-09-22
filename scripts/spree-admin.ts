import { loadLocalEnv } from "./load-local-env";

loadLocalEnv();

export interface ListResponse<T> {
  data: T[];
  meta?: {
    page?: number;
    pages?: number;
    count?: number;
    total_count?: number;
  };
}

export interface CustomFieldDefinition {
  id: string;
  namespace: string;
  key: string;
  label: string;
  field_type: string;
  resource_type: string;
  storefront_visible: boolean;
}

export interface CustomField {
  id: string;
  key: string;
  value: unknown;
  custom_field_definition_id: string;
}

export interface Category {
  id: string;
  name: string;
  permalink?: string;
  depth?: number;
}

export interface Variant {
  id: string;
  sku?: string | null;
  cost_price?: string | number | null;
  cost_currency?: string | null;
  price?:
    | { amount?: string | number | null; currency?: string | null }
    | string
    | number
    | null;
  prices?: Array<{ amount?: string | number | null; currency?: string | null }>;
}

export interface Product {
  id: string;
  name: string;
  status?: string;
  tags?: string[];
}

export interface PricingRuleLike {
  key: string;
  label: string;
  match?: string[];
  targetMargin: number | null;
  marginSource?: string;
  spreeCategoryId?: string;
  spreeCategoryName?: string;
}

export class SpreeAdminError extends Error {
  constructor(
    public status: number,
    public path: string,
    public payload: unknown,
  ) {
    super(
      "Spree Admin API " +
        status +
        " en " +
        path +
        ": " +
        JSON.stringify(payload),
    );
    this.name = "SpreeAdminError";
  }
}

const MASKED_ENV_VALUES = new Set([
  "[SENSITIVE]",
  "[REDACTED]",
  "********",
  "*****",
]);

function usableEnv(name: string, fallbacks: string[] = []): string | null {
  for (const candidate of [name, ...fallbacks]) {
    const value = process.env[candidate]?.trim();
    if (value && !MASKED_ENV_VALUES.has(value.toUpperCase())) return value;
  }
  return null;
}

function config(): { baseUrl: string; key: string } {
  const rawBaseUrl =
    usableEnv("SPREE_API_URL", ["DEVIR_B2B_SPREE_API_URL"]) ??
    "https://bisontcg.spree.sh";
  let parsed: URL;
  try {
    parsed = new URL(rawBaseUrl);
  } catch {
    throw new Error(
      "SPREE_API_URL no es una URL válida. Si Vercel la descargó como [SENSITIVE], el importador usará automáticamente https://bisontcg.spree.sh; elimina cualquier valor local inválido.",
    );
  }
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("SPREE_API_URL debe usar http:// o https://.");
  }

  const key = usableEnv("DEVIR_B2B_SPREE_ADMIN_API_KEY", [
    "SPREE_ADMIN_API_KEY",
  ]);
  if (!key) {
    throw new Error(
      "No hay una Secret API Key de Spree utilizable. Vercel puede haber descargado [SENSITIVE] en .env.local; una variable Sensitive no se puede recuperar con env pull. Configura DEVIR_B2B_SPREE_ADMIN_API_KEY para Development como valor recuperable o inyéctala como Codespaces secret.",
    );
  }
  if (!key.startsWith("sk_")) {
    throw new Error(
      "La clave Admin de Spree debe ser una Secret API Key (sk_...), no una publishable key.",
    );
  }
  return { baseUrl: parsed.toString().replace(/\/$/, ""), key };
}

export async function request<T>(
  method: "GET" | "POST" | "PATCH" | "DELETE",
  path: string,
  body?: unknown,
): Promise<T> {
  const { baseUrl, key } = config();
  const response = await fetch(baseUrl + "/api/v3/admin" + path, {
    method,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-Spree-Api-Key": key,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await response.text();
  let payload: unknown = null;
  if (text) {
    try {
      payload = JSON.parse(text) as unknown;
    } catch {
      payload = text;
    }
  }
  if (!response.ok) throw new SpreeAdminError(response.status, path, payload);
  return payload as T;
}

export async function list<T>(path: string): Promise<T[]> {
  const result: T[] = [];
  for (let page = 1; page <= 1000; page += 1) {
    const sep = path.includes("?") ? "&" : "?";
    const response = await request<ListResponse<T>>(
      "GET",
      path + sep + "page=" + page + "&limit=100",
    );
    const batch = response.data ?? [];
    result.push(...batch);
    const pages = response.meta?.pages ?? page;
    if (!batch.length || page >= pages) break;
  }
  return result;
}

type FieldType = "short_text" | "long_text" | "number" | "boolean";
interface FieldSpec {
  namespace: string;
  key: string;
  label: string;
  fieldType: FieldType;
  resourceType: "Spree::Product" | "Spree::Taxon";
}

export const PRODUCT_FIELDS: FieldSpec[] = [
  {
    namespace: "sourcing",
    key: "variant_provenance",
    label: "Compras · Procedencia por variante",
    fieldType: "long_text",
    resourceType: "Spree::Product",
  },
  {
    namespace: "devir",
    key: "supplier_sku",
    label: "Devir · SKU proveedor",
    fieldType: "short_text",
    resourceType: "Spree::Product",
  },
  {
    namespace: "devir",
    key: "source_url",
    label: "Devir · URL origen",
    fieldType: "short_text",
    resourceType: "Spree::Product",
  },
  {
    namespace: "devir",
    key: "category_key",
    label: "Devir · Categoría detectada",
    fieldType: "short_text",
    resourceType: "Spree::Product",
  },
  {
    namespace: "devir",
    key: "availability",
    label: "Devir · Disponibilidad",
    fieldType: "short_text",
    resourceType: "Spree::Product",
  },
  {
    namespace: "devir",
    key: "release_date",
    label: "Devir · Fecha de venta",
    fieldType: "short_text",
    resourceType: "Spree::Product",
  },
  {
    namespace: "devir",
    key: "review_status",
    label: "Devir · Estado revisión",
    fieldType: "short_text",
    resourceType: "Spree::Product",
  },
  {
    namespace: "devir",
    key: "review_reasons",
    label: "Devir · Motivos revisión",
    fieldType: "long_text",
    resourceType: "Spree::Product",
  },
  {
    namespace: "devir",
    key: "last_sync_at",
    label: "Devir · Última sincronización",
    fieldType: "short_text",
    resourceType: "Spree::Product",
  },
  {
    namespace: "pricing",
    key: "target_margin",
    label: "Pricing · Margen objetivo (override)",
    fieldType: "number",
    resourceType: "Spree::Product",
  },
  {
    namespace: "pricing",
    key: "applied_margin",
    label: "Pricing · Margen aplicado",
    fieldType: "number",
    resourceType: "Spree::Product",
  },
  {
    namespace: "pricing",
    key: "effective_margin",
    label: "Pricing · Margen efectivo",
    fieldType: "number",
    resourceType: "Spree::Product",
  },
  {
    namespace: "pricing",
    key: "rule_source",
    label: "Pricing · Regla aplicada",
    fieldType: "short_text",
    resourceType: "Spree::Product",
  },
  {
    namespace: "pricing",
    key: "vat_rate",
    label: "Pricing · IVA aplicado",
    fieldType: "number",
    resourceType: "Spree::Product",
  },
  {
    namespace: "pricing",
    key: "cost_includes_vat",
    label: "Pricing · Coste incluye IVA",
    fieldType: "boolean",
    resourceType: "Spree::Product",
  },
  {
    namespace: "pricing",
    key: "last_synced_price",
    label: "Pricing · Último PVP automático",
    fieldType: "number",
    resourceType: "Spree::Product",
  },
  {
    namespace: "pricing",
    key: "manual_price_override",
    label: "Pricing · PVP editado manualmente",
    fieldType: "boolean",
    resourceType: "Spree::Product",
  },
];

export const CATEGORY_FIELDS: FieldSpec[] = [
  {
    namespace: "pricing",
    key: "target_margin",
    label: "Pricing · Margen objetivo",
    fieldType: "number",
    resourceType: "Spree::Taxon",
  },
];

function fieldKey(spec: Pick<FieldSpec, "namespace" | "key">): string {
  return spec.namespace + "." + spec.key;
}

export async function ensureFields(): Promise<
  Map<string, CustomFieldDefinition>
> {
  const defs = await list<CustomFieldDefinition>("/custom_field_definitions");
  const map = new Map<string, CustomFieldDefinition>(
    defs.map((d) => [d.resource_type + ":" + d.namespace + "." + d.key, d]),
  );
  for (const spec of [...PRODUCT_FIELDS, ...CATEGORY_FIELDS]) {
    const key = spec.resourceType + ":" + fieldKey(spec);
    const legacy =
      spec.resourceType === "Spree::Taxon"
        ? map.get("Spree::Category:" + fieldKey(spec))
        : undefined;
    if (map.has(key) || legacy) {
      if (legacy) map.set(key, legacy);
      continue;
    }
    let created: CustomFieldDefinition;
    try {
      created = await request<CustomFieldDefinition>(
        "POST",
        "/custom_field_definitions",
        {
          namespace: spec.namespace,
          key: spec.key,
          label: spec.label,
          field_type: spec.fieldType,
          resource_type: spec.resourceType,
          storefront_visible: false,
        },
      );
    } catch (error) {
      if (
        !(error instanceof SpreeAdminError) ||
        error.status !== 422 ||
        spec.resourceType !== "Spree::Taxon"
      )
        throw error;
      created = await request<CustomFieldDefinition>(
        "POST",
        "/custom_field_definitions",
        {
          namespace: spec.namespace,
          key: spec.key,
          label: spec.label,
          field_type: spec.fieldType,
          resource_type: "Spree::Category",
          storefront_visible: false,
        },
      );
    }
    map.set(key, created);
    console.log("Spree: creado campo interno " + key);
  }
  return map;
}

export async function customFields(
  parent: "products" | "categories",
  id: string,
): Promise<CustomField[]> {
  const response = await request<ListResponse<CustomField>>(
    "GET",
    "/" + parent + "/" + encodeURIComponent(id) + "/custom_fields?limit=100",
  );
  return response.data ?? [];
}

export async function upsertFields(
  parent: "products" | "categories",
  id: string,
  definitions: Map<string, CustomFieldDefinition>,
  resourceType: "Spree::Product" | "Spree::Taxon",
  values: Record<string, unknown>,
  existing?: CustomField[],
): Promise<void> {
  const current = existing ?? (await customFields(parent, id));
  const byKey = new Map(current.map((field) => [field.key, field]));
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined || value === null || value === "") continue;
    const def = definitions.get(resourceType + ":" + key);
    if (!def)
      throw new Error(
        "No existe definición interna " + resourceType + ":" + key,
      );
    const old = byKey.get(key);
    if (old) {
      if (String(old.value) !== String(value)) {
        await request(
          "PATCH",
          "/" + parent + "/" + id + "/custom_fields/" + old.id,
          { value },
        );
      }
    } else {
      const created = await request<CustomField>(
        "POST",
        "/" + parent + "/" + id + "/custom_fields",
        {
          custom_field_definition_id: def.id,
          value,
        },
      );
      byKey.set(key, created);
    }
  }
}

export function numberField(fields: CustomField[], key: string): number | null {
  const raw = fields.find((f) => f.key === key)?.value;
  if (raw === undefined || raw === null || raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

export function boolField(fields: CustomField[], key: string): boolean | null {
  const raw = fields.find((f) => f.key === key)?.value;
  if (raw === undefined || raw === null || raw === "") return null;
  if (typeof raw === "boolean") return raw;
  const v = String(raw).toLowerCase();
  if (["true", "t", "1", "yes"].includes(v)) return true;
  if (["false", "f", "0", "no"].includes(v)) return false;
  return null;
}

export function variantPrice(
  variant: Variant,
  currency = "EUR",
): number | null {
  if (typeof variant.price === "number") return variant.price;
  if (typeof variant.price === "string") {
    const n = Number(variant.price);
    return Number.isFinite(n) ? n : null;
  }
  if (variant.price && typeof variant.price === "object") {
    const n = Number(variant.price.amount);
    if (Number.isFinite(n)) return n;
  }
  const p =
    variant.prices?.find(
      (x) => x.currency?.toUpperCase() === currency.toUpperCase(),
    ) ?? variant.prices?.[0];
  const n = Number(p?.amount);
  return Number.isFinite(n) ? n : null;
}

export async function productIndex(): Promise<
  Map<string, { product: Product; variant: Variant }>
> {
  const result = new Map<string, { product: Product; variant: Variant }>();
  for (const product of await list<Product>("/products")) {
    const variants = await request<ListResponse<Variant>>(
      "GET",
      "/products/" + encodeURIComponent(product.id) + "/variants?limit=100",
    );
    for (const variant of variants.data ?? []) {
      const sku = variant.sku?.trim();
      if (!sku) continue;
      if (result.has(sku)) throw new Error("SKU duplicado en Spree: " + sku);
      result.set(sku, { product, variant });
    }
  }
  return result;
}

function norm(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function categoryScore(rule: PricingRuleLike, category: Category): number {
  const name = norm(category.name);
  const label = norm(rule.label);
  const permalink = norm(category.permalink ?? "");
  if (name === label) return 1000;
  if (name.includes(label) || label.includes(name)) return 500;
  let score = 0;
  for (const raw of rule.match ?? []) {
    const needle = norm(raw);
    if (!needle) continue;
    if (name === needle) score = Math.max(score, 400);
    else if (name.includes(needle)) score = Math.max(score, 250);
    else if (permalink.includes(needle)) score = Math.max(score, 150);
  }
  return score + Math.min(category.depth ?? 0, 20);
}

export async function attachCategoryMargins<T extends PricingRuleLike>(
  rules: T[],
): Promise<T[]> {
  let categories: Category[];
  try {
    categories = await list<Category>("/categories");
  } catch (error) {
    if (error instanceof SpreeAdminError && [403, 404].includes(error.status))
      return rules;
    throw error;
  }
  for (const rule of rules) {
    const ranked = categories
      .map((category) => ({ category, score: categoryScore(rule, category) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score);
    if (!ranked.length || (ranked[1] && ranked[0].score === ranked[1].score))
      continue;
    const category = ranked[0].category;
    rule.spreeCategoryId = category.id;
    rule.spreeCategoryName = category.name;
    try {
      const margin = numberField(
        await customFields("categories", category.id),
        "pricing.target_margin",
      );
      if (margin !== null && margin >= 0 && margin < 0.95) {
        rule.targetMargin = margin;
        rule.marginSource = "spree_category:" + category.id;
      }
    } catch (error) {
      if (
        !(error instanceof SpreeAdminError) ||
        ![403, 404].includes(error.status)
      )
        throw error;
    }
  }
  return rules;
}

export function scopeHint(error: unknown): string | null {
  if (!(error instanceof SpreeAdminError) || error.status !== 403) return null;
  if (error.path.includes("custom_field_definitions")) {
    return "La Secret API Key necesita write_settings para crear los campos internos de Devir/Pricing.";
  }
  return "La Secret API Key necesita write_products para crear/actualizar borradores y acceso de lectura a products/categories.";
}
