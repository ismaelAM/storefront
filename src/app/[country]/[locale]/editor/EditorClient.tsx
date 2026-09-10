"use client";

import { Puck } from "@puckeditor/core";
import type { Product } from "@spree/sdk";
import { PuckProductsProvider } from "@/components/puck/PuckProductsContext";
import { config } from "@/puck/config";

interface EditorClientProps {
  products: Product[];
  country: string;
  locale: string;
}

export function EditorClient({ products, country, locale }: EditorClientProps) {
  const basePath = `/${country}/${locale}`;

  return (
    <PuckProductsProvider products={products} basePath={basePath}>
      <Puck
        config={config}
        data={{
          content: [],
          root: {},
        }}
      />
    </PuckProductsProvider>
  );
}
