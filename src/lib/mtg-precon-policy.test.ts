import { describe, expect, it } from "vitest";
import { requiresManualPackSplitReview, requiresMtgPreconSplitReview, supplierPackChildVariantIds } from "../../supabase/functions/_shared/mtg-precon-policy";

describe("MTG precon split policy", () => {
  it("holds heterogeneous commander cartons for manual split", () => {
    expect(requiresMtgPreconSplitReview({
      name: "MTG - STAR TREK COMMANDER DECK ESPAÑOL (4 BARAJAS)",
      purchasePrice: 176,
    })).toBe(true);
    expect(requiresMtgPreconSplitReview({
      name: "MTG FOUNDATIONS STARTER COMMANDER DECKS ESPAÑOL (caja 5 barajas)",
      purchasePrice: 86,
    })).toBe(true);
    expect(requiresMtgPreconSplitReview({
      name: "*MG LORWYN ECLIPSED COMMANDER SPANISH CARTON (4)",
      url: "https://b2bdevir.es/mg-lorwyn-eclipsed-commander-spanish-carton-4",
      purchasePrice: 120,
    })).toBe(true);
  });

  it("holds suspicious expensive commander listings even when Devir omits the carton count", () => {
    expect(requiresMtgPreconSplitReview({
      name: "MAGIC – SECRETOS DE STRIXHAVEN COMMANDER DECK - Español",
      purchasePrice: 150,
    })).toBe(true);
  });

  it("does not split sealed booster displays", () => {
    expect(requiresMtgPreconSplitReview({
      name: "MTG MARVEL SUPER HEROES Play Booster ESPAÑOL Display (30)",
      purchasePrice: 124.12,
    })).toBe(false);
    expect(requiresMtgPreconSplitReview({
      name: "MTG MARVEL SUPER HEROES COLLECTOR BOOSTER: INGLES (DISPLAY 12)",
      purchasePrice: 310.3,
    })).toBe(false);
  });

  it("does not flag unrelated products or normal single commander decks", () => {
    expect(requiresMtgPreconSplitReview({
      name: "Combat Commander Pacífico",
      purchasePrice: 49.59,
    })).toBe(false);
    expect(requiresMtgPreconSplitReview({
      name: "MTG Commander Deck individual",
      purchasePrice: 44,
    })).toBe(false);
  });
});


describe("generic supplier pack split policy", () => {
  it("holds board-game presentation promos such as 5+1", () => {
    expect(requiresManualPackSplitReview({
      sku: "PRBGAKROSP",
      name: "Presentación: Akropolis (5+1)",
      purchasePrice: 93,
    })).toBe(true);
    expect(requiresManualPackSplitReview({
      name: "Presentación: Ethnos 5 + 1",
      purchasePrice: 117.78,
    })).toBe(true);
    expect(requiresManualPackSplitReview({
      sku: "PRBGNEWGAME",
      name: "Oferta comercial juego de mesa",
      purchasePrice: 80,
    })).toBe(true);
    expect(requiresManualPackSplitReview({
      name: "Presentación: Nuevo juego de mesa",
      purchasePrice: 80,
    })).toBe(true);
  });

  it("holds explicit multi-unit supplier packs", () => {
    expect(requiresManualPackSplitReview({
      name: "Aetherdrift - kit de presentación (INGLÉS) Venta en pack de 15 u.",
      purchasePrice: 19.5,
    })).toBe(true);
    expect(requiresManualPackSplitReview({
      name: "Juego ejemplo - caja de 6 unidades",
      purchasePrice: 60,
    })).toBe(true);
    expect(requiresManualPackSplitReview({
      name: "Juego promocional Venta en pack de 6 ud.",
      purchasePrice: 42,
    })).toBe(true);
  });

  it("holds Devir Scene Box and Theme Deck supplier packs", () => {
    expect(requiresManualPackSplitReview({
      name: "MTG - STAR TREK SCENE BOX Inglés",
      purchasePrice: 96,
    })).toBe(true);
    expect(requiresManualPackSplitReview({
      name: "MTG LORWYN ECLIPSED THEME DECK Inglés",
      purchasePrice: 107,
    })).toBe(true);
  });

  it("does not hold single prerelease kits or sealed booster displays", () => {
    expect(requiresManualPackSplitReview({
      name: "*MG IN.MIDNIGHT HUNT Presentación KIT SPANISH UNIT",
      purchasePrice: 15,
    })).toBe(false);
    expect(requiresManualPackSplitReview({
      name: "MTG MARVEL SUPER HEROES Play Booster ESPAÑOL Display (30)",
      purchasePrice: 124.12,
    })).toBe(false);
  });
});


describe("additional distributor display safeguards", () => {
  it("holds explicit multi-deck cartons", () => {
    expect(requiresManualPackSplitReview({
      name: "MG TORTUGAS NINJA CAJA DE BARAJAS (4 un. inglés)",
      purchasePrice: 176,
    })).toBe(true);
  });

  it("holds known Hero Realms and Star Realms expansion displays", () => {
    expect(requiresManualPackSplitReview({
      name: "Hero Realms: Odiseas Display",
      purchasePrice: 61.98,
    })).toBe(true);
    expect(requiresManualPackSplitReview({
      name: "Star Realms: Alerta Máxima (display)",
      purchasePrice: 74.38,
    })).toBe(true);
  });
});


describe("supplier pack child availability mapping", () => {
  it("treats manually-created variants as children of one managed pack source", () => {
    expect(
      supplierPackChildVariantIds(
        ["variant_pack", "variant_deck_a", "variant_deck_b", "variant_deck_c"],
        ["variant_pack"],
      ),
    ).toEqual(["variant_deck_a", "variant_deck_b", "variant_deck_c"]);
  });

  it("does not guess child ownership when a product has multiple managed pack sources", () => {
    expect(
      supplierPackChildVariantIds(
        ["variant_pack_es", "variant_pack_en", "variant_deck_a"],
        ["variant_pack_es", "variant_pack_en"],
      ),
    ).toEqual([]);
  });

  it("ignores duplicate and empty ids without ever returning the managed pack variant", () => {
    expect(
      supplierPackChildVariantIds(
        ["variant_pack", "variant_child", "variant_child", "", null],
        ["variant_pack", "variant_pack", undefined],
      ),
    ).toEqual(["variant_child"]);
  });
});
