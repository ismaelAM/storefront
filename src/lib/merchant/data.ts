import "server-only";
import type { PaginatedResponse, Product } from "@spree/sdk";
import { isLocaleEnabledForMarket } from "@/i18n/markets";
import { getProductOfferSource } from "@/lib/seo";
import { getClient } from "@/lib/spree/config";
import { createSupabaseClient } from "@/lib/supabase/server";
import { MERCHANT_MAX_PRODUCTS } from "./feed";

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
  const client = getClient();
  const { data: markets } = await client.markets.list(OPTIONS);
  const market = markets.find(
    (entry) =>
      entry.countries?.some((country) => country.iso.toLowerCase() === "es") ||
      entry.country_isos?.some((country) => country.toLowerCase() === "es"),
  );
  if (
    market?.currency !== "EUR" ||
    market.tax_inclusive !== true ||
    !isLocaleEnabledForMarket(market, "es")
  ) {
    throw new Error(
      "Merchant ES market must support Spanish and VAT-inclusive EUR prices.",
    );
  }
  const read = (page: number) =>
    client.products.list(
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
    );
  const first = await read(1);
  const count = first.meta.count;
  if (
    !Number.isSafeInteger(count) ||
    count < 1 ||
    count > MERCHANT_MAX_PRODUCTS
  ) {
    throw new Error("Merchant catalogue must contain 1–5,000 products.");
  }
  const pages = Math.ceil(count / PAGE_SIZE);
  const products: Product[] = [];
  const ids = new Set<string>();
  function append(response: PaginatedResponse<Product>, page: number) {
    const expectedLength = Math.min(PAGE_SIZE, count - (page - 1) * PAGE_SIZE);
    if (
      response.meta.count !== count ||
      response.meta.pages !== pages ||
      response.meta.page !== page ||
      response.meta.limit !== PAGE_SIZE ||
      response.meta.from !== (page - 1) * PAGE_SIZE + 1 ||
      response.meta.to !== Math.min(page * PAGE_SIZE, count) ||
      response.meta.in !== expectedLength ||
      response.data.length !== expectedLength ||
      response.meta.next !== (page < pages ? page + 1 : null) ||
      response.meta.previous !== (page > 1 ? page - 1 : null)
    ) {
      throw new Error(
        "Merchant catalogue pagination changed or is incomplete.",
      );
    }
    for (const product of response.data) {
      if (!product.id || ids.has(product.id))
        throw new Error(
          "Duplicate or missing Merchant catalogue product identity.",
        );
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
    throw new Error("Merchant catalogue is incomplete.");
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
  const client = createSupabaseClient();
  const variantIds = [...expected.keys()];
  for (let start = 0; start < variantIds.length; start += 100) {
    const { data, error } = await client
      .from("catalog_variant_identifiers")
      .select(
        "value,catalog_variants!inner(spree_variant_id,catalog_products!inner(spree_product_id))",
      )
      .eq("namespace", "gtin")
      .in(
        "catalog_variants.spree_variant_id",
        variantIds.slice(start, start + 100),
      );
    if (error || !data)
      throw new Error("Merchant catalogue identifier lookup failed.");
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
        throw new Error("Merchant catalogue identifier is ambiguous.");
      result.set(id, row.value);
    }
  }
  return result;
}
