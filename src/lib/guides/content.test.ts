import { describe, expect, it } from "vitest";
import { BUYING_GUIDES, getBuyingGuide, isBuyingGuideRoute } from "./content";

describe("buying guide lookup", () => {
  it("publishes editorial content only on the Spain Spanish route", () => {
    expect(isBuyingGuideRoute("es", "es")).toBe(true);
    for (const [country, locale] of [
      ["mx", "es"],
      ["es", "es-MX"],
      ["es", "en"],
      ["ES", "es"],
    ]) {
      expect(isBuyingGuideRoute(country, locale)).toBe(false);
    }
  });
  it.each([
    ["como-empezar-pokemon-tcg", "Cómo empezar en Pokémon TCG"],
    ["como-elegir-fundas-cartas", "Cómo elegir fundas para tus cartas"],
    ["como-elegir-juego-mesa-dos", "Cómo elegir un juego de mesa para dos"],
  ])("resolves the published %s guide", (slug, title) => {
    expect(getBuyingGuide(slug)?.title).toBe(title);
  });

  it.each([
    "unknown",
    "",
    "COMO-EMPEZAR-POKEMON-TCG",
    "../como-empezar-pokemon-tcg",
  ])("does not resolve unpublished or altered slug %s", (slug) =>
    expect(getBuyingGuide(slug)).toBeUndefined());

  it("publishes concise guides with primary source links", () => {
    expect(new Set(BUYING_GUIDES.map((guide) => guide.slug)).size).toBe(3);
    for (const guide of BUYING_GUIDES) {
      const words = [
        guide.intro,
        ...guide.sections.flatMap((section) => section.paragraphs),
      ]
        .join(" ")
        .split(/\s+/).length;
      expect(words).toBeGreaterThanOrEqual(250);
      expect(words).toBeLessThanOrEqual(400);
      expect(guide.sections).toHaveLength(4);
      expect(guide.sources.length).toBeGreaterThan(0);
      for (const source of guide.sources) {
        expect(new URL(source.url).protocol).toBe("https:");
        expect(source.title.length).toBeGreaterThan(0);
      }
    }
  });
});
