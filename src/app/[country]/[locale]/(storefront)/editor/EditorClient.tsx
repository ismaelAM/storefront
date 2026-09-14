"use client";

import { Puck } from "@puckeditor/core";
import type { Data } from "@puckeditor/core";
import type { Product } from "@spree/sdk";
import { PuckProductsProvider } from "@/components/puck/PuckProductsContext";
import { config } from "@/puck/config";
import { saveHomePageData } from "@/lib/puck/save-home-data";

interface EditorClientProps {
  products: Product[];
  country: string;
  locale: string;
  initialData: Data;
}

export function EditorClient({
  products,
  country,
  locale,
  initialData,
}: EditorClientProps) {
  return (
    <PuckProductsProvider
      products={products}
      basePath={`/${country}/${locale}`}
    >
      <Puck
        config={config}
        data={initialData}
        onPublish={async (data) => {
          await saveHomePageData(data);
        }}
      />
    </PuckProductsProvider>
  );
}
