"use server";

import { type Product, SpreeError } from "@spree/sdk";
import { cacheLife, cacheTag } from "next/cache";
import { getClient } from "@/lib/spree";

/** Public translated content only; commercial data keeps its shorter cache. */
export async function getProductTranslation(
  productId: string,
  options: { country: string; locale: string },
): Promise<Pick<
  Product,
  | "name"
  | "slug"
  | "description"
  | "description_html"
  | "meta_title"
  | "meta_description"
  | "meta_keywords"
> | null> {
  "use cache: remote";
  cacheLife("tenMinutes");
  cacheTag("products", `product:${productId}`);

  try {
    const product = await getClient().products.get(
      productId,
      { expand: [] },
      options,
    );
    const {
      name,
      slug,
      description,
      description_html,
      meta_title,
      meta_description,
      meta_keywords,
    } = product;
    return {
      name,
      slug,
      description,
      description_html,
      meta_title,
      meta_description,
      meta_keywords,
    };
  } catch (error) {
    if (error instanceof SpreeError && error.status === 404) return null;
    throw error;
  }
}
