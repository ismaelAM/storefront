"use server";

import type { Data } from "@puckeditor/core";
import { createSupabaseClient } from "@/lib/supabase/server";
import { assertPuckEditorAccess } from "./editor-auth";

export async function saveSitePageData(pageId: string, data: Data) {
  await assertPuckEditorAccess();

  if (typeof pageId !== "string" || !pageId.trim() || !data || typeof data !== "object" || !Array.isArray(data.content)) {
    throw new Error("Invalid Puck data");
  }

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
