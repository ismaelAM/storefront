import type { Data } from "@puckeditor/core";
import { describe, expect, it } from "vitest";
import { getHomeCatalogParams } from "./home-catalog";

const page = (props: Record<string, unknown>): Data => ({
  root: {},
  content: [{ type: "ProductGrid", props: { id: "catalog", ...props } }],
});

describe("home catalog request budget", () => {
  it("loads twelve card summaries for the published twelve-card catalog", () => {
    const params = getHomeCatalogParams(
      page({ productCount: "12", productFilter: "all" }),
    );
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
      getHomeCatalogParams(page({ productCount: "12", ...filter })).limit,
    ).toBe(100);
  });

  it.each([
    { selectedVariantIds: ["variant-80"] },
    { variantFilter: "English" },
  ])("loads variants only when an editor selection needs them: %j", (filter) => {
    expect(getHomeCatalogParams(page(filter))).toMatchObject({
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
    expect(getHomeCatalogParams(data).limit).toBe(20);
  });

  it("does not fetch a general catalog for an offer-only page", () => {
    expect(getHomeCatalogParams(page({ productFilter: "sale" })).limit).toBe(0);
  });

  it("honors the grid's default of eight cards", () => {
    expect(getHomeCatalogParams(page({})).limit).toBe(8);
  });
});
