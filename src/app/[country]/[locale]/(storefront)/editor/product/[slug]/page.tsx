import type { Data } from "@puckeditor/core";
import { notFound } from "next/navigation";
import { getCachedProduct, PRODUCT_PAGE_EXPAND } from "@/lib/data/cached";
import { getProductPageData } from "@/lib/puck/get-product-data";
import { ProductEditorClient } from "./ProductEditorClient";

interface ProductEditorPageProps {
  params: Promise<{
    country: string;
    locale: string;
    slug: string;
  }>;
}

export default async function ProductEditorPage({
  params,
}: ProductEditorPageProps) {
  const { slug } = await params;

  let product;
  try {
    product = await getCachedProduct(slug, PRODUCT_PAGE_EXPAND);
  } catch {
    notFound();
  }

  if (!product) {
    notFound();
  }

  const fallbackData: Data = {
    content: [
      {
        type: "ProductEditorial",
        props: {
          id: "product-editorial",
          title: "",
          text: "",
          image: "",
          buttonText: "",
          buttonUrl: "#",
          backgroundColor: "#ffffff",
          titleColor: "#111827",
          textColor: "#4b5563",
          buttonColor: "#111827",
          buttonTextColor: "#ffffff",
          alignment: "left",
          width: "large",
          position: "center",
          padding: "medium",
          imagePosition: "top",
          borderRadius: "medium",
        },
      },
    ],
    root: {},
  };

  const initialData = await getProductPageData(slug, fallbackData);

  return <ProductEditorClient slug={slug} initialData={initialData} />;
}
