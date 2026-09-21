import { describe, expect, it } from "vitest";
import { legacyGroupedProductSlug } from "@/lib/utils/product-slug";

describe("legacyGroupedProductSlug", () => {
  it.each([
    ["kakegurui-jugadores-dementes-num-14", "kakegurui-jugadores-dementes"],
    ["nozaki-y-su-revista-mensual-para-chicas-vol-13", "nozaki-y-su-revista-mensual-para-chicas"],
    ["la-princesa-y-el-rey-de-las-bestias-num-09-de-15", "la-princesa-y-el-rey-de-las-bestias"],
    ["serie-tomo-02", "serie"],
  ])("maps %s to %s", (input, expected) => {
    expect(legacyGroupedProductSlug(input)).toBe(expected);
  });

  it("does not change ordinary product slugs", () => {
    expect(legacyGroupedProductSlug("deck-box-dragon-shield")).toBeNull();
  });
});
