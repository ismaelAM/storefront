"use client";

import { Puck } from "@puckeditor/core";
import type { Data } from "@puckeditor/core";
import { categoryConfig } from "@/puck/category-config";
import { saveCategoryPageData } from "@/lib/puck/save-category-data";

export function CategoryEditorClient({
  permalink,
  initialData,
}: {
  permalink: string;
  initialData: Data;
}) {
  return (
    <Puck
      config={categoryConfig}
      data={initialData}
      onPublish={async (data) => {
        await saveCategoryPageData(permalink, data);
      }}
    />
  );
}
