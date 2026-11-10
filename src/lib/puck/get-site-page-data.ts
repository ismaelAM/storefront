import type { Data } from "@puckeditor/core";
import { cacheLife, cacheTag } from "next/cache";
import { createSupabaseClient } from "@/lib/supabase/server";
import recovery from "./published-fallback.json";

async function getPublishedPageData(pageId: string): Promise<Data | null> {
  "use cache: remote";
  // Publishing invalidates this page's tag immediately; background checks can
  // be hourly without delaying successful editor publications.
  cacheLife({ stale: 300, revalidate: 3600, expire: 86400 });
  cacheTag(`puck-page:${pageId}`);

  const supabase = createSupabaseClient();
  const { data, error, status } = await supabase
    .from("pages")
    .select("published_data")
    .eq("page_id", pageId)
    .maybeSingle();

  // A quota block lasts until the billing reset. Cache a copy of actual
  // published content instead of retrying a known 402 on every render/build.
  // Other failures still reject: never cache a transient error as an empty page.
  if (error && status !== 402) throw new Error("Unable to load published Puck page");
  const saved = recovery.pages as Record<string, unknown>;
  const published = error
    ? Object.hasOwn(saved, pageId) ? saved[pageId] : null
    : data?.published_data;
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
