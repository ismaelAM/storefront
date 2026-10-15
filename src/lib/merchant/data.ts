import "server-only";
import type { PaginatedResponse, Product } from "@spree/sdk";
import { isLocaleEnabledForMarket } from "@/i18n/markets";
import { getProductOfferSource } from "@/lib/seo";
import { getClient } from "@/lib/spree/config";
import { createSupabaseClient } from "@/lib/supabase/server";
import { MERCHANT_MAX_PRODUCTS } from "./feed";

type MerchantDataErrorCode =
  | "spree_configuration_unavailable"
  | "market_fetch_failed"
  | "market_missing"
  | "market_currency"
  | "market_tax_inclusive"
  | "market_locale"
  | "catalogue_fetch_failed"
  | "catalogue_count_invalid"
  | "catalogue_empty"
  | "catalogue_limit_5000"
  | "catalogue_duplicate_id"
  | "catalogue_missing_id"
  | "catalogue_incomplete"
  | `pagination_${"count" | "pages" | "page" | "limit" | "from" | "to" | "in" | "next" | "previous" | "rows"}`
  | "identifier_configuration_unavailable"
  | "identifier_lookup_failed"
  | "identifier_ambiguous";

/** Codes are fixed locally; never constructed from SDK/database error text. */
export class MerchantDataError extends Error {
  constructor(public readonly code: MerchantDataErrorCode) {
    super(`Merchant ${code}`);
    this.name = "MerchantDataError";
  }
}

const OPTIONS = { country: "es", locale: "es", currency: "EUR" };
const PAGE_SIZE = 100;
const CONCURRENCY = 4;
const PUBLIC_FIELDS = [
  "id",
  "name",
  "slug",
  "meta_description",
  "description",
  "description_html",
  "price",
  "default_variant_id",
  "default_variant",
  "variants",
  "variant_count",
  "purchasable",
  "in_stock",
  "preorder",
  "preorder_ships_at",
  "backorderable",
  "media",
  "custom_fields",
  "option_types",
  "option_values",
];

/** Guest-only catalogue: no request cookies, customer token, or B2B channel. */
export async function getMerchantCatalog(): Promise<Product[]> {
  let client: ReturnType<typeof getClient>;
  try {
    client = getClient();
  } catch {
    throw new MerchantDataError("spree_configuration_unavailable");
  }
  const { data: markets } = await client.markets.list(OPTIONS).catch(() => {
    throw new MerchantDataError("market_fetch_failed");
  });
  const market = markets.find(
    (entry) =>
      entry.countries?.some((country) => country.iso.toLowerCase() === "es") ||
      entry.country_isos?.some((country) => country.toLowerCase() === "es"),
  );
  if (!market) throw new MerchantDataError("market_missing");
  if (market.currency !== "EUR") throw new MerchantDataError("market_currency");
  if (market.tax_inclusive !== true)
    throw new MerchantDataError("market_tax_inclusive");
  if (!isLocaleEnabledForMarket(market, "es"))
    throw new MerchantDataError("market_locale");
  const read = (page: number) =>
    client.products
      .list(
        {
          page,
          limit: PAGE_SIZE,
          sort: "name",
          fields: PUBLIC_FIELDS,
          expand: [
            "default_variant",
            "variants",
            "media",
            "custom_fields",
            "option_types",
          ],
        },
        OPTIONS,
      )
      .catch(() => {
        throw new MerchantDataError("catalogue_fetch_failed");
      });
  const first = await read(1);
  const count = first.meta.count;
  if (!Number.isSafeInteger(count) || count < 0)
    throw new MerchantDataError("catalogue_count_invalid");
  if (count === 0) throw new MerchantDataError("catalogue_empty");
  if (count > MERCHANT_MAX_PRODUCTS)
    throw new MerchantDataError("catalogue_limit_5000");
  const pages = Math.ceil(count / PAGE_SIZE);
  const products: Product[] = [];
  const ids = new Set<string>();
  function append(response: PaginatedResponse<Product>, page: number) {
    const expectedLength = Math.min(PAGE_SIZE, count - (page - 1) * PAGE_SIZE);
    const expectedMeta = {
      count,
      pages,
      page,
      limit: PAGE_SIZE,
      from: (page - 1) * PAGE_SIZE + 1,
      to: Math.min(page * PAGE_SIZE, count),
      in: expectedLength,
      next: page < pages ? page + 1 : null,
      previous: page > 1 ? page - 1 : null,
    };
    for (const key of [
      "count",
      "pages",
      "page",
      "limit",
      "from",
      "to",
      "in",
      "next",
      "previous",
    ] as const) {
      if (response.meta[key] !== expectedMeta[key])
        throw new MerchantDataError(`pagination_${key}`);
    }
    if (response.data.length !== expectedLength)
      throw new MerchantDataError("pagination_rows");
    for (const product of response.data) {
      if (!product.id) throw new MerchantDataError("catalogue_missing_id");
      if (ids.has(product.id))
        throw new MerchantDataError("catalogue_duplicate_id");
      ids.add(product.id);
      products.push(product);
    }
  }
  append(first, 1);
  for (let start = 2; start <= pages; start += CONCURRENCY) {
    const batchPages = Array.from(
      { length: Math.min(CONCURRENCY, pages - start + 1) },
      (_, offset) => start + offset,
    );
    const batch = await Promise.all(batchPages.map(read));
    batch.forEach((response, index) => {
      append(response, batchPages[index]);
    });
  }
  if (products.length !== count)
    throw new MerchantDataError("catalogue_incomplete");
  return products;
}

/** Public identifiers only. Restrict both the displayed variant and product. */
export async function getMerchantGtins(
  products: Product[],
): Promise<Map<string, string>> {
  const expected = new Map<string, string>();
  for (const product of products) {
    const source = getProductOfferSource(product);
    const variantId =
      source.id === product.id ? product.default_variant_id : source.id;
    if (variantId) expected.set(variantId, product.id);
  }
  const result = new Map<string, string>();
  if (!expected.size) return result;
  let client: ReturnType<typeof createSupabaseClient>;
  try {
    client = createSupabaseClient();
  } catch {
    throw new MerchantDataError("identifier_configuration_unavailable");
  }
  const variantIds = [...expected.keys()];
  for (let start = 0; start < variantIds.length; start += 100) {
    const { data, error } = await Promise.resolve(
      client
        .from("catalog_variant_identifiers")
        .select(
          "value,catalog_variants!inner(spree_variant_id,catalog_products!inner(spree_product_id))",
        )
        .eq("namespace", "gtin")
        .in(
          "catalog_variants.spree_variant_id",
          variantIds.slice(start, start + 100),
        ),
    ).catch(() => {
      throw new MerchantDataError("identifier_lookup_failed");
    });
    if (error || !data) throw new MerchantDataError("identifier_lookup_failed");
    for (const row of data) {
      // Supabase does not infer cardinality from this untyped client.
      const variant = row.catalog_variants as unknown as {
        spree_variant_id?: string;
        catalog_products?: { spree_product_id?: string };
      };
      const id = variant?.spree_variant_id;
      if (
        !id ||
        expected.get(id) !== variant.catalog_products?.spree_product_id ||
        typeof row.value !== "string" ||
        !/^\d+$/.test(row.value)
      )
        continue;
      if (result.has(id) && result.get(id) !== row.value)
        throw new MerchantDataError("identifier_ambiguous");
      result.set(id, row.value);
    }
  }
  return result;
}
