import type { Data } from "@puckeditor/core";
import { DEFAULT_HOME_DATA } from "@/lib/puck/home-defaults";
import { createSupabaseClient } from "@/lib/supabase/server";

/**
 * Fetch Home page data from Supabase
 * Returns DEFAULT_HOME_DATA if no published data exists
 *
 * Server-side only. Used by HomePage and EditorPage.
 */
export async function getHomePageData(): Promise<Data> {
  try {
    const supabase = createSupabaseClient();

    const { data, error } = await supabase
      .from("pages")
      .select("published_data")
      .eq("page_id", "home")
      .maybeSingle();

    if (error) {
      console.error("Supabase error fetching home data:", error);
      return DEFAULT_HOME_DATA;
    }

    // If no data found or no published_data field, return default
    if (!data || !data.published_data) {
      return DEFAULT_HOME_DATA;
    }

    // Validate that it's a proper Data structure
    if (
      typeof data.published_data === "object" &&
      Array.isArray(data.published_data.content)
    ) {
      return data.published_data as Data;
    }

    return DEFAULT_HOME_DATA;
  } catch (err) {
    console.error("Error fetching home page data:", err);
    return DEFAULT_HOME_DATA;
  }
}
