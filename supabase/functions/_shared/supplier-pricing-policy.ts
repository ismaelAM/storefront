export function supplierVatRate(input: {
  supplierCode?: string | null;
  isBook: boolean;
}): number {
  if ((input.supplierCode ?? "").trim().toLowerCase() === "tcgfactory") {
    return 0.27;
  }
  return input.isBook ? 0.04 : 0.21;
}


export function supplierMinimumOrderRiskSurcharge(input: {
  supplierCode?: string | null;
  unitCostNet: number;
  minimumOrderQuantity?: number | null;
  threshold?: number;
  excessCoverageRate?: number;
  maxUnitCostShare?: number;
}): number {
  if ((input.supplierCode ?? "").trim().toLowerCase() !== "tcgfactory") {
    return 0;
  }
  const unitCostNet = Number(input.unitCostNet);
  const quantity = Number(input.minimumOrderQuantity);
  const threshold = Number(input.threshold ?? 4);
  const excessCoverageRate = Number(input.excessCoverageRate ?? 0.08);
  const maxUnitCostShare = Number(input.maxUnitCostShare ?? 0.3);

  if (
    !Number.isFinite(unitCostNet) ||
    unitCostNet <= 0 ||
    !Number.isInteger(quantity) ||
    quantity < threshold ||
    !Number.isInteger(threshold) ||
    threshold < 2 ||
    !Number.isFinite(excessCoverageRate) ||
    excessCoverageRate < 0 ||
    excessCoverageRate > 1 ||
    !Number.isFinite(maxUnitCostShare) ||
    maxUnitCostShare < 0 ||
    maxUnitCostShare > 1
  ) {
    return 0;
  }

  const excessExposure =
    (quantity - 1) * unitCostNet * excessCoverageRate;
  return Math.min(excessExposure, unitCostNet * maxUnitCostShare);
}
