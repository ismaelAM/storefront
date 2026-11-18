import type { Data } from "@puckeditor/core";
import { getTranslations } from "next-intl/server";
import { DEFAULT_HOME_DATA } from "@/lib/puck/home-defaults";
import { getSitePageData } from "./get-site-page-data";

/**
 * Fetch Home page data from Supabase
 * Returns DEFAULT_HOME_DATA if no published data exists
 *
 * Server-side only. Used by HomePage and EditorPage.
 */
export async function getHomePageData(locale?: string): Promise<Data> {
  const [data, t] = await Promise.all([
    getSitePageData("home", DEFAULT_HOME_DATA),
    locale ? getTranslations({ locale: locale as Locale, namespace: "tcgShop" }) : getTranslations("tcgShop"),
  ]);
  return {
    ...data,
    content: data.content.map((block) => block.type === "HeroHome" &&
      (block.props.text === DEFAULT_HOME_DATA.content[0].props.text ||
        /juegos de mesa|manga|board games/i.test(block.props.text ?? "")) ? {
      ...block,
      props: {
        ...block.props,
        text: t("description"),
        primaryButtonText: t("allProducts"),
        primaryButtonUrl: "/products",
      },
    } : block),
  };
}
