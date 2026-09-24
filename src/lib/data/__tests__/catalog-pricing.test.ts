import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ token: vi.fn(), list: vi.fn(), get: vi.fn(), filters: vi.fn() }));
vi.mock("next/cache", () => ({ cacheLife: vi.fn(), cacheTag: vi.fn() }));
vi.mock("@/lib/spree", () => ({
  DEFAULT_SURFACE: "dtc",
  cacheTagSuffix: (surface: string) => surface === "wholesale" ? "-wholesale" : "",
  getAccessToken: mocks.token,
  getLocaleOptions: async () => ({ country: "es", locale: "es" }),
  getClientForSurface: () => ({ products: { list: mocks.list, get: mocks.get, filters: mocks.filters } }),
  getClient: () => ({ products: { list: mocks.list } }),
}));

import { getProduct, getProductFilters, getProducts } from "../products";
import { getCategoryProducts } from "../categories";

describe("customer-specific catalog pricing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.list.mockImplementation(async (_params, options) => ({ data: [{ price: options.token ? "70.00" : "100.00" }] }));
    mocks.get.mockImplementation(async (_id, _params, options) => ({ price: options.token ? "70.00" : "100.00" }));
    mocks.filters.mockImplementation(async (_params, options) => ({ min_price: options.token ? "70.00" : "100.00" }));
  });

  it.each(["dtc", "wholesale"] as const)("uses authenticated prices for %s lists and details", async (surface) => {
    mocks.token.mockResolvedValue("customer-jwt");
    expect(await getProducts(undefined, surface)).toMatchObject({ data: [{ price: "70.00" }] });
    expect(await getProduct("product-1", undefined, surface)).toMatchObject({ price: "70.00" });
    expect(await getProductFilters(undefined, surface)).toMatchObject({ min_price: "70.00" });
  });

  it("uses the same customer prices within categories", async () => {
    mocks.token.mockResolvedValue("customer-jwt");
    expect(await getCategoryProducts("category-1")).toMatchObject({ data: [{ price: "70.00" }] });
    expect(mocks.list).toHaveBeenCalledWith({ in_category: "category-1" }, { country: "es", locale: "es", token: "customer-jwt" });
  });

  it("keeps guest catalog requests anonymous", async () => {
    mocks.token.mockResolvedValue(undefined);
    expect(await getProducts()).toMatchObject({ data: [{ price: "100.00" }] });
    expect(await getProduct("product-1")).toMatchObject({ price: "100.00" });
    expect(await getProductFilters()).toMatchObject({ min_price: "100.00" });
    expect(await getCategoryProducts("category-1")).toMatchObject({ data: [{ price: "100.00" }] });
    expect(mocks.list).toHaveBeenLastCalledWith({ in_category: "category-1" }, { country: "es", locale: "es" });
  });
});
