import { describe, expect, it } from "vitest";
import {
  buildCanonicalIdentity,
  normalizeSupplierItem,
  type SupplierCatalogItem,
  type SupplierOfferCandidate,
  selectBestOffer,
} from "../../supabase/functions/_shared/catalog-sourcing";

function item(
  overrides: Partial<SupplierCatalogItem> = {},
): SupplierCatalogItem {
  return {
    supplierCode: "devir",
    externalVariantId: "9780306406157",
    supplierSku: "978-0-306-40615-7",
    productName: "El castillo ambulante",
    purchasePrice: 12,
    currency: "EUR",
    taxIncluded: false,
    availability: "available",
    ...overrides,
  };
}

function offer(
  id: string,
  normalizedCost: number,
  overrides: Partial<SupplierOfferCandidate> = {},
): SupplierOfferCandidate {
  return {
    id,
    supplierId: `supplier-${id}`,
    supplierCode: id,
    supplierSku: `SKU-${id}`,
    supplierPriority: 100,
    supplierEnabled: true,
    staleAfterHours: 18,
    normalizedCost,
    currency: "EUR",
    availability: "available",
    active: true,
    lastSeenAt: "2026-09-20T10:00:00.000Z",
    ...overrides,
  };
}

describe("catalog sourcing identity", () => {
  it("deduplicates the same GTIN even when distributors use different SKUs", () => {
    const devir = buildCanonicalIdentity(item());
    const other = buildCanonicalIdentity(
      item({
        supplierCode: "otro_mayorista",
        externalVariantId: "other-42",
        supplierSku: "ALM-0042",
        gtin: "9780306406157",
      }),
    );

    expect(other.variantKey).toBe(devir.variantKey);
    expect(other.canonicalSku).toBe("9780306406157");
    expect(other.matchStrategy).toBe("gtin");
    expect(other.requiresReview).toBe(false);
  });

  it("does not treat an arbitrary supplier SKU as a global identifier", () => {
    const first = buildCanonicalIdentity(
      item({
        supplierSku: "ABC-123",
        externalVariantId: "ABC-123",
        productName: "Juego A",
      }),
    );
    const second = buildCanonicalIdentity(
      item({
        supplierCode: "otro",
        supplierSku: "ABC-123",
        externalVariantId: "ABC-123",
        productName: "Juego B",
      }),
    );

    expect(second.variantKey).not.toBe(first.variantKey);
  });

  it("keeps variants separate while matching identical families", () => {
    const volumeOne = buildCanonicalIdentity(
      item({
        supplierSku: "MANGA-1",
        externalVariantId: "MANGA-1",
        productName: "Frieren",
        variantName: "Tomo 01",
        groupKey: "frieren",
        categoryKey: "manga-comic",
        options: { tomo: "01", idioma: "Español" },
      }),
    );
    const volumeTwo = buildCanonicalIdentity(
      item({
        supplierCode: "otro",
        supplierSku: "MANGA-2",
        externalVariantId: "MANGA-2",
        productName: "Frieren",
        variantName: "Tomo 02",
        groupKey: "frieren",
        categoryKey: "manga-comic",
        options: { idioma: "Español", tomo: "02" },
      }),
    );

    expect(volumeTwo.productKey).toBe(volumeOne.productKey);
    expect(volumeTwo.variantKey).not.toBe(volumeOne.variantKey);
    expect(volumeOne.optionSignature).toBe("idioma=espanol&tomo=01");
  });

  it("matches the same variant regardless of option order", () => {
    const first = buildCanonicalIdentity(
      item({
        supplierSku: "NO-GTIN-1",
        externalVariantId: "NO-GTIN-1",
        productName: "Caja coleccionista",
        variantName: "Roja XL",
        options: { color: "Rojo", tamano: "XL" },
      }),
    );
    const second = buildCanonicalIdentity(
      item({
        supplierCode: "otro",
        supplierSku: "NO-GTIN-2",
        externalVariantId: "NO-GTIN-2",
        productName: "Caja coleccionista",
        variantName: "Roja XL",
        options: { tamano: "XL", color: "Rojo" },
      }),
    );

    expect(second.variantKey).toBe(first.variantKey);
    expect(second.identifiers).toContainEqual({
      namespace: "canonical-match",
      value: first.variantKey,
    });
  });

  it("normalizes a gross cost only when the tax rate is known", () => {
    const normalized = normalizeSupplierItem(
      item({
        supplierSku: "GROSS-1",
        externalVariantId: "GROSS-1",
        purchasePrice: 12.1,
        shippingCost: 1,
        taxIncluded: true,
        taxRate: 0.21,
      }),
    );

    expect(normalized.normalizedCost).toBeCloseTo(11, 8);
    expect(() =>
      normalizeSupplierItem(
        item({
          supplierSku: "GROSS-2",
          externalVariantId: "GROSS-2",
          taxIncluded: true,
          taxRate: null,
        }),
      ),
    ).toThrow(/taxRate o normalizedCost/);
  });
});

describe("catalog sourcing selection", () => {
  const now = new Date("2026-09-20T12:00:00.000Z");

  it("selects the cheapest eligible landed cost", () => {
    const selection = selectBestOffer(
      [offer("devir", 10), offer("other", 8.5)],
      { now },
    );

    expect(selection.selected?.id).toBe("other");
  });

  it("excludes unavailable, stale, disabled and foreign-currency offers", () => {
    const selection = selectBestOffer(
      [
        offer("unavailable", 1, { availability: "unavailable" }),
        offer("stale", 2, { lastSeenAt: "2026-09-18T10:00:00.000Z" }),
        offer("disabled", 3, { supplierEnabled: false }),
        offer("usd", 4, { currency: "USD" }),
        offer("winner", 7),
      ],
      { now },
    );

    expect(selection.selected?.id).toBe("winner");
    expect(selection.rejected.map(({ reason }) => reason)).toEqual([
      "unavailable",
      "stale",
      "supplier_disabled",
      "currency_mismatch",
    ]);
  });

  it("uses availability, priority and supplier code as deterministic ties", () => {
    const selection = selectBestOffer(
      [
        offer("preorder", 8, { availability: "preorder", supplierPriority: 1 }),
        offer("zeta", 8, { supplierPriority: 5 }),
        offer("alpha", 8, { supplierPriority: 5 }),
      ],
      { now },
    );

    expect(selection.selected?.id).toBe("alpha");
  });
});
