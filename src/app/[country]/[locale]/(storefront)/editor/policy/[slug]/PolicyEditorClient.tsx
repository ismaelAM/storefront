"use client";

import type { Data } from "@puckeditor/core";
import { Puck } from "@puckeditor/core";
import { saveSitePageData } from "@/lib/puck/save-site-page-data";
import { siteConfig } from "@/puck/site-config";

export function PolicyEditorClient({
  slug,
  initialData,
}: {
  slug: string;
  initialData: Data;
}) {
  return (
    <Puck
      config={siteConfig}
      data={initialData}
      onPublish={async (data) => saveSitePageData(`policy:${slug}`, data)}
    />
  );
}
