"use client";

import { Puck } from "@puckeditor/core";
import type { Category } from "@spree/sdk";
import type { Data } from "@puckeditor/core";
import { createNavigationConfig } from "@/puck/navigation-config";
import { saveSitePageData } from "@/lib/puck/save-site-page-data";

export function NavigationEditorClient({ categories, initialData }: { categories: Category[]; initialData: Data }) {
  const config = createNavigationConfig(categories);
  return (
    <Puck
      config={config}
      data={initialData}
      onPublish={async (data) => saveSitePageData("navigation", data)}
    />
  );
}
