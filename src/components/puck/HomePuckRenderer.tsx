"use client";

import { Render } from "@puckeditor/core";
import type { Data } from "@puckeditor/core";
import type { Product } from "@spree/sdk";
import { PuckProductsProvider } from "@/components/puck/PuckProductsContext";
import { enhancedConfig } from "@/puck/home-enhanced-config";

interface HomePuckRendererProps {
  products: Product[];
  basePath: string;
  data: Data;
}

export function HomePuckRenderer({
  products,
  basePath,
  data,
}: HomePuckRendererProps) {
  return (
    <PuckProductsProvider products={products} basePath={basePath}>
      <Render config={enhancedConfig} data={data} />
    </PuckProductsProvider>
  );
}
