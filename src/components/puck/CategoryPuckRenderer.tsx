"use client";

import { Render } from "@puckeditor/core";
import type { Data } from "@puckeditor/core";
import { categoryConfig } from "@/puck/category-config";

export function CategoryPuckRenderer({ data }: { data: Data }) {
  return <Render config={categoryConfig} data={data} />;
}
