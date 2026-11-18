import type { Data } from "@puckeditor/core";
import { describe, expect, it } from "vitest";
import { getHomeProductReadPlan } from "./home-catalog";

const page = (props: Record<string, unknown>): Data => ({
  root: {},
  content: [{ type: "ProductGrid", props: { id: "catalog", ...props } }],
});

describe("home catalog request budget", () => {
  it("loads twelve card summaries for the published twelve-card catalog", () => {
    const params = getHomeProductReadPlan(
      page({ productCount: "12", productFilter: "all" }),
    ).catalog;
    expect(params.limit).toBe(12);
    expect(params.expand).toBeUndefined();
    expect(params.fields).not.toContain("variants");
  });

  it.each([
    { selectedProductIds: ["product-80"] },
    { selectedCategoryIds: ["category-6"] },
    { productFilter: "available" },
  ])("retains the full selection pool for a filtered grid: %j", (filter) => {
    expect(
      getHomeProductReadPlan(page({ productCount: "12", ...filter })).catalog.limit,
    ).toBe(100);
  });

  it.each([
    { selectedVariantIds: ["variant-80"] },
    { variantFilter: "English" },
  ])("loads variants only when an editor selection needs them: %j", (filter) => {
    expect(getHomeProductReadPlan(page(filter)).catalog).toMatchObject({
      limit: 100,
      expand: ["variants"],
    });
  });

  it("uses the largest visible grid, including nested Puck slots and legacy zones", () => {
    const data = page({
      productCount: "4",
      slot: [{ type: "ProductGrid", props: { productCount: "16" } }],
    });
    data.zones = {
      "section:content": [
        { type: "ProductGrid", props: { id: "nested", productCount: "20" } },
      ],
    };
    expect(getHomeProductReadPlan(data).catalog.limit).toBe(20);
  });

  it.each(["sale", "preorder"] as const)(
    "only reads the merchandising lane requested by an editorial grid: %s",
    (productFilter) => {
      expect(getHomeProductReadPlan(page({ productFilter }))).toMatchObject({
        catalog: { limit: 0 },
        sale: productFilter === "sale",
        preorder: productFilter === "preorder",
      });
    },
  );

  it("keeps both lanes available to a product showcase", () => {
    expect(getHomeProductReadPlan({
      root: {},
      content: [{ type: "RealProductShowcase", props: { id: "showcase" } }],
    })).toMatchObject({ catalog: { limit: 0 }, sale: true, preorder: true });
  });

  it("honors the grid's default of eight cards", () => {
    expect(getHomeProductReadPlan(page({}))).toMatchObject({
      catalog: { limit: 8 },
      sale: false,
      preorder: false,
    });
  });
});
