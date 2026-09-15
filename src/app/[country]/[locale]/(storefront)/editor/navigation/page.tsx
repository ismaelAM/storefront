import type { Data } from "@puckeditor/core";
import { connection } from "next/server";
import { getCategories } from "@/lib/data/categories";
import { getSitePageData } from "@/lib/puck/get-site-page-data";
import { NavigationEditorClient } from "./NavigationEditorClient";

interface Props {
  params: Promise<{ country: string; locale: string }>;
}

export default async function NavigationEditorPage({ params }: Props) {
  await connection();
  const { country, locale } = await params;
  const basePath = `/${country}/${locale}`;
  const response = await getCategories(
    { depth_eq: 0, expand: ["children.children"] },
    { country, locale },
  );
  const categories = response.data ?? [];
  const fallbackData: Data = {
    content: [
      {
        type: "Navigation",
        props: {
          id: "navigation",
          backgroundColor: "#ffffff",
          textColor: "#374151",
          hoverBackgroundColor: "#f3f4f6",
          hoverTextColor: "#111827",
          width: "medium",
          itemRadius: "medium",
          itemSpacing: "normal",
          items: categories.map((category) => ({
            categoryPermalink: category.permalink,
            labelOverride: "",
            visible: true,
          })),
        },
      },
    ],
    root: {},
  };
  const initialData = await getSitePageData("navigation", fallbackData);
  return (
    <NavigationEditorClient
      categories={categories}
      initialData={initialData}
      basePath={basePath}
    />
  );
}
