"use client";

import type { Data } from "@puckeditor/core";
import { Render } from "@puckeditor/core";
import type { Product } from "@spree/sdk";
import { PuckProductsProvider } from "@/components/puck/PuckProductsContext";
import { categoryConfig } from "@/puck/category-config";

export function CategoryPuckRenderer({
  data,
  products,
  basePath,
}: {
  data: Data;
  products: Product[];
  basePath: string;
}) {
  return (
    <PuckProductsProvider products={products} basePath={basePath}>
      <Render config={categoryConfig} data={data} />
    </PuckProductsProvider>
  );
}
