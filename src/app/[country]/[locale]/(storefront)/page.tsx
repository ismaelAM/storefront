import type { Product } from "@spree/sdk";
import type { Metadata } from "next";
import { HomePuckRenderer } from "@/components/puck/HomePuckRenderer";
import { JsonLd } from "@/components/seo/JsonLd";
import { PRODUCT_CARD_FIELDS } from "@/lib/data/cached";
import { cachedListProducts } from "@/lib/data/products";
import { generateHomeMetadata } from "@/lib/metadata/home";
import { getHomePageData } from "@/lib/puck/get-home-data";
import { buildHomeMerchandisingProducts } from "@/lib/puck/home-merchandising";
import { buildCanonicalUrl, buildWebSiteJsonLd } from "@/lib/seo";
import { getAccessToken } from "@/lib/spree";
import { getStoreUrl } from "@/lib/store";
import { madridCommercialDay } from "../../../../../supabase/functions/_shared/commercial-pricing-policy";

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
  const userToken = await getAccessToken();
  const now = new Date();
  const dayKey = madridCommercialDay(now).dayKey;

  let products: Product[] = [];
  const catalogPromise = cachedListProducts(
    { limit: 100, fields: [...PRODUCT_CARD_FIELDS, "variants"], expand: ["variants"] },
    { locale, country },
    "dtc",
    userToken,
  ).catch((error) => {
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
      saleResponse.data ?? [],
      preorderResponse.data ?? [],
      now,
    );
  } catch (error) {
    console.error(
      "HomePuckRenderer: failed to build merchandising pool",
      error,
    );
  }

  const data = await getHomePageData();
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
      <HomePuckRenderer products={products} catalogProducts={catalogResponse.data ?? []} basePath={basePath} data={data} />
    </>
  );
}
