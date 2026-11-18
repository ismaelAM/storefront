import type { Category } from "@spree/sdk";
import {
  TCG_FORMATS,
  type TcgFormat,
  tcgGameForPath,
} from "../../../supabase/functions/_shared/tcg-shop";

export function tcgNavigation(categories: readonly Category[]): Category[] {
  const byPath = new Map<string, Category>();
  for (const category of categories) {
    const items = category.permalink === "tcg" ? category.children ?? [] : [category];
    for (const item of items) byPath.set(item.permalink, item);
  }

  return Array.from(byPath.values())
    .flatMap((item) => {
      const game = tcgGameForPath(item.permalink);
      return game ? [{ ...item, name: game[1], children: [] }] : [];
    })
    .sort((left, right) => gameOrder(left.permalink) - gameOrder(right.permalink));
}

function gameOrder(path: string): number {
  return featuredGames.indexOf(path) < 0 ? featuredGames.length : featuredGames.indexOf(path);
}
const featuredGames = ["tcg/mtg", "tcg/one-piece", "tcg/yugioh", "tcg/lorcana"];

export function readTcgFormat(raw: unknown): TcgFormat | undefined {
  return TCG_FORMATS.find((format) => format === raw);
}
