"use server";

import type { Data } from "@puckeditor/core";
import { createSupabaseClient } from "@/lib/supabase/server";

export async function saveSitePageData(pageId: string, data: Data) {
  const supabase = createSupabaseClient();
  const { error } = await supabase.from("pages").upsert(
    {
      page_id: pageId,
      published_data: data,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "page_id" },
  );

  if (error) {
    console.error(`Error saving Puck page data for ${pageId}:`, error);
    throw new Error("No se ha podido guardar la página.");
  }
}
