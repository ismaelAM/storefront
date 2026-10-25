import type { Data } from "@puckeditor/core";
import { DEFAULT_HOME_DATA } from "@/lib/puck/home-defaults";
import { getSitePageData } from "./get-site-page-data";

/**
 * Fetch Home page data from Supabase
 * Returns DEFAULT_HOME_DATA if no published data exists
 *
 * Server-side only. Used by HomePage and EditorPage.
 */
export async function getHomePageData(): Promise<Data> {
  return getSitePageData("home", DEFAULT_HOME_DATA);
}
