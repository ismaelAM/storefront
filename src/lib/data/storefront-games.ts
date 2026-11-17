import "server-only";
import { connection } from "next/server";
import { cache } from "react";
import { tcgNavigation } from "@/lib/catalog/tcg-navigation";
import { cachedGetCategory } from "@/lib/data/categories";
import { getSitePageData } from "@/lib/puck/get-site-page-data";

interface NavigationItem {
  categoryPermalink: string;
  labelOverride: string;
  visible: boolean;
}

// Share the same lightweight taxon and the same editorial ordering across
// the desktop menu, mobile menu, home directory and footer.
export const getStorefrontGames = cache(async (country: string, locale: string) => {
  await connection();
  const root = await cachedGetCategory("tcg", { expand: ["children"] }, { country, locale }).catch((error) => {
    console.error("Storefront navigation: failed to load TCG games", error);
    return null;
  });
  if (!root) return [];

  const games = tcgNavigation([root]);
  if (games.length === 0) return games;

  const data = await getSitePageData("navigation", { content: [], root: {} });
  const props = data.content.find((block) => block.type === "Navigation")?.props as
    | { items?: NavigationItem[] }
    | undefined;
  const byPermalink = new Map(games.map((game) => [game.permalink, game]));
  const configured = (props?.items ?? []).flatMap((item) => {
    const game = byPermalink.get(item.categoryPermalink);
    if (!game) return [];
    byPermalink.delete(item.categoryPermalink);
    return item.visible
      ? [{ ...game, name: item.labelOverride || game.name }]
      : [];
  });

  return [...configured, ...byPermalink.values()];
});
