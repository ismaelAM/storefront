"use client";

import type { Data } from "@puckeditor/core";
import { Puck } from "@puckeditor/core";
import type { Category, Product } from "@spree/sdk";
import { EditorSectionNav } from "@/components/puck/EditorSectionNav";
import { PuckProductsProvider } from "@/components/puck/PuckProductsContext";
import { saveCategoryPageData } from "@/lib/puck/save-category-data";
import { categoryConfig } from "@/puck/category-config";

interface CategoryEditorClientProps {
  permalink: string;
  initialData: Data;
  products: Product[];
  categories: Category[];
  basePath: string;
}

export function CategoryEditorClient({
  permalink,
  initialData,
  products,
  categories,
  basePath,
}: CategoryEditorClientProps) {
  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <EditorSectionNav basePath={basePath} />
      <div className="min-h-0 flex-1">
        <PuckProductsProvider
          products={products}
          categories={categories}
          basePath={basePath}
        >
          <Puck
            config={categoryConfig}
            data={initialData}
            onPublish={async (data) => {
              await saveCategoryPageData(permalink, data);
            }}
          />
        </PuckProductsProvider>
      </div>
    </div>
  );
}
