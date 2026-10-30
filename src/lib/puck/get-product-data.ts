import type { Data } from "@puckeditor/core";
import { getSitePageData } from "./get-site-page-data";

export function getProductPageId(slug: string) {
  return `product:${slug}`;
}

export async function getProductPageData(
  slug: string,
  fallback: Data,
): Promise<Data> {
  return getSitePageData(getProductPageId(slug), fallback);
}
