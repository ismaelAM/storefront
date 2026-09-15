"use client";

import { Puck } from "@puckeditor/core";
import type { Data } from "@puckeditor/core";
import type { Product } from "@spree/sdk";
import { PuckProductsProvider } from "@/components/puck/PuckProductsContext";
import { categoryConfig } from "@/puck/category-config";
import { saveCategoryPageData } from "@/lib/puck/save-category-data";

export function CategoryEditorClient({
  permalink,
  initialData,
  products,
  basePath,
}: {
  permalink: string;
  initialData: Data;
  products: Product[];
  basePath: string;
}) {
  return (
    <PuckProductsProvider products={products} basePath={basePath}>
      <Puck
        config={categoryConfig}
        data={initialData}
        onPublish={async (data) => {
          await saveCategoryPageData(permalink, data);
        }}
      />
    </PuckProductsProvider>
  );
}
