export const CORREOS_RATE_SOURCE =
  "https://www.correos.es/content/dam/correos/documentos/atc/tarifas/2026/Tarifas_Correos_2026_Peninsula_y_Baleares.pdf";

export type CorreosRateErrorCode =
  | "invalidPostalCode"
  | "invalidWeight"
  | "invalidDimensions"
  | "oversized"
  | "undersized"
  | "tariffExpired";

export class CorreosRateError extends Error {
  constructor(public readonly code: CorreosRateErrorCode) {
    super(code);
    this.name = "CorreosRateError";
  }
}

export interface CorreosShippingEstimate {
  kind: "published_tariff_estimate";
  service: "Paq Estándar";
  origin: "peninsula";
  zone: "peninsula" | "baleares" | "canarias" | "ceutaMelilla";
  realWeightKg: number;
  volumetricWeightKg: number;
  billableWeightKg: number;
  extraKilograms: number;
  netCents: number;
  taxCents: number;
  totalCents: number;
  currency: "EUR";
  rateYear: 2026;
  rateSource: string;
}

// Official 2026 Paq Estándar, delivery to home/office, pages 10–11.
// Each row is [net cents, published total cents]; do not re-round published VAT.
const LIMITS = [1, 5, 10, 15, 20, 25, 30];
const RATES = {
  peninsula: [
    [1128, 1365],
    [1413, 1710],
    [1897, 2295],
    [2298, 2781],
    [2781, 3365],
    [3224, 3901],
    [3657, 4425],
  ],
  baleares: [
    [1273, 1540],
    [1802, 2180],
    [2884, 3490],
    [3843, 4650],
    [4831, 5846],
    [5806, 7025],
    [6867, 8309],
  ],
  canarias: [
    [2130, 2130],
    [3070, 3070],
    [3840, 3840],
    [4910, 4910],
    [6675, 6675],
    [8685, 8685],
    [10700, 10700],
  ],
  ceutaMelilla: [
    [1273, 1273],
    [1802, 1802],
    [2884, 2884],
    [3843, 3843],
    [4831, 4831],
    [5806, 5806],
    [6867, 6867],
  ],
} as const;
const EXTRA_KG = {
  peninsula: [112, 136],
  baleares: [211, 255],
  canarias: [420, 420],
  ceutaMelilla: [211, 211],
} as const;

function positiveNumber(value: unknown, code: CorreosRateErrorCode): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new CorreosRateError(code);
  }
  return value;
}

// Only absorb arithmetic noise (a few ULPs), never round measured grams/cm away.
function normalizeIntegerBoundary(value: number): number {
  const integer = Math.round(value);
  return Math.abs(value - integer) <=
    Number.EPSILON * Math.max(1, Math.abs(value)) * 8
    ? integer
    : value;
}

/** Cost estimate only. Spree remains the authority for checkout shipping charges. */
export function estimateCorreosShipping(
  input: unknown,
  now = new Date(),
): CorreosShippingEstimate {
  if (
    !Number.isFinite(now.getTime()) ||
    now < new Date("2026-01-01T00:00:00Z") ||
    now >= new Date("2027-01-01T00:00:00Z")
  ) {
    throw new CorreosRateError("tariffExpired");
  }
  const parcel = (input && typeof input === "object" ? input : {}) as Record<
    string,
    unknown
  >;
  const postalCode =
    typeof parcel.postalCode === "string" ? parcel.postalCode.trim() : "";
  const province = Number(postalCode.slice(0, 2));
  if (!/^\d{5}$/.test(postalCode) || province < 1 || province > 52) {
    throw new CorreosRateError("invalidPostalCode");
  }
  const weightKg = positiveNumber(parcel.weightKg, "invalidWeight");
  if (weightKg > 30) throw new CorreosRateError("invalidWeight");
  const dimensions = [parcel.lengthCm, parcel.widthCm, parcel.heightCm].map(
    (value) => positiveNumber(value, "invalidDimensions"),
  );
  if (
    dimensions.some((value) => value > 120) ||
    normalizeIntegerBoundary(
      dimensions.reduce((sum, value) => sum + value, 0),
    ) > 240
  ) {
    throw new CorreosRateError("oversized");
  }
  const sortedDimensions = [...dimensions].sort((a, b) => b - a);
  if (sortedDimensions[0] < 14.5 || sortedDimensions[1] < 10) {
    throw new CorreosRateError("undersized");
  }
  const zone =
    province === 7
      ? "baleares"
      : province === 35 || province === 38
        ? "canarias"
        : province === 51 || province === 52
          ? "ceutaMelilla"
          : "peninsula";
  const volumetricWeightKg = normalizeIntegerBoundary(
    dimensions.reduce((product, value) => product * value, 1) / 6000,
  );
  const billableWeightKg = Math.max(weightKg, volumetricWeightKg);
  const bracket = LIMITS.findIndex((limit) => billableWeightKg <= limit);
  const extraKilograms = Math.max(0, Math.ceil(billableWeightKg - 30));
  const [baseNet, baseTotal] = RATES[zone][bracket < 0 ? 6 : bracket];
  const [extraNet, extraTotal] = EXTRA_KG[zone];
  const netCents = baseNet + extraKilograms * extraNet;
  const totalCents = baseTotal + extraKilograms * extraTotal;
  return {
    kind: "published_tariff_estimate",
    service: "Paq Estándar",
    origin: "peninsula",
    zone,
    realWeightKg: weightKg,
    volumetricWeightKg,
    billableWeightKg,
    extraKilograms,
    netCents,
    taxCents: totalCents - netCents,
    totalCents,
    currency: "EUR",
    rateYear: 2026,
    rateSource: CORREOS_RATE_SOURCE,
  };
}
