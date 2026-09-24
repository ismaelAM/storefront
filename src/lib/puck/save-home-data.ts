"use server";

import type { Data } from "@puckeditor/core";
import { saveSitePageData } from "./save-site-page-data";

export async function saveHomePageData(data: Data) {
  if (!data || typeof data !== "object" || !Array.isArray(data.content)) {
    throw new Error("Invalid Puck data");
  }

  await saveSitePageData("home", data);

  return { success: true };
}
