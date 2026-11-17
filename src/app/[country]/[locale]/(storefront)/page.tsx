import type { Product } from "@spree/sdk";
import type { Metadata } from "next";
import { TcgGameDirectory } from "@/components/layout/TcgGameDirectory";
import { getStorefrontGames } from "@/lib/data/storefront-games";
import { HomePuckRenderer } from "@/components/puck/HomePuckRenderer";
import { JsonLd } from "@/components/seo/JsonLd";
import { PRODUCT_CARD_FIELDS } from "@/lib/data/cached";
import { cachedListProducts } from "@/lib/data/products";
import { generateHomeMetadata } from "@/lib/metadata/home";
import { getHomePageData } from "@/lib/puck/get-home-data";
import { getHomeCatalogParams } from "@/lib/puck/home-catalog";
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
  const dataPromise = getHomePageData(locale);
  const gamesPromise = getStorefrontGames(country, locale);
  const userToken = await getAccessToken();
  const now = new Date();
  const dayKey = madridDailyOfferDay(now).dayKey;

  let products: Product[] = [];
  const catalogPromise = dataPromise
    .then((data) => {
      const params = getHomeCatalogParams(data);
      return params.limit === 0
        ? { data: [] as Product[] }
        : cachedListProducts({ ...params, tags_name_in: [TCG_CATALOG_TAG] }, { locale, country }, "dtc", userToken);
    })
    .catch((error) => {
      console.error("HomePuckRenderer: failed to load catalog", error);
      return { data: [] as Product[] };
    });

  try {
    const [saleResponse, preorderResponse] = await Promise.all([
      cachedListProducts(
        {
          limit: 40,
          fields: PRODUCT_CARD_FIELDS,
          tags_name_in: [`offer-date:${dayKey}`],
        },
        { locale, country },
        "dtc",
        userToken,
      ),
      cachedListProducts(
        {
          limit: 60,
          fields: PRODUCT_CARD_FIELDS,
          tags_name_in: ["devir-preorder"],
        },
        { locale, country },
        "dtc",
        userToken,
      ),
    ]);

    products = buildHomeMerchandisingProducts(
      (saleResponse.data ?? []).filter((product) => product.tags?.includes(TCG_CATALOG_TAG)),
      (preorderResponse.data ?? []).filter((product) => product.tags?.includes(TCG_CATALOG_TAG)),
      now,
    );
  } catch (error) {
    console.error(
      "HomePuckRenderer: failed to build merchandising pool",
      error,
    );
  }

  const data = await dataPromise;
  const catalogResponse = await catalogPromise;
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
        catalogProducts={catalogResponse.data ?? []}
        basePath={basePath}
        data={data}
      />
    </>
  );
}
