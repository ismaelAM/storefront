"use client";

import { Puck } from "@puckeditor/core";
import type { Data } from "@puckeditor/core";
import type { Product } from "@spree/sdk";
import { PuckProductsProvider } from "@/components/puck/PuckProductsContext";
import { enhancedConfig } from "@/puck/enhanced-config";
import { saveSitePageData } from "@/lib/puck/save-site-page-data";

interface Props {
  products: Product[];
  basePath: string;
  pageId: string;
  initialData: Data;
}

export function ProductsEditorClient({ products, basePath, pageId, initialData }: Props) {
  return (
    <div className="min-h-0 flex-1">
      <PuckProductsProvider products={products} basePath={basePath}>
        <Puck
          config={enhancedConfig}
          data={initialData}
          onPublish={async (data) => {
            await saveSitePageData(pageId, data);
          }}
        />
      </PuckProductsProvider>
    </div>
  );
}
