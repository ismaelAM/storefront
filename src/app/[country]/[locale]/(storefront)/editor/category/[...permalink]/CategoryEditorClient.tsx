"use client";

import { Puck } from "@puckeditor/core";
import type { Data } from "@puckeditor/core";
import type { Product } from "@spree/sdk";
import { PuckProductsProvider } from "@/components/puck/PuckProductsContext";
import { EditorSectionNav } from "@/components/puck/EditorSectionNav";
import { categoryConfig } from "@/puck/category-config";
import { saveCategoryPageData } from "@/lib/puck/save-category-data";

export function CategoryEditorClient({ permalink, initialData, products, basePath }: { permalink: string; initialData: Data; products: Product[]; basePath: string }) {
  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <EditorSectionNav basePath={basePath} />
      <div className="min-h-0 flex-1">
        <PuckProductsProvider products={products} basePath={basePath}>
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
