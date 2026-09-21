import { describe, expect, it } from "vitest";
import {
  mapTcgFactoryAvailability,
  normalizeTcgFactoryRecord,
  requireTcgFactoryCredentials,
  tcgFactoryRecordToCatalogItem,
} from "../../supabase/functions/_shared/tcgfactory-adapter";

function record(overrides: Record<string, unknown> = {}) {
  return {
    externalProductId: "product-42",
    externalVariantId: "variant-42-black",
    reference: "FUN-DS-MAT-63x88-100-NEG",
    productName: "Fundas Standard Matte Dragon Shield",
    variantName: "Negro · 100 fundas",
    ean: "5706569110024",
    sourceUrl:
      "https://tcgfactory.com/es/distribucion/fundas-standard-matte-negro-100-fundas-dragon-shield.html",
    categoryKey: "accesorios-fundas-standard",
    groupKey: "dragon-shield-standard-matte",
    manufacturer: "Dragon Shield",
    options: { color: "Negro", cantidad: 100, tamano: "Standard" },
    purchasePriceNet: "7,50",
    shippingCostNet: 0.25,
    currency: "EUR",
    availability: "Preventa",
    stockQuantity: 0,
    imageUrls: ["https://tcgfactory.com/example.jpg"],
    ...overrides,
  };
}

describe("TcgFactory adapter", () => {
  it("maps the B2B bridge contract without losing variant dimensions", () => {
    const item = normalizeTcgFactoryRecord(record());

    expect(item.supplierCode).toBe("tcgfactory");
    expect(item.adapterKey).toBe("tcgfactory_b2b_bridge_v1");
    expect(item.supplierSku).toBe("FUN-DS-MAT-63x88-100-NEG");
    expect(item.gtin).toBe("5706569110024");
    expect(item.options).toEqual({
      cantidad: "100",
      color: "Negro",
      tamano: "Standard",
    });
    expect(item.availability).toBe("preorder");
    expect(item.normalizedCost).toBe(7.75);
  });

  it("normalizes the observed Spanish availability labels", () => {
    expect(mapTcgFactoryAvailability("Disponible")).toBe("available");
    expect(mapTcgFactoryAvailability("Preventa")).toBe("preorder");
    expect(mapTcgFactoryAvailability("Sin stock")).toBe("unavailable");
    expect(mapTcgFactoryAvailability("Pendiente de confirmar")).toBe("unknown");
  });

  it("does not sell an explicitly empty available offer", () => {
    const item = tcgFactoryRecordToCatalogItem(
      record({ availability: "Disponible", stockQuantity: 0 }),
    );

    expect(item.availability).toBe("unavailable");
  });

  it("converts a gross B2B price only when tax is explicit", () => {
    const item = normalizeTcgFactoryRecord(
      record({
        purchasePriceNet: undefined,
        purchasePriceGross: 12.1,
        taxRate: 0.21,
        shippingCostNet: 1,
      }),
    );

    expect(item.taxIncluded).toBe(true);
    expect(item.normalizedCost).toBeCloseTo(11, 8);
  });

  it("rejects ambiguous prices instead of treating them as purchase cost", () => {
    expect(() =>
      tcgFactoryRecordToCatalogItem(
        record({ purchasePriceNet: undefined, publicPrice: 9.91 }),
      ),
    ).toThrow(/precio público no es un coste B2B/);

    expect(() =>
      tcgFactoryRecordToCatalogItem(
        record({
          purchasePriceNet: 8,
          purchasePriceGross: 9.68,
          taxRate: 0.21,
        }),
      ),
    ).toThrow(/exactamente uno/);
  });

  it("rejects source URLs outside the official supplier domain", () => {
    expect(() =>
      tcgFactoryRecordToCatalogItem(
        record({ sourceUrl: "https://example.com/product/42" }),
      ),
    ).toThrow(/URL HTTPS oficial/);
  });

  it("reads account credentials only through the secret boundary", () => {
    const secrets = new Map([
      ["TCGFACTORY_B2B_EMAIL", "compras@example.com"],
      ["TCGFACTORY_B2B_PASSWORD", "not-a-real-password"],
    ]);

    expect(requireTcgFactoryCredentials((name) => secrets.get(name))).toEqual({
      email: "compras@example.com",
      password: "not-a-real-password",
    });
    expect(() => requireTcgFactoryCredentials(() => undefined)).toThrow(
      /TCGFACTORY_B2B_EMAIL/,
    );
    expect(() =>
      requireTcgFactoryCredentials((name) =>
        name.endsWith("EMAIL") ? "compras@example.com" : "[SENSITIVE]",
      ),
    ).toThrow(/marcador/);
  });
});
