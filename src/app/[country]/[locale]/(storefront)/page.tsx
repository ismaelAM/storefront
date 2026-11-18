import type { ProductListParams } from "@spree/sdk";
import type { Metadata } from "next";
import { TcgGameDirectory } from "@/components/layout/TcgGameDirectory";
import { getStorefrontGames } from "@/lib/data/storefront-games";
import { HomePuckRenderer } from "@/components/puck/HomePuckRenderer";
import { JsonLd } from "@/components/seo/JsonLd";
import { PRODUCT_CARD_FIELDS } from "@/lib/data/cached";
import { cachedListProducts } from "@/lib/data/products";
import { generateHomeMetadata } from "@/lib/metadata/home";
import { getHomePageData } from "@/lib/puck/get-home-data";
import { getHomeProductReadPlan } from "@/lib/puck/home-catalog";
import { buildHomeMerchandisingProducts } from "@/lib/puck/home-merchandising";
import { buildCanonicalUrl, buildWebSiteJsonLd } from "@/lib/seo";
import { getAccessToken } from "@/lib/spree";
import { getStoreUrl } from "@/lib/store";
import { TCG_CATALOG_TAG } from "../../../../../supabase/functions/_shared/tcg-shop";
import { madridDailyOfferDay } from "../../../../../supabase/functions/_shared/daily-offer-scheduling";

interface HomePageProps {
  params: Promise<{
    country: string;
    locale: string;
  }>;
}

export async function generateMetadata({
  params,
}: HomePageProps): Promise<Metadata> {
  const { country, locale } = await params;

  return generateHomeMetadata({ country, locale });
}

export default async function HomePage({ params }: HomePageProps) {
  const { country, locale } = await params;
  const basePath = `/${country}/${locale}`;
  const gamesPromise = getStorefrontGames(country, locale);
  const [data, userToken] = await Promise.all([getHomePageData(locale), getAccessToken()]);
  const plan = getHomeProductReadPlan(data);
  const now = new Date();
  const dayKey = madridDailyOfferDay(now).dayKey;

  const readProducts = async (params: ProductListParams) => {
    try {
      const response = await cachedListProducts(params, { locale, country }, "dtc", userToken);
      return response.data ?? [];
    } catch (error) {
      console.error("HomePuckRenderer: failed to load products", error);
      return [];
    }
  };

  const [catalogProducts, saleProducts, preorderProducts] = await Promise.all([
    plan.catalog.limit
      ? readProducts({ ...plan.catalog, tags_name_in: [TCG_CATALOG_TAG] })
      : [],
    plan.sale
      ? readProducts({ limit: 40, fields: PRODUCT_CARD_FIELDS, tags_name_in: [`offer-date:${dayKey}`] })
      : [],
    plan.preorder
      ? readProducts({ limit: 60, fields: PRODUCT_CARD_FIELDS, tags_name_in: ["devir-preorder"] })
      : [],
  ]);
  const products = buildHomeMerchandisingProducts(
    saleProducts.filter((product) => product.tags?.includes(TCG_CATALOG_TAG)),
    preorderProducts.filter((product) => product.tags?.includes(TCG_CATALOG_TAG)),
    now,
  );

  const storeUrl = getStoreUrl();
  const canonicalUrl = storeUrl
    ? buildCanonicalUrl(storeUrl, `/${country}/${locale}`)
    : undefined;

  return (
    <>
      {canonicalUrl && (
        <JsonLd data={buildWebSiteJsonLd(canonicalUrl, locale)} />
      )}
      <TcgGameDirectory games={await gamesPromise} basePath={basePath} locale={locale as Locale} />
      <HomePuckRenderer
        products={products}
        catalogProducts={catalogProducts}
        basePath={basePath}
        data={data}
      />
    </>
  );
}
