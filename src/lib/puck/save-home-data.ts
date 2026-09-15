"use server";

import type { Data } from "@puckeditor/core";
import { createSupabaseClient } from "@/lib/supabase/server";
import { assertPuckEditorAccess } from "./editor-auth";

export async function saveHomePageData(data: Data) {
  await assertPuckEditorAccess();

  if (!data || typeof data !== "object" || !Array.isArray(data.content)) {
    throw new Error("Invalid Puck data");
  }

  const supabase = createSupabaseClient();

  const { error } = await supabase.from("pages").upsert(
    {
      page_id: "home",
      published_data: data,
      updated_at: new Date().toISOString(),
    },
    {
      onConflict: "page_id",
    },
  );

  if (error) {
    console.error("Supabase error saving home data:", error);
    throw new Error("Failed to save Home page data");
  }

  return { success: true };
}
