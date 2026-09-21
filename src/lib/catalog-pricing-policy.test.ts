import { describe, expect, it } from "vitest";
import {
  paymentAwarePricingFloor,
  roundUpProfessionalPrice,
  supplierPricingVatRate,
} from "../../supabase/functions/_shared/catalog-pricing-policy";

describe("supplier pricing VAT policy", () => {
  it("uses 27% for TcgFactory regardless of category", () => {
    expect(
      supplierPricingVatRate({ supplierCode: "tcgfactory", book: false }),
    ).toBe(0.27);
    expect(
      supplierPricingVatRate({ supplierCode: "TCGFACTORY", book: true }),
    ).toBe(0.27);
  });

  it("keeps Devir standard/book rates unchanged", () => {
    expect(
      supplierPricingVatRate({ supplierCode: "devir", book: false }),
    ).toBe(0.21);
    expect(
      supplierPricingVatRate({ supplierCode: "devir", book: true }),
    ).toBe(0.04);
  });

  it("reprices the 2.31 deck case from the old 3.50 floor to 3.90", () => {
    const oldFloor = paymentAwarePricingFloor({
      costNet: 2.31,
      vatRate: 0.21,
      targetProfitRate: 0.05,
    });
    const tcgFactoryFloor = paymentAwarePricingFloor({
      costNet: 2.31,
      vatRate: 0.27,
      targetProfitRate: 0.05,
    });

    expect(roundUpProfessionalPrice(oldFloor)).toBe(3.5);
    expect(roundUpProfessionalPrice(tcgFactoryFloor)).toBe(3.9);
  });
});
