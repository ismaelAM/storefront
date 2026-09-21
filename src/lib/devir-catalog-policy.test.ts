import { describe, expect, it } from "vitest";
import {
  inferDevirCategoryKey,
  isCatalanCatalogProduct,
  normalizeDevirCatalogTitle,
  normalizeDevirRetailUnit,
} from "../../supabase/functions/_shared/devir-catalog-policy";

describe("Devir catalog title normalization", () => {
  it("normalizes Spanish language aliases to Español", () => {
    expect(normalizeDevirCatalogTitle("Juego - CASTELLANO")).toBe(
      "Juego - Español",
    );
    expect(normalizeDevirCatalogTitle("Juego español")).toBe("Juego Español");
    expect(normalizeDevirCatalogTitle("Juego SPANISH")).toBe("Juego Español");
  });

  it("normalizes English spellings and the recurring NGLES typo", () => {
    expect(normalizeDevirCatalogTitle("MTG MARVEL - JUMPSTART NGLES")).toBe(
      "MTG MARVEL - JUMPSTART Inglés",
    );
    expect(normalizeDevirCatalogTitle("Producto INGLES")).toBe(
      "Producto Inglés",
    );
    expect(normalizeDevirCatalogTitle("Producto English")).toBe(
      "Producto Inglés",
    );
  });

  it("repairs an unclosed trailing language parenthesis", () => {
    expect(
      normalizeDevirCatalogTitle("Magic - Tarkir, Landstation unit (inglés"),
    ).toBe("Magic - Tarkir, Landstation unit (Inglés)");
  });
});

describe("Devir automatic publication exclusions", () => {
  it.each([
    "Catan (ed. Catalán)",
    "Codi Secret (Catalan)",
    "Joc en català",
  ])("detects Catalan products in %s", (name) => {
    expect(isCatalanCatalogProduct({ name })).toBe(true);
  });

  it("does not exclude Spanish products", () => {
    expect(isCatalanCatalogProduct({ name: "Catan Español" })).toBe(false);
  });
});

describe("Devir retail-unit normalization", () => {
  it("keeps a Scene Box as a full supplier pack", () => {
    expect(
      normalizeDevirRetailUnit({
        name: "*MG AVATAR TLA SCENE BOX Inglés CARTOON (4)",
        purchasePrice: 96,
        referencePriceNet: null,
      }),
    ).toEqual({
      name: "MTG AVATAR TLA SCENE BOX Inglés",
      purchasePrice: 96,
      referencePriceNet: null,
      unitsPerSupplierPack: 4,
    });
  });

  it("keeps a Theme Deck as a full supplier pack", () => {
    expect(
      normalizeDevirRetailUnit({
        name: "*MG LORWYN ECLIPSED THEME DECK Inglés DISP (8)",
        purchasePrice: 107,
        referencePriceNet: null,
      }),
    ).toEqual({
      name: "MTG LORWYN ECLIPSED THEME DECK Inglés",
      purchasePrice: 107,
      referencePriceNet: null,
      unitsPerSupplierPack: 8,
    });
  });

  it("drops a zero reference price instead of persisting an invalid value", () => {
    expect(
      normalizeDevirRetailUnit({
        name: "MTG SCENE BOX Inglés",
        purchasePrice: 96,
        referencePriceNet: 0,
      }),
    ).toMatchObject({
      purchasePrice: 24,
      referencePriceNet: null,
    });
  });
});

describe("Devir RPG category policy", () => {
  it.each([
    "Vaesen - Ciudad de mis pesadillas",
    "Dragonbane - Bestiario",
    "El Anillo Único 2ª ed.: Pantalla",
    "El Archivo de las Tormentas - Caja de iniciación",
  ])("classifies %s as roleplaying", (name) => {
    expect(inferDevirCategoryKey({ name })).toBe("rol/otros");
  });

  it("keeps established RPG category families", () => {
    expect(inferDevirCategoryKey({ name: "Pathfinder 2ª ed. Bestiario" })).toBe(
      "rol/pathfinder",
    );
    expect(inferDevirCategoryKey({ name: "D&D Ravenloft" })).toBe(
      "rol/dungeons-dragons",
    );
  });

  it("does not turn ordinary board games into RPG products", () => {
    expect(inferDevirCategoryKey({ name: "SETI" })).toBe(
      "juegos-de-mesa/general",
    );
  });
});
