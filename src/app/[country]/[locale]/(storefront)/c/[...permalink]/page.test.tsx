import type { Data } from "@puckeditor/core";
import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CategoryPuckRenderer } from "@/components/puck/CategoryPuckRenderer";
import { PRODUCT_CARD_FIELDS } from "@/lib/data/cached";
import CategoryPage from "./page";

const mocks = vi.hoisted(() => ({
  category: vi.fn(),
  products: vi.fn(),
  page: vi.fn(),
}));
vi.mock("@/lib/data/categories", () => ({
  getCategory: mocks.category,
  getCategoryProducts: mocks.products,
}));
vi.mock("@/lib/data/products", () => ({
  getProduct: vi.fn(),
  getProductFilters: vi.fn(),
}));
vi.mock("@/lib/data/markets", () => ({ resolveCurrency: async () => "EUR" }));
vi.mock("@/lib/metadata/category", () => ({
  generateCategoryMetadata: vi.fn(),
}));
vi.mock("@/lib/puck/get-category-data", () => ({
  getCategoryPageData: mocks.page,
}));
vi.mock("@/lib/store", () => ({ getStoreUrl: () => undefined }));
vi.mock("@/components/puck/CategoryPuckRenderer", () => ({
  CategoryPuckRenderer: () => null,
}));
vi.mock("@/components/products/ProductListing", () => ({
  ProductListing: () => null,
}));
vi.mock("@/components/navigation/Breadcrumbs", () => ({
  Breadcrumbs: () => null,
}));
vi.mock("./CategoryBanner", () => ({ CategoryBanner: () => null }));

const products = Array.from({ length: 8 }, (_, i) => ({ id: `product-${i}` }));
const published = (
  type: string,
  props: Record<string, unknown> = {},
): Data => ({
  root: {},
  content: [{ type, props: { id: "block", ...props } }],
});
async function pageProducts() {
  const tree = await CategoryPage({
    params: Promise.resolve({
      country: "es",
      locale: "es",
      permalink: ["tcg", "mtg"],
    }),
    searchParams: Promise.resolve({}),
  });
  return (tree.props.children as ReactElement<{ products?: unknown }>[]).find(
    (child) => child?.type === CategoryPuckRenderer,
  )?.props.products;
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.category.mockResolvedValue({
    id: "category-1",
    name: "MTG",
    permalink: "tcg/mtg",
  });
  mocks.products.mockResolvedValue({ data: products });
  mocks.page.mockImplementation(
    async (_permalink: string, fallback: Data) => fallback,
  );
});

describe("category Puck product request budget", () => {
  it("skips the unused eight-product request for the CategoryHero fallback", async () => {
    expect(await pageProducts()).toEqual([]);
    expect(mocks.products).not.toHaveBeenCalled();
  });
  it("skips the unused product request for published content without product blocks", async () => {
    mocks.page.mockResolvedValue(published("Text"));
    expect(await pageProducts()).toEqual([]);
    expect(mocks.products).not.toHaveBeenCalled();
  });
  it.each([
    ["ProductGrid", { productFilter: "all", productCount: "20" }],
    ["ProductGrid", { productFilter: "sale" }],
    ["ProductGrid", { productFilter: "preorder" }],
    ["RealProductShowcase", { productPosition: 5 }],
    ["CategoryProductGrid", {}],
  ])("keeps the original eight category products for %s %j", async (type, props) => {
    mocks.page.mockResolvedValue(published(type, props));
    expect(await pageProducts()).toBe(products);
    expect(mocks.products).toHaveBeenCalledExactlyOnceWith("category-1", {
      limit: 8,
      fields: PRODUCT_CARD_FIELDS,
    });
  });
  it.each([
    { selectedVariantIds: ["variant-2"] },
    { variantFilter: "English" },
  ])("includes variants only when grid filters require them: %j", async (props) => {
    mocks.page.mockResolvedValue(published("ProductGrid", props));
    expect(await pageProducts()).toBe(products);
    expect(mocks.products).toHaveBeenCalledExactlyOnceWith("category-1", {
      limit: 8,
      fields: [...PRODUCT_CARD_FIELDS, "variants"],
      expand: ["variants"],
    });
  });
  it("detects product consumers in slots and legacy zones", async () => {
    const data = published("Section", {
      content: [{ type: "RealProductShowcase", props: { productPosition: 3 } }],
    });
    data.zones = {
      "section:content": [
        {
          type: "ProductGrid",
          props: { id: "nested", selectedVariantIds: ["variant-2"] },
        },
      ],
    };
    mocks.page.mockResolvedValue(data);
    expect(await pageProducts()).toBe(products);
    expect(mocks.products).toHaveBeenCalledExactlyOnceWith("category-1", {
      limit: 8,
      fields: [...PRODUCT_CARD_FIELDS, "variants"],
      expand: ["variants"],
    });
  });
  it("does not expand variants for product or category selections and blank variant filters", async () => {
    mocks.page.mockResolvedValue(
      published("ProductGrid", {
        selectedProductIds: ["product-2"],
        selectedCategoryIds: ["category-1"],
        selectedVariantIds: [],
        variantFilter: "  ",
      }),
    );
    await pageProducts();
    expect(mocks.products).toHaveBeenCalledExactlyOnceWith("category-1", {
      limit: 8,
      fields: PRODUCT_CARD_FIELDS,
    });
  });
});
