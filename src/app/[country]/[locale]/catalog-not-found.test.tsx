import { SpreeError } from "@spree/sdk";
import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  product: vi.fn(),
  category: vi.fn(),
  wholesaleProduct: vi.fn(),
  legacyProductId: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_HTTP_ERROR_FALLBACK;404");
  },
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT;${url}`);
  },
}));
vi.mock("@/lib/data/cached", () => ({
  getCachedProduct: mocks.product,
  getCachedCategory: mocks.category,
  PRODUCT_PAGE_EXPAND: [],
  PRODUCT_METADATA_EXPAND: [],
}));
vi.mock("@/lib/data/categories", () => ({
  getCategory: mocks.category,
  cachedGetCategory: mocks.category,
  getCategoryProducts: vi.fn(),
}));
vi.mock("@/lib/data/products", () => ({
  cachedGetProduct: mocks.product,
  getProductFilters: vi.fn(),
}));
vi.mock("@/lib/data/wholesale", () => ({
  getWholesaleProduct: mocks.wholesaleProduct,
}));
vi.mock("@/lib/catalog/legacy-product", () => ({
  getLegacyGroupedSpreeProductId: mocks.legacyProductId,
}));
vi.mock("@/lib/catalog/seo-identifiers", () => ({ getCatalogGtin: vi.fn() }));
vi.mock("@/lib/data/markets", () => ({ resolveCurrency: vi.fn() }));
vi.mock("@/lib/spree", () => ({ DEFAULT_SURFACE: "dtc" }));
vi.mock("@/lib/store", () => ({
  getStoreUrl: () => undefined,
  getStoreName: () => "BisonTCG",
}));
vi.mock("@/lib/metadata/alternates", () => ({
  translationFingerprint: () => "fingerprint",
}));
vi.mock("@/lib/puck/get-product-data", () => ({ getProductPageData: vi.fn() }));
vi.mock("@/lib/puck/get-category-data", () => ({
  getCategoryPageData: vi.fn(),
}));
vi.mock("@/components/navigation/Breadcrumbs", () => ({
  Breadcrumbs: () => null,
}));
vi.mock("@/components/puck/ProductPuckRenderer", () => ({
  ProductPuckRenderer: () => null,
}));
vi.mock("@/components/puck/CategoryPuckRenderer", () => ({
  CategoryPuckRenderer: () => null,
}));
vi.mock("@/components/products/ProductListing", () => ({
  ProductListing: () => null,
}));
vi.mock("./(storefront)/products/[slug]/ProductDetails", () => ({
  ProductDetails: () => null,
}));
vi.mock("./(storefront)/c/[...permalink]/CategoryBanner", () => ({
  CategoryBanner: () => null,
}));
vi.mock("./(wholesale)/wholesale/_components/WholesaleGate", () => ({
  WholesaleGate: () => null,
}));

import ProductPage from "./(storefront)/products/[slug]/page";
import CategoryPage from "./(storefront)/c/[...permalink]/page";
import WholesaleProductPage from "./(wholesale)/wholesale/products/[slug]/page";
import { generateProductMetadata } from "@/lib/metadata/product";
import { generateCategoryMetadata } from "@/lib/metadata/category";

function spreeError(status: number) {
  return new SpreeError(
    { error: { code: "record_not_found", message: "Store API response" } },
    status,
  );
}

const productParams = { country: "es", locale: "es", slug: "retired-product" };
const categoryParams = {
  country: "es",
  locale: "es",
  permalink: ["retired-category"],
};

async function renderWholesaleProduct() {
  const gate = await WholesaleProductPage({
    params: Promise.resolve(productParams),
  });
  const content = gate.props.children() as ReactElement<{
    country: string;
    locale: string;
    slug: string;
  }>;
  return (content.type as (props: typeof productParams) => Promise<unknown>)(
    content.props,
  );
}

const routes = [
  {
    name: "product",
    fetch: mocks.product,
    render: () =>
      ProductPage({
        params: Promise.resolve(productParams),
        searchParams: Promise.resolve({}),
      }),
  },
  {
    name: "category",
    fetch: mocks.category,
    render: () =>
      CategoryPage({
        params: Promise.resolve(categoryParams),
        searchParams: Promise.resolve({}),
      }),
  },
  {
    name: "wholesale product",
    fetch: mocks.wholesaleProduct,
    render: renderWholesaleProduct,
  },
];

beforeEach(() => {
  vi.resetAllMocks();
});

describe.each(routes)("missing $name route", ({ fetch, render }) => {
  it.each([
    spreeError(404),
    { status: 404, code: "record_not_found" },
  ])("returns the Next 404 for a Store API not-found, including a normalized cache error", async (error) => {
    fetch.mockRejectedValue(error);
    await expect(render()).rejects.toThrow("NEXT_HTTP_ERROR_FALLBACK;404");
  });

  it.each([
    spreeError(500),
    spreeError(401),
    spreeError(403),
    new TypeError("fetch failed"),
  ])("preserves non-404 Store API and transport errors", async (error) => {
    fetch.mockRejectedValue(error);
    await expect(render()).rejects.toBe(error);
  });
});

describe("legacy grouped product links", () => {
  it("preserves the replacement redirect and category context", async () => {
    mocks.product
      .mockRejectedValueOnce(spreeError(404))
      .mockResolvedValueOnce({ slug: "manga" });
    await expect(
      ProductPage({
        params: Promise.resolve({ ...productParams, slug: "manga-tomo-1" }),
        searchParams: Promise.resolve({ category_id: "category/1" }),
      }),
    ).rejects.toThrow(
      "NEXT_REDIRECT;/es/es/products/manga?category_id=category%2F1",
    );
  });

  it("preserves a replacement product outage instead of treating it as another retired link", async () => {
    const error = spreeError(500);
    mocks.product
      .mockRejectedValueOnce(spreeError(404))
      .mockRejectedValueOnce(error);
    await expect(
      ProductPage({
        params: Promise.resolve({ ...productParams, slug: "manga-tomo-1" }),
        searchParams: Promise.resolve({}),
      }),
    ).rejects.toBe(error);
  });
});

describe.each([
  {
    name: "product",
    fetch: mocks.product,
    generate: () => generateProductMetadata(productParams),
    title: "Product Not Found",
  },
  {
    name: "category",
    fetch: mocks.category,
    generate: () => generateCategoryMetadata(categoryParams),
    title: "Category Not Found",
  },
])("missing $name metadata", ({ fetch, generate, title }) => {
  it("keeps the existing not-found title for a real 404", async () => {
    fetch.mockRejectedValue(spreeError(404));
    await expect(generate()).resolves.toEqual({ title });
  });

  it.each([
    spreeError(500),
    spreeError(401),
    spreeError(403),
    new TypeError("fetch failed"),
  ])("preserves non-404 failures during metadata generation", async (error) => {
    fetch.mockRejectedValue(error);
    await expect(generate()).rejects.toBe(error);
  });
});
