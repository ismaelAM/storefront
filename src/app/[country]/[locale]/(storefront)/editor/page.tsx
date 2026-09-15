import type { Product, Category } from "@spree/sdk";
import { connection } from "next/server";
import { PRODUCT_CARD_FIELDS } from "@/lib/data/cached";
import { getProducts } from "@/lib/data/products";
import { getCategories } from "@/lib/data/categories";
import { getHomePageData } from "@/lib/puck/get-home-data";
import { EditorClient } from "./EditorClient";

interface EditorPageProps { params: Promise<{ country: string; locale: string }> }

export default async function EditorPage({ params }: EditorPageProps) {
  await connection();
  const { country, locale } = await params;
  let products: Product[] = [];
  let categories: Category[] = [];

  try {
    const [productsResponse, categoriesResponse] = await Promise.all([
      getProducts({ limit: 100, fields: PRODUCT_CARD_FIELDS }, "dtc"),
      getCategories({ depth_eq: 0, expand: ["children.children"] }, { country, locale }),
    ]);
    products = productsResponse.data ?? [];
    categories = categoriesResponse.data ?? [];
  } catch (error) {
    console.error("Editor: failed to load catalog options", error);
  }

  const initialData = await getHomePageData();
  return <EditorClient products={products} categories={categories} country={country} locale={locale} initialData={initialData} />;
}
