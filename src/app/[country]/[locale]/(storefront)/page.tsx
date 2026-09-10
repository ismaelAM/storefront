import type { Product } from "@spree/sdk";
import type { Metadata } from "next";
import { HomePuckRenderer } from "@/components/puck/HomePuckRenderer";
import { PRODUCT_CARD_FIELDS } from "@/lib/data/cached";
import { cachedListProducts } from "@/lib/data/products";
import { generateHomeMetadata } from "@/lib/metadata/home";
import { getAccessToken } from "@/lib/spree";

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

  return generateHomeMetadata({
    country,
    locale,
  });
}

export default async function HomePage({ params }: HomePageProps) {
  const { country, locale } = await params;

  const basePath = `/${country}/${locale}`;
  const userToken = await getAccessToken();

  let products: Product[] = [];

  try {
    const response = await cachedListProducts(
      {
        limit: 8,
        fields: PRODUCT_CARD_FIELDS,
      },
      {
        locale,
        country,
      },
      "dtc",
      userToken,
    );

    products = response.data ?? [];
  } catch (error) {
    console.error("HomePuckRenderer: failed to load products", error);
  }

  return <HomePuckRenderer products={products} basePath={basePath} />;
}
