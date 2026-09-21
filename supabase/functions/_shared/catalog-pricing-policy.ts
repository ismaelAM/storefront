export const TCGFACTORY_PRICING_VAT_RATE = 0.27;
export const STANDARD_PRICING_VAT_RATE = 0.21;
export const BOOK_PRICING_VAT_RATE = 0.04;

export function supplierPricingVatRate(input: {
  supplierCode?: string | null;
  book: boolean;
}): number {
  if ((input.supplierCode ?? "").trim().toLowerCase() === "tcgfactory") {
    return TCGFACTORY_PRICING_VAT_RATE;
  }
  return input.book ? BOOK_PRICING_VAT_RATE : STANDARD_PRICING_VAT_RATE;
}

export function paymentAwarePricingFloor(input: {
  costNet: number;
  vatRate: number;
  targetProfitRate: number;
  cardRate?: number;
  cardFixed?: number;
}): number {
  const cardRate = input.cardRate ?? 0.015;
  const cardFixed = input.cardFixed ?? 0.25;
  const denominator =
    (1 / (1 + input.vatRate)) - cardRate - input.targetProfitRate;
  if (denominator <= 0) {
    throw new Error("Margen objetivo incompatible con IVA/comisiones");
  }
  return (input.costNet + cardFixed) / denominator;
}

export function roundUpProfessionalPrice(value: number): number {
  const euros = Math.floor(value);
  const endings = [0.50, 0.90, 0.95, 0.99, 1.00];

  for (const ending of endings) {
    const candidate = euros + ending;
    if (candidate + 1e-9 >= value) {
      return Math.round(candidate * 100) / 100;
    }
  }

  return Math.ceil(value * 100 - 1e-9) / 100;
}
