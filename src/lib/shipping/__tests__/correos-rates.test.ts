import { describe, expect, it } from "vitest";
import { estimateCorreosShipping } from "../correos-rates";

const now = new Date("2026-10-10T12:00:00Z");
const parcel = {
  postalCode: "28001",
  weightKg: 1,
  lengthCm: 20,
  widthCm: 15,
  heightCm: 10,
};
const quote = (overrides = {}) =>
  estimateCorreosShipping({ ...parcel, ...overrides }, now);

describe("Correos published Paq Estándar estimates", () => {
  it.each([
    [1, 1365],
    [1.001, 1710],
    [5, 1710],
    [5.001, 2295],
    [10, 2295],
    [10.001, 2781],
    [15, 2781],
    [15.001, 3365],
    [20, 3365],
    [20.001, 3901],
    [25, 3901],
    [25.001, 4425],
    [30, 4425],
  ])("charges the official mainland bracket for %s kg", (weightKg, totalCents) => {
    expect(quote({ weightKg }).totalCents).toBe(totalCents);
  });
  it("uses volumetric weight when a light box takes more space", () => {
    expect(
      quote({ weightKg: 0.5, lengthCm: 60, widthCm: 40, heightCm: 30 }),
    ).toMatchObject({
      billableWeightKg: 12,
      totalCents: 2781,
    });
  });
  it("charges additional volumetric kilograms above 30 without accepting excess real weight", () => {
    // 90 * 60 * 40 / 6000 = 36 kg; 44.25 + 6 * 1.36 = 52.41.
    expect(quote({ lengthCm: 90, widthCm: 60, heightCm: 40 }).totalCents).toBe(
      5241,
    );
    expect(() => quote({ weightKg: 30.001 })).toThrow();
  });
  it.each([
    ["07001", 1540, 267],
    ["35001", 2130, 0],
    ["38001", 2130, 0],
    ["51001", 1273, 0],
    ["52001", 1273, 0],
  ])("applies the destination tariff and tax for %s", (postalCode, totalCents, taxCents) => {
    expect(quote({ postalCode })).toMatchObject({ totalCents, taxCents });
  });
  it.each([
    "00000",
    "53001",
    "2800",
    "28001x",
    28001,
    null,
  ])("rejects invalid Spanish postcodes: %s", (postalCode) => {
    expect(() => quote({ postalCode })).toThrow();
  });
  it.each([
    0,
    -1,
    NaN,
    Infinity,
    "1",
    null,
  ])("rejects invalid or coerced real weights: %s", (weightKg) => {
    expect(() => quote({ weightKg })).toThrow();
  });
  it("rejects missing, invalid and extra-size boxes instead of quoting without their surcharge", () => {
    for (const input of [
      { lengthCm: 0 },
      { heightCm: "10" },
      { widthCm: Infinity },
      { lengthCm: 121 },
      { lengthCm: 100, widthCm: 100, heightCm: 41 },
    ]) {
      expect(() => quote(input)).toThrow();
    }
    expect(() => quote({ lengthCm: 14, widthCm: 9, heightCm: 1 })).toThrow();
  });
  it("accepts the official standard dimension boundary", () => {
    expect(
      quote({ lengthCm: 120, widthCm: 100, heightCm: 20 }).totalCents,
    ).toBe(5785);
  });
  it("does not charge an extra kilogram from decimal multiplication noise", () => {
    expect(
      quote({ lengthCm: 18.6, widthCm: 100, heightCm: 100 }),
    ).toMatchObject({
      volumetricWeightKg: 31,
      extraKilograms: 1,
      totalCents: 4561,
    });
    expect(
      quote({
        postalCode: "35001",
        lengthCm: 18.6,
        widthCm: 100,
        heightCm: 100,
      }).totalCents,
    ).toBe(11120);
  });
  it("accepts decimal dimensions whose sum is exactly the standard limit", () => {
    expect(() =>
      quote({ lengthCm: 32.2, widthCm: 95.9, heightCm: 111.9 }),
    ).not.toThrow();
  });
  it("preserves genuine small excesses at weight and dimension boundaries", () => {
    expect(
      quote({ lengthCm: 18.6000000001, widthCm: 100, heightCm: 100 })
        .extraKilograms,
    ).toBe(2);
    expect(() =>
      quote({ lengthCm: 32.2000000001, widthCm: 95.9, heightCm: 111.9 }),
    ).toThrow();
  });
  it("refuses expired or not-yet-valid annual rates", () => {
    expect(() =>
      estimateCorreosShipping(parcel, new Date("2027-01-01T00:00:00Z")),
    ).toThrow();
    expect(() =>
      estimateCorreosShipping(parcel, new Date("2025-12-31T23:59:59Z")),
    ).toThrow();
  });
});
