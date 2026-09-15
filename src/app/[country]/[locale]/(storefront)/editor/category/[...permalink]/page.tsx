import type { Data } from "@puckeditor/core";
import { notFound } from "next/navigation";
import { getCategory, getCategoryProducts } from "@/lib/data/categories";
import { getCategoryPageData } from "@/lib/puck/get-category-data";
import { CategoryEditorClient } from "./CategoryEditorClient";

interface CategoryEditorPageProps {
  params: Promise<{
    country: string;
    locale: string;
    permalink: string[];
  }>;
}

export default async function CategoryEditorPage({
  params,
}: CategoryEditorPageProps) {
  const { country, locale, permalink } = await params;
  const fullPermalink = permalink.join("/");

  const category = await getCategory(fullPermalink);
  if (!category) {
    notFound();
  }

  const products = await getCategoryProducts(category.id, { limit: 8 });

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
    ],
    root: {},
  };

  const initialData = await getCategoryPageData(fullPermalink, fallbackData);

  return (
    <CategoryEditorClient
      permalink={fullPermalink}
      initialData={initialData}
      products={products.data ?? []}
      basePath={`/${country}/${locale}`}
    />
  );
}
