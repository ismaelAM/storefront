import { describe, expect, it } from "vitest";
import { supplierVatRate } from "../../supabase/functions/_shared/supplier-pricing-policy";

describe("supplierVatRate", () => {
  it("uses 27% for TcgFactory", () => {
    expect(supplierVatRate({ supplierCode: "tcgfactory", isBook: false })).toBe(0.27);
    expect(supplierVatRate({ supplierCode: "TCGFACTORY", isBook: true })).toBe(0.27);
  });

  it("keeps the existing Devir VAT policy", () => {
    expect(supplierVatRate({ supplierCode: "devir", isBook: false })).toBe(0.21);
    expect(supplierVatRate({ supplierCode: "devir", isBook: true })).toBe(0.04);
  });
});
