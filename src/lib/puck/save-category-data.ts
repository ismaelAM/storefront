"use server";

import type { Data } from "@puckeditor/core";
import { getCategoryPageId } from "@/lib/puck/get-category-data";
import { createSupabaseClient } from "@/lib/supabase/server";

export async function saveCategoryPageData(permalink: string, data: Data) {
  if (!permalink || !data || typeof data !== "object" || !Array.isArray(data.content)) {
    throw new Error("Invalid category Puck data");
  }

  const supabase = createSupabaseClient();
  const { error } = await supabase.from("pages").upsert(
    {
      page_id: getCategoryPageId(permalink),
      published_data: data,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "page_id" },
  );

  if (error) {
    console.error("Supabase error saving category data:", error);
    throw new Error("Failed to save category page data");
  }

  return { success: true };
}
