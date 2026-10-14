import { beforeEach, describe, expect, it, vi } from "vitest";
import { getCatalogGtin } from "./seo-identifiers";

const { query, createClient } = vi.hoisted(() => {
  const query = { select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn() };
  return { query, createClient: vi.fn() };
});
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseClient: createClient,
}));

beforeEach(() => {
  vi.resetAllMocks();
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  createClient.mockReturnValue({ from: () => query });
});

describe("catalog SEO identifiers", () => {
  it("looks up only the exact Spree product and displayed variant", async () => {
    query.maybeSingle.mockResolvedValue({
      data: { value: "3665361138648" },
      error: null,
    });
    expect(await getCatalogGtin("prod-1", "variant-1")).toBe("3665361138648");
    expect(query.eq).toHaveBeenCalledWith("namespace", "gtin");
    expect(query.eq).toHaveBeenCalledWith(
      "catalog_variants.spree_variant_id",
      "variant-1",
    );
    expect(query.eq).toHaveBeenCalledWith(
      "catalog_variants.catalog_products.spree_product_id",
      "prod-1",
    );
    expect(query.select).toHaveBeenCalledWith(
      "value,catalog_variants!inner(spree_variant_id,catalog_products!inner(spree_product_id))",
    );
  });

  it.each([
    "DIST-3665361138648",
    "family:gtin:3665361138648",
    "3665361138648:unexpected",
  ])("does not expose a non-GTIN identity %j", async (value) => {
    query.maybeSingle.mockResolvedValue({
      data: { value },
      error: null,
    });
    expect(await getCatalogGtin("prod-1", "variant-1")).toBeUndefined();
  });

  it.each([
    { data: null, error: null },
    { data: null, error: { message: "private details" } },
  ])("keeps products available when there is no usable lookup", async (result) => {
    query.maybeSingle.mockResolvedValue(result);
    expect(await getCatalogGtin("prod-1", "variant-1")).toBeUndefined();
  });

  it("keeps products available when Supabase is not configured", async () => {
    createClient.mockImplementation(() => {
      throw new Error("missing server configuration");
    });
    expect(await getCatalogGtin("prod-1", "variant-1")).toBeUndefined();
  });
});
