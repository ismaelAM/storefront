"use client";

import { Puck } from "@puckeditor/core";
import type { Data } from "@puckeditor/core";
import { saveSitePageData } from "@/lib/puck/save-site-page-data";
import { siteConfig } from "@/puck/site-config";

export function CartEditorClient({ initialData }: { initialData: Data }) {
  return (
    <Puck
      config={siteConfig}
      data={initialData}
      onPublish={async (data) => saveSitePageData("cart", data)}
    />
  );
}
