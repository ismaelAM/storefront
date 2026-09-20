import { cache } from "react";
import type { Surface } from "@/lib/spree";
import { getCategory } from "./categories";
import { getProduct } from "./products";

export const PRODUCT_PAGE_EXPAND = [
  "default_variant",
  "variants",
  "media",
  "custom_fields",
  "option_types",
];

export const PRODUCT_METADATA_EXPAND = ["primary_media"];

/** Minimal fields used by cards, analytics and the Puck product filters. */
export const PRODUCT_CARD_FIELDS = [
  "id",
  "name",
  "slug",
  "thumbnail_url",
  "purchasable",
  "in_stock",
  "preorder",
  "preorder_ships_at",
  "tags",
  "default_variant_id",
  "price",
  "original_price",
  "categories",
  "option_values",
];

export const getCachedProduct = cache(
  (slugOrId: string, expand: string[], surface: Surface = "dtc") =>
    getProduct(slugOrId, { expand }, surface),
);

export const getCachedCategory = cache(
  (idOrPermalink: string, expand: string[]) =>
    getCategory(idOrPermalink, { expand }),
);