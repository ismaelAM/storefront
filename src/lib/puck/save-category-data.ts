"use server";

import type { Data } from "@puckeditor/core";
import { getCategoryPageId } from "@/lib/puck/get-category-data";
import { saveSitePageData } from "./save-site-page-data";

export async function saveCategoryPageData(permalink: string, data: Data) {
  if (!permalink || !data || typeof data !== "object" || !Array.isArray(data.content)) {
    throw new Error("Invalid category Puck data");
  }

  await saveSitePageData(getCategoryPageId(permalink), data);

  return { success: true };
}
