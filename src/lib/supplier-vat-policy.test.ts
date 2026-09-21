import { describe, expect, it } from "vitest";
import {
  TCGFACTORY_VAT_RATE,
  vatRateForSupplier,
} from "../../supabase/functions/_shared/supplier-vat-policy";

describe("supplier VAT policy", () => {
  it("uses 27% VAT for every TcgFactory item", () => {
    expect(
      vatRateForSupplier({ supplierCode: "tcgfactory", isBook: false }),
    ).toBe(TCGFACTORY_VAT_RATE);
    expect(
      vatRateForSupplier({ supplierCode: "TCGFACTORY", isBook: true }),
    ).toBe(TCGFACTORY_VAT_RATE);
  });

  it("keeps normal Spanish VAT rules for other suppliers", () => {
    expect(vatRateForSupplier({ supplierCode: "devir", isBook: false })).toBe(0.21);
    expect(vatRateForSupplier({ supplierCode: "devir", isBook: true })).toBe(0.04);
  });
});
