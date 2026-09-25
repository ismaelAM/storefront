import { describe, expect, it } from "vitest";
import {
  canWriteManagedCatalogPrice,
  catalogReviewFingerprint,
  effectiveCatalogFulfillmentMode,
  isCatalogReviewApproved,
  shouldAllowSupplierBackorder,
  shouldAutoPublishCatalogProduct,
  shouldListCatalogProduct,
  shouldRequireCatalogReview,
} from "../../supabase/functions/_shared/catalog-publish-policy";

describe("catalog publish policy", () => {
  it("keeps approval when already reviewed issues disappear", () => {
    const approvedFingerprint = catalogReviewFingerprint(["product_image_missing", "catalan_requires_operator_review"]);
    expect(shouldRequireCatalogReview({ reasons: ["catalan_requires_operator_review"], decision: "approved", approvedFingerprint })).toBe(false);
    expect(isCatalogReviewApproved({ reasons: [], decision: "approved", approvedFingerprint })).toBe(true);
    expect(shouldRequireCatalogReview({ reasons: ["grouping_requires_operator_review"], decision: "approved", approvedFingerprint })).toBe(true);
  });
  it("publishes supplier-backed products only when they do not need review", () => {
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

  it("keeps unavailable catalog entries visible without making supplier stock sellable", () => {
    expect(
      shouldListCatalogProduct({
        review: false,
        fulfillmentMode: "supplier_or_physical",
      }),
    ).toBe(true);
    expect(
      shouldListCatalogProduct({
        review: true,
        fulfillmentMode: "supplier_or_physical",
      }),
    ).toBe(false);
    expect(
      shouldListCatalogProduct({
        review: false,
        fulfillmentMode: "disabled",
      }),
    ).toBe(false);
  });

  it("keeps physical stock sellable when every supplier is unavailable", () => {
    expect(
      shouldAutoPublishCatalogProduct({
        review: false,
        availability: "unavailable",
        physicalStockOnHand: 1,
      }),
    ).toBe(true);
    expect(
      shouldAutoPublishCatalogProduct({
        review: false,
        availability: "missing",
        physicalStockOnHand: 3,
        fulfillmentMode: "physical_only",
      }),
    ).toBe(true);
  });

  it("keeps disabled variants unsellable even with physical stock", () => {
    expect(
      shouldAutoPublishCatalogProduct({
        review: false,
        availability: "available",
        physicalStockOnHand: 2,
        fulfillmentMode: "disabled",
      }),
    ).toBe(false);
  });

  it("never backorders physical-only variants", () => {
    expect(
      shouldAllowSupplierBackorder({
        availability: "available",
        fulfillmentMode: "physical_only",
      }),
    ).toBe(false);
    expect(
      shouldAllowSupplierBackorder({
        availability: "available",
        fulfillmentMode: "supplier_or_physical",
      }),
    ).toBe(true);
  });

  it("forces unresolved supplier packs away from supplier backorder", () => {
    expect(
      effectiveCatalogFulfillmentMode({
        fulfillmentMode: "supplier_or_physical",
        requiresPackSplit: true,
      }),
    ).toBe("physical_only");
    expect(
      effectiveCatalogFulfillmentMode({
        fulfillmentMode: "disabled",
        requiresPackSplit: true,
      }),
    ).toBe("disabled");
    expect(
      effectiveCatalogFulfillmentMode({
        fulfillmentMode: "supplier_or_physical",
        requiresPackSplit: false,
      }),
    ).toBe("supplier_or_physical");
  });

  it("persists a human approval only for the exact reviewed reasons", () => {
    const reasons = ["pack_requires_operator_split", "product_image_missing"];
    const fingerprint = catalogReviewFingerprint(reasons);

    expect(
      isCatalogReviewApproved({
        reasons,
        decision: "approved",
        approvedFingerprint: fingerprint,
      }),
    ).toBe(true);
    expect(
      shouldRequireCatalogReview({
        reasons,
        decision: "approved",
        approvedFingerprint: fingerprint,
      }),
    ).toBe(false);

    expect(
      shouldRequireCatalogReview({
        reasons: [...reasons, "supplier_cost_missing"],
        decision: "approved",
        approvedFingerprint: fingerprint,
      }),
    ).toBe(true);
  });

  it("keeps rejected products in review even when the reasons are unchanged", () => {
    const reasons = ["catalan_requires_operator_review"];
    expect(
      shouldRequireCatalogReview({
        reasons,
        decision: "rejected",
        approvedFingerprint: catalogReviewFingerprint(reasons),
      }),
    ).toBe(true);
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
