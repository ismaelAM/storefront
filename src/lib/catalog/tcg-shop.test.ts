import type { Category } from "@spree/sdk";
import { describe, expect, it } from "vitest";
import {
  isTcgShopProduct,
  tcgFormatForName,
} from "../../../supabase/functions/_shared/tcg-shop";
import { readTcgFormat, tcgNavigation } from "./tcg-navigation";

describe("TCG storefront", () => {
  it("promotes game categories while keeping their canonical permalinks", () => {
    const category = (id: string, permalink: string, children: Category[] = []) =>
      ({ id, permalink, children } as Category);
    const navigation = tcgNavigation([
      category("root-cards", "tcg", [
        category("one-piece", "tcg/one-piece"),
        category("magic", "tcg/mtg"),
        category("other", "tcg/otros"),
      ]),
      category("board", "board_games"),
    ]);
    expect(navigation).toEqual([
      expect.objectContaining({ id: "magic", name: "Magic: The Gathering", permalink: "tcg/mtg" }),
      expect.objectContaining({ id: "one-piece", name: "One Piece Card Game", permalink: "tcg/one-piece" }),
    ]);
  });

  it("excludes incidental collectibles and generic accessories", () => {
    expect(isTcgShopProduct("Panini One Piece Stickers", "tcg/one-piece")).toBe(false);
    expect(isTcgShopProduct("Army Painter", "tcg/otros")).toBe(false);
    expect(isTcgShopProduct("Sleeves", "accessories")).toBe(false);
    expect(isTcgShopProduct("One Piece Official Sleeves", "tcg/one-piece")).toBe(true);
  });

  it("distinguishes decks, boosters, collections and game accessories", () => {
    expect(tcgFormatForName("Magic Commander Legends Booster Box")).toBe("boosters");
    expect(tcgFormatForName("Gundam Starter Deck Display")).toBe("decks");
    expect(tcgFormatForName("One Piece Limited Card Pack")).toBe("sets");
    expect(tcgFormatForName("One Piece Deck Sleeves")).toBe("accessories");
    expect(readTcgFormat("unknown")).toBeUndefined();
  });
});
