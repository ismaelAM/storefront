"use client";

import { Puck } from "@puckeditor/core";
import type { Data } from "@puckeditor/core";
import type { Category, Product } from "@spree/sdk";
import { PuckProductsProvider } from "@/components/puck/PuckProductsContext";
import { EditorSectionNav } from "@/components/puck/EditorSectionNav";
import { enhancedConfig } from "@/puck/enhanced-config";
import { saveHomePageData } from "@/lib/puck/save-home-data";

interface EditorClientProps {
  products: Product[];
  categories: Category[];
  country: string;
  locale: string;
  initialData: Data;
}

export function EditorClient({ products, categories, country, locale, initialData }: EditorClientProps) {
  const basePath = `/${country}/${locale}`;
  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <EditorSectionNav basePath={basePath} />
      <div className="min-h-0 flex-1">
        <PuckProductsProvider products={products} categories={categories} basePath={basePath}>
          <Puck config={enhancedConfig} data={initialData} onPublish={async (data) => { await saveHomePageData(data); }} />
        </PuckProductsProvider>
      </div>
    </div>
  );
}
