"use client";

import { Puck } from "@puckeditor/core";
import type { Data } from "@puckeditor/core";
import { productConfig } from "@/puck/product-config";
import { saveProductPageData } from "@/lib/puck/save-product-data";

export function ProductEditorClient({
  slug,
  initialData,
}: {
  slug: string;
  initialData: Data;
}) {
  return (
    <Puck
      config={productConfig}
      data={initialData}
      onPublish={async (data) => {
        await saveProductPageData(slug, data);
      }}
    />
  );
}
