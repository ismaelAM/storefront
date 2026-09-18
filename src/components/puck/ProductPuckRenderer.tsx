"use client";

import { Render } from "@puckeditor/core";
import type { Data } from "@puckeditor/core";
import { productConfig } from "@/puck/product-config";

export function ProductPuckRenderer({ data }: { data: Data }) {
  return <Render config={productConfig} data={data} />;
}
