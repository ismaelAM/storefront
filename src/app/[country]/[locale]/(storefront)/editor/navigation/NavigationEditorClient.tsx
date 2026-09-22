"use client";

import type { Data } from "@puckeditor/core";
import { Puck } from "@puckeditor/core";
import type { Category } from "@spree/sdk";
import { EditorSectionNav } from "@/components/puck/EditorSectionNav";
import { saveSitePageData } from "@/lib/puck/save-site-page-data";
import { createNavigationConfig } from "@/puck/navigation-config";

export function NavigationEditorClient({
  categories,
  initialData,
  basePath,
}: {
  categories: Category[];
  initialData: Data;
  basePath: string;
}) {
  const config = createNavigationConfig(categories);

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <EditorSectionNav basePath={basePath} />
      <div className="min-h-0 flex-1">
        <Puck
          config={config}
          data={initialData}
          onPublish={async (data) => saveSitePageData("navigation", data)}
        />
      </div>
    </div>
  );
}
