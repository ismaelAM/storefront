import { describe, expect, it } from "vitest";
import {
  commercialPricingProfile,
  deterministicOfferScore,
  madridCommercialDay,
} from "../../supabase/functions/_shared/commercial-pricing-policy";

describe("commercial pricing policy", () => {
  it("keeps MTG booster boxes lean and gives Commander precons over twice the floor", () => {
    const box = commercialPricingProfile({
      name: "MTG MARVEL SUPER HEROES Play Booster Display (30)",
      categoryKey: "tcg/mtg",
    });
    const commander = commercialPricingProfile({
      name: "MTG Foundations Starter Commander Decks",
      categoryKey: "tcg/mtg",
    });

    expect(box.code).toBe("mtg_booster_box");
    expect(box.targetMargin).toBeCloseTo(0.045);
    expect(commander.code).toBe("mtg_commander_precon");
    expect(commander.targetMargin).toBeCloseTo(0.1);
    expect(commander.targetMargin).toBeGreaterThan(box.targetMargin * 2);
  });

  it("distinguishes broad store families", () => {
    expect(
      commercialPricingProfile({
        name: "Fundas Matte",
        categoryKey: "accesorios/fundas-standard",
      }).code,
    ).toBe("sleeves");
    expect(
      commercialPricingProfile({
        name: "Expansión de juego",
        categoryKey: "juegos-de-mesa/expansiones",
      }).code,
    ).toBe("board_game_expansion");
    expect(
      commercialPricingProfile({
        name: "Álbum 9 bolsillos",
        categoryKey: "accesorios/albumes",
      }).code,
    ).toBe("albums");
  });

  it("recognizes sealed TCG outside MTG and Yugioh", () => {
    expect(
      commercialPricingProfile({
        name: "Pokémon Elite Trainer Box",
        categoryKey: null,
      }).code,
    ).toBe("other_tcg_sealed");
  });

  it("keeps manga out of rotating offers", () => {
    const manga = commercialPricingProfile({
      name: "Manga Vol. 4",
      categoryKey: "manga-comic",
    });
    expect(manga.offerEligible).toBe(false);
    expect(manga.dailyOfferDiscount).toBe(0);
  });

  it("uses Madrid calendar days and a stable daily score", () => {
    expect(madridCommercialDay(new Date("2026-09-26T10:00:00Z"))).toEqual({
      dayKey: "2026-09-26",
      saturday: true,
    });
    expect(deterministicOfferScore("2026-09-26", "variant-a")).toBe(
      deterministicOfferScore("2026-09-26", "variant-a"),
    );
    expect(deterministicOfferScore("2026-09-27", "variant-a")).not.toBe(
      deterministicOfferScore("2026-09-26", "variant-a"),
    );
  });
});
