import { describe, expect, it } from "vitest";
import {
  supplierMinimumOrderRiskSurcharge,
  supplierVatRate,
} from "../../supabase/functions/_shared/supplier-pricing-policy";

describe("supplierVatRate", () => {
  it("uses 27% for TcgFactory", () => {
    expect(
      supplierVatRate({ supplierCode: "tcgfactory", isBook: false }),
    ).toBe(0.27);
    expect(
      supplierVatRate({ supplierCode: "TCGFACTORY", isBook: true }),
    ).toBe(0.27);
  });

  it("keeps the existing Devir VAT policy", () => {
    expect(supplierVatRate({ supplierCode: "devir", isBook: false })).toBe(
      0.21,
    );
    expect(supplierVatRate({ supplierCode: "devir", isBook: true })).toBe(0.04);
  });
});

describe("supplierMinimumOrderRiskSurcharge", () => {
  it("covers only a capped fraction of high TcgFactory MOQ exposure", () => {
    expect(
      supplierMinimumOrderRiskSurcharge({
        supplierCode: "tcgfactory",
        unitCostNet: 10,
        minimumOrderQuantity: 4,
      }),
    ).toBeCloseTo(2.4);
    expect(
      supplierMinimumOrderRiskSurcharge({
        supplierCode: "tcgfactory",
        unitCostNet: 10,
        minimumOrderQuantity: 12,
      }),
    ).toBeCloseTo(3);
  });

  it("does not surcharge small minimums or other suppliers", () => {
    expect(
      supplierMinimumOrderRiskSurcharge({
        supplierCode: "tcgfactory",
        unitCostNet: 10,
        minimumOrderQuantity: 3,
      }),
    ).toBe(0);
    expect(
      supplierMinimumOrderRiskSurcharge({
        supplierCode: "devir",
        unitCostNet: 10,
        minimumOrderQuantity: 12,
      }),
    ).toBe(0);
  });

  it("supports explicit policy tuning", () => {
    expect(
      supplierMinimumOrderRiskSurcharge({
        supplierCode: "tcgfactory",
        unitCostNet: 20,
        minimumOrderQuantity: 5,
        threshold: 5,
        excessCoverageRate: 0.05,
        maxUnitCostShare: 0.4,
      }),
    ).toBeCloseTo(4);
  });
});
