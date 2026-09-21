import { describe, expect, it } from "vitest";
import {
  canWriteManagedCatalogPrice,
  shouldAutoPublishCatalogProduct,
} from "../../supabase/functions/_shared/catalog-publish-policy";

describe("catalog publish policy", () => {
  it("publishes sellable products only when they do not need review", () => {
    expect(
      shouldAutoPublishCatalogProduct({
        review: false,
        availability: "available",
      }),
    ).toBe(true);
    expect(
      shouldAutoPublishCatalogProduct({
        review: false,
        availability: "preorder",
      }),
    ).toBe(true);
    expect(
      shouldAutoPublishCatalogProduct({
        review: true,
        availability: "available",
      }),
    ).toBe(false);
    expect(
      shouldAutoPublishCatalogProduct({
        review: false,
        availability: "unavailable",
      }),
    ).toBe(false);
  });

  it("keeps updating an active managed automatic price", () => {
    expect(
      canWriteManagedCatalogPrice({
        createdVariant: false,
        managed: true,
        forceDraftForSplit: false,
        currentPrice: 19.5,
        lastAutoPrice: 19.5,
      }),
    ).toBe(true);
  });

  it("preserves a manual price override", () => {
    expect(
      canWriteManagedCatalogPrice({
        createdVariant: false,
        managed: true,
        forceDraftForSplit: false,
        currentPrice: 18.99,
        lastAutoPrice: 19.5,
      }),
    ).toBe(false);
  });

  it("can still rewrite price while forcing a supplier pack to draft", () => {
    expect(
      canWriteManagedCatalogPrice({
        createdVariant: false,
        managed: true,
        forceDraftForSplit: true,
        currentPrice: 99,
        lastAutoPrice: 19.5,
      }),
    ).toBe(true);
  });
});
