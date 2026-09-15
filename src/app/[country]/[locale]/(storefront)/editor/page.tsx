import type { Product } from "@spree/sdk";
import { connection } from "next/server";
import { PRODUCT_CARD_FIELDS } from "@/lib/data/cached";
import { getProducts } from "@/lib/data/products";
import { getHomePageData } from "@/lib/puck/get-home-data";
import { EditorClient } from "./EditorClient";

interface EditorPageProps {
  params: Promise<{
    country: string;
    locale: string;
  }>;
}

export default async function EditorPage({ params }: EditorPageProps) {
  await connection();
  const { country, locale } = await params;

  let products: Product[] = [];

  try {
    const response = await getProducts(
      {
        limit: 8,
        fields: PRODUCT_CARD_FIELDS,
      },
      "dtc",
    );

    products = response.data ?? [];
  } catch (error) {
    console.error("Editor: failed to load products", error);
  }

  const initialData = await getHomePageData();

  return (
    <EditorClient
      products={products}
      country={country}
      locale={locale}
      initialData={initialData}
    />
  );
}
