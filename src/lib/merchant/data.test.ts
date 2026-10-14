import type { Market, Product } from "@spree/sdk";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getMerchantCatalog, getMerchantGtins } from "./data";

const mocks = vi.hoisted(() => ({
  markets: vi.fn(),
  products: vi.fn(),
  from: vi.fn(),
  select: vi.fn(),
  eq: vi.fn(),
  in: vi.fn(),
}));
vi.mock("@/lib/spree/config", () => ({
  getClient: () => ({
    markets: { list: mocks.markets },
    products: { list: mocks.products },
  }),
}));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseClient: () => ({ from: mocks.from }),
}));
const market = {
  id: "market-es",
  currency: "EUR",
  tax_inclusive: true,
  default_locale: "es",
  supported_locales: ["es"],
  countries: [{ iso: "ES" }],
} as Market;
function page(pageNumber: number, count: number, ids?: string[]) {
  const pages = Math.ceil(count / 100);
  const length = Math.min(100, count - (pageNumber - 1) * 100);
  return {
    data: (
      ids ?? Array.from({ length }, (_, i) => `p-${(pageNumber - 1) * 100 + i}`)
    ).map((id) => ({ id })),
    meta: {
      page: pageNumber,
      limit: 100,
      count,
      pages,
      in: length,
      from: (pageNumber - 1) * 100 + 1,
      to: Math.min(pageNumber * 100, count),
      previous: pageNumber > 1 ? pageNumber - 1 : null,
      next: pageNumber < pages ? pageNumber + 1 : null,
    },
  };
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.markets.mockResolvedValue({ data: [market] });
  mocks.products.mockImplementation(({ page: p }) =>
    Promise.resolve(page(p, 203)),
  );
  mocks.from.mockReturnValue(mocks);
  mocks.select.mockReturnValue(mocks);
  mocks.eq.mockReturnValue(mocks);
  mocks.in.mockResolvedValue({ data: [], error: null });
});

describe("public Merchant catalogue", () => {
  it("collects every public product with ES/es/EUR options and no user token", async () => {
    const products = await getMerchantCatalog();
    expect(products).toHaveLength(203);
    expect(products[202].id).toBe("p-202");
    for (const [params, options] of mocks.products.mock.calls) {
      expect(options).toEqual({ country: "es", locale: "es", currency: "EUR" });
      expect(params.limit).toBe(100);
      expect(params.expand).not.toContain("categories");
      expect(params.fields).not.toContain("cost_price");
    }
  });
  it.each([
    { data: [] },
    { data: [{ ...market, currency: "USD" }] },
    { data: [{ ...market, tax_inclusive: false }] },
    { data: [{ ...market, default_locale: "en", supported_locales: ["en"] }] },
  ])("rejects unavailable or incompatible ES markets: %j", async ({ data }) => {
    mocks.markets.mockResolvedValue({ data });
    await expect(getMerchantCatalog()).rejects.toThrow(/market/i);
  });
  it("rejects a catalogue beyond 5,000 products", async () => {
    mocks.products.mockResolvedValue(page(1, 5001));
    await expect(getMerchantCatalog()).rejects.toThrow(/5,000|5000/);
  });
  it("rejects a failed catalogue page", async () => {
    mocks.products.mockImplementation(({ page: p }) =>
      p === 2
        ? Promise.reject(new Error("backend failed"))
        : Promise.resolve(page(p, 203)),
    );
    await expect(getMerchantCatalog()).rejects.toThrow();
  });
  it.each([
    "changed-count",
    "short-page",
    "duplicate-id",
    "wrong-page",
    "wrong-range",
  ])("rejects inconsistent pagination: %s", async (scenario) => {
    mocks.products.mockImplementation(({ page: p }) => {
      const response = page(p, 203);
      if (p === 2) {
        if (scenario === "changed-count") response.meta.count = 202;
        if (scenario === "short-page") response.data.pop();
        if (scenario === "duplicate-id") response.data[0].id = "p-0";
        if (scenario === "wrong-page") response.meta.page = 1;
        if (scenario === "wrong-range") response.meta.from = 1;
      }
      return Promise.resolve(response);
    });
    await expect(getMerchantCatalog()).rejects.toThrow(
      /catalogue|pagination|duplicate/i,
    );
  });
  it("never has more than four product pages in flight", async () => {
    let active = 0;
    let maximum = 0;
    mocks.products.mockImplementation(async ({ page: p }) => {
      active += 1;
      maximum = Math.max(maximum, active);
      await new Promise((resolve) => setTimeout(resolve, 1));
      active -= 1;
      return page(p, 5000);
    });
    expect(await getMerchantCatalog()).toHaveLength(5000);
    expect(maximum).toBeLessThanOrEqual(4);
  });
});

describe("public catalogue GTIN enrichment", () => {
  const product = (id: string, variant: string) =>
    ({
      id,
      default_variant_id: variant,
      default_variant: { id: variant },
    }) as Product;
  it("returns only exact product/initial-variant matches from the GTIN namespace", async () => {
    mocks.in.mockResolvedValue({
      data: [
        {
          value: "3665361138648",
          catalog_variants: {
            spree_variant_id: "v-1",
            catalog_products: { spree_product_id: "p-1" },
          },
        },
        {
          value: "WRONG-PRODUCT",
          catalog_variants: {
            spree_variant_id: "v-2",
            catalog_products: { spree_product_id: "someone-else" },
          },
        },
      ],
      error: null,
    });
    expect(
      await getMerchantGtins([product("p-1", "v-1"), product("p-2", "v-2")]),
    ).toEqual(new Map([["v-1", "3665361138648"]]));
    expect(mocks.from).toHaveBeenCalledWith("catalog_variant_identifiers");
    expect(mocks.eq).toHaveBeenCalledWith("namespace", "gtin");
    expect(mocks.select).toHaveBeenCalledWith(
      "value,catalog_variants!inner(spree_variant_id,catalog_products!inner(spree_product_id))",
    );
  });
  it("bounds identifier queries to 100 displayed variant IDs each", async () => {
    await getMerchantGtins(
      Array.from({ length: 203 }, (_, i) => product(`p-${i}`, `v-${i}`)),
    );
    expect(mocks.in.mock.calls.map(([, ids]) => ids.length)).toEqual([
      100, 100, 3,
    ]);
  });
  it("propagates lookup failure instead of silently removing existing GTINs", async () => {
    mocks.in.mockResolvedValue({
      data: null,
      error: { message: "private upstream error" },
    });
    await expect(getMerchantGtins([product("p-1", "v-1")])).rejects.toThrow(
      /identifier/i,
    );
  });

  it("omits non-GTIN namespaces/values and rejects conflicting identifiers", async () => {
    mocks.in.mockResolvedValueOnce({
      data: [
        {
          value: "family:3665361138648",
          catalog_variants: {
            spree_variant_id: "v-1",
            catalog_products: { spree_product_id: "p-1" },
          },
        },
      ],
      error: null,
    });
    expect(await getMerchantGtins([product("p-1", "v-1")])).toEqual(new Map());
    mocks.in.mockResolvedValueOnce({
      data: ["3665361138648", "9784088834102"].map((value) => ({
        value,
        catalog_variants: {
          spree_variant_id: "v-1",
          catalog_products: { spree_product_id: "p-1" },
        },
      })),
      error: null,
    });
    await expect(getMerchantGtins([product("p-1", "v-1")])).rejects.toThrow(
      /ambiguous/,
    );
  });
});
