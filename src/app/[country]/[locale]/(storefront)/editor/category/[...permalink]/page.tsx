import type { Category, Product } from "@spree/sdk";
import type { Data } from "@puckeditor/core";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { PRODUCT_CARD_FIELDS } from "@/lib/data/cached";
import { getCategories, getCategory } from "@/lib/data/categories";
import { getProducts } from "@/lib/data/products";
import { getCategoryPageData } from "@/lib/puck/get-category-data";
import { CategoryEditorClient } from "./CategoryEditorClient";

interface CategoryEditorPageProps {
  params: Promise<{
    country: string;
    locale: string;
    permalink: string[];
  }>;
}

export default async function CategoryEditorPage({ params }: CategoryEditorPageProps) {
  await connection();
  const { country, locale, permalink } = await params;
  const fullPermalink = permalink.join("/");

  const category = await getCategory(fullPermalink);
  if (!category) {
    notFound();
  }

  let products: Product[] = [];
  let categories: Category[] = [];
  try {
    const [productsResponse, categoriesResponse] = await Promise.all([
      getProducts(
        {
          limit: 100,
          fields: PRODUCT_CARD_FIELDS,
          expand: ["variants", "categories"],
        },
        "dtc",
      ),
      getCategories({ depth_eq: 0, expand: ["children.children"] }, { country, locale }),
    ]);
    products = productsResponse.data ?? [];
    categories = categoriesResponse.data ?? [];
  } catch (error) {
    console.error("Category editor: failed to load catalog options", error);
  }

  const fallbackData: Data = {
    content: [
      {
        type: "CategoryHero",
        props: {
          id: "category-hero",
          title: category.name,
          description: category.description ?? "",
          backgroundImage: category.image_url ?? "",
          backgroundColor: "#f9fafb",
          titleColor: "#111827",
          textColor: "#4b5563",
          minHeight: "medium",
        },
      },
      {
        type: "ProductGrid",
        props: {
          id: "category-products",
          title: "Productos",
          subtitle: "",
          productCount: "8",
          productFilter: "all",
          productSort: "default",
          columns: "4",
          imageAspect: "square",
          cardRadius: "medium",
          backgroundColor: "#ffffff",
          cardBackgroundColor: "#ffffff",
          titleColor: "#111827",
          textColor: "#6b7280",
          priceColor: "#111827",
        },
      },
    ],
    root: {},
  };

  const initialData = await getCategoryPageData(fullPermalink, fallbackData);

  return (
    <CategoryEditorClient
      permalink={fullPermalink}
      initialData={initialData}
      products={products}
      categories={categories}
      basePath={`/${country}/${locale}`}
    />
  );
}
