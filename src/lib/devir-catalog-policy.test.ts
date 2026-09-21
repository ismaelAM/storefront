import { describe, expect, it } from "vitest";
import {
  inferDevirCategoryKey,
  normalizeDevirCatalogTitle,
} from "../../supabase/functions/_shared/devir-catalog-policy";

describe("Devir catalog title normalization", () => {
  it("normalizes Spanish language aliases to Español", () => {
    expect(normalizeDevirCatalogTitle("Juego - CASTELLANO")).toBe("Juego - Español");
    expect(normalizeDevirCatalogTitle("Juego español")).toBe("Juego Español");
    expect(normalizeDevirCatalogTitle("Juego SPANISH")).toBe("Juego Español");
  });

  it("normalizes English spellings and the recurring NGLES typo", () => {
    expect(normalizeDevirCatalogTitle("MTG MARVEL - JUMPSTART NGLES")).toBe(
      "MTG MARVEL - JUMPSTART Inglés",
    );
    expect(normalizeDevirCatalogTitle("Producto INGLES")).toBe("Producto Inglés");
    expect(normalizeDevirCatalogTitle("Producto English")).toBe("Producto Inglés");
  });

  it("repairs an unclosed trailing language parenthesis", () => {
    expect(
      normalizeDevirCatalogTitle("Magic - Tarkir, Landstation unit (inglés"),
    ).toBe("Magic - Tarkir, Landstation unit (Inglés)");
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
