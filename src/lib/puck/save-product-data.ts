"use server";

import type { Data } from "@puckeditor/core";
import { getProductPageId } from "@/lib/puck/get-product-data";
import { saveSitePageData } from "./save-site-page-data";

export async function saveProductPageData(slug: string, data: Data) {
  if (
    !slug ||
    !data ||
    typeof data !== "object" ||
    !Array.isArray(data.content)
  ) {
    throw new Error("Invalid product Puck data");
  }

  await saveSitePageData(getProductPageId(slug), data);

  return { success: true };
}
