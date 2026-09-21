import { describe, expect, it } from "vitest";
import { requiresMtgPreconSplitReview } from "../../supabase/functions/_shared/mtg-precon-policy";

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
