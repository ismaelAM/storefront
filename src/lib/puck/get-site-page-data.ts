import type { Data } from "@puckeditor/core";
import { createSupabaseClient } from "@/lib/supabase/server";

export async function getSitePageData(
  pageId: string,
  fallback: Data,
): Promise<Data> {
  try {
    const supabase = createSupabaseClient();
    const { data, error } = await supabase
      .from("pages")
      .select("published_data")
      .eq("page_id", pageId)
      .maybeSingle();

    if (error || !data?.published_data) {
      return fallback;
    }

    if (
      typeof data.published_data === "object" &&
      Array.isArray(data.published_data.content)
    ) {
      return data.published_data as Data;
    }

    return fallback;
  } catch (error) {
    console.error(`Error fetching Puck page data for ${pageId}:`, error);
    return fallback;
  }
}
