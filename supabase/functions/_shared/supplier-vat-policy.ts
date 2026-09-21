export const TCGFACTORY_VAT_RATE = 0.27;

export function vatRateForSupplier(input: {
  supplierCode?: string | null;
  isBook: boolean;
}): number {
  if ((input.supplierCode ?? "").trim().toLowerCase() === "tcgfactory") {
    return TCGFACTORY_VAT_RATE;
  }
  return input.isBook ? 0.04 : 0.21;
}
