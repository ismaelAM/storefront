export function supplierVatRate(input: {
  supplierCode?: string | null;
  isBook: boolean;
}): number {
  if ((input.supplierCode ?? "").trim().toLowerCase() === "tcgfactory") {
    return 0.27;
  }
  return input.isBook ? 0.04 : 0.21;
}
