"use client";

import { Puck } from "@puckeditor/core";
import type { Data } from "@puckeditor/core";
import { EditorSectionNav } from "@/components/puck/EditorSectionNav";
import { productConfig } from "@/puck/product-config";
import { saveProductPageData } from "@/lib/puck/save-product-data";

export function ProductEditorClient({ slug, initialData, basePath }: { slug: string; initialData: Data; basePath: string }) {
  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <EditorSectionNav basePath={basePath} />
      <div className="min-h-0 flex-1">
        <Puck
          config={productConfig}
          data={initialData}
          onPublish={async (data) => {
            await saveProductPageData(slug, data);
          }}
        />
      </div>
    </div>
  );
}
