"use client";

import { Puck } from "@puckeditor/core";
import { siteConfig } from "@/puck/site-config";
import { saveSitePageData } from "@/lib/puck/save-site-page-data";

export function CartEditorClient({ initialData }: { initialData: Parameters<typeof Puck>[0]["data"] }) {
  return (
    <Puck
      config={siteConfig}
      data={initialData}
      onPublish={async (data) => saveSitePageData("cart", data)}
    />
  );
}
