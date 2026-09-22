"use client";

import type { Data } from "@puckeditor/core";
import { Puck } from "@puckeditor/core";
import { EditorSectionNav } from "@/components/puck/EditorSectionNav";
import { saveSitePageData } from "@/lib/puck/save-site-page-data";
import { siteConfig } from "@/puck/site-config";

export function CartEditorClient({
  initialData,
  basePath,
}: {
  initialData: Data;
  basePath: string;
}) {
  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <EditorSectionNav basePath={basePath} />
      <div className="min-h-0 flex-1">
        <Puck
          config={siteConfig}
          data={initialData}
          onPublish={async (data) => saveSitePageData("cart", data)}
        />
      </div>
    </div>
  );
}
