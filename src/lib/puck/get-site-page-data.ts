import type { Data } from "@puckeditor/core";
import { cacheLife, cacheTag } from "next/cache";
import { createSupabaseClient } from "@/lib/supabase/server";

async function getPublishedPageData(pageId: string): Promise<Data | null> {
  "use cache: remote";
  cacheLife("tenMinutes");
  cacheTag(`puck-page:${pageId}`);

  const supabase = createSupabaseClient();
  const { data, error } = await supabase
    .from("pages")
    .select("published_data")
    .eq("page_id", pageId)
    .maybeSingle();

  // Reject inside the cache boundary: a transient outage must not persist a
  // default page in place of the editor's published content for ten minutes.
  if (error) throw new Error("Unable to load published Puck page");
  const published = data?.published_data;
  return published &&
    typeof published === "object" &&
    Array.isArray(published.content)
    ? (published as Data)
    : null;
}

export async function getSitePageData(
  pageId: string,
  fallback: Data,
): Promise<Data> {
  try {
    return (await getPublishedPageData(pageId)) ?? fallback;
  } catch (error) {
    console.error(`Error fetching Puck page data for ${pageId}:`, error);
    return fallback;
  }
}
