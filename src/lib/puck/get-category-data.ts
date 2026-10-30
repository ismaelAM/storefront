import type { Data } from "@puckeditor/core";
import { getSitePageData } from "./get-site-page-data";

export function getCategoryPageId(permalink: string) {
  return `category:${permalink}`;
}

export async function getCategoryPageData(
  permalink: string,
  fallback: Data,
): Promise<Data> {
  return getSitePageData(getCategoryPageId(permalink), fallback);
}
