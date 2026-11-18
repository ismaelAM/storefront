import { cache } from "react";
import type { Surface } from "@/lib/spree";
import { getCategory } from "./categories";
import { getProduct } from "./products";

export const PRODUCT_PAGE_EXPAND = [
  "primary_media",
  "default_variant",
  "variants",
  "media",
  "custom_fields",
  "option_types",
  // Spree currently returns 500 for category expansion on a large subset of
  // catalog-managed products. Load breadcrumb categories separately instead.
];

// Fields used by SSR metadata/structured data, the page and its cart controls.
// Spree includes expanded relations alongside this sparse top-level selection.
export const PRODUCT_PAGE_FIELDS = [
  "id",
  "name",
  "slug",
  "description",
  "description_html",
  "meta_title",
  "meta_description",
  "meta_keywords",
  "thumbnail_url",
  "price",
  "original_price",
  "default_variant_id",
  "purchasable",
  "in_stock",
  "backorderable",
  "preorder",
  "preorder_ships_at",
  "tags",
  "categories",
] satisfies Array<keyof import("@spree/sdk").Product>;

/** Standard listings need neither editorial option data nor shipping dates. */
export const PRODUCT_LIST_FIELDS = [
  "id", "name", "slug", "thumbnail_url", "purchasable", "in_stock",
  "preorder", "tags", "default_variant_id", "price", "original_price",
  "categories",
];

// React cache keys compare array references. SEO and body must share the exact
// expansion and reference so one product request serves both during rendering.
export const PRODUCT_METADATA_EXPAND = PRODUCT_PAGE_EXPAND;

/** Editorial lanes additionally show the expected release date. */
export const PRODUCT_CARD_FIELDS = [...PRODUCT_LIST_FIELDS, "preorder_ships_at"];

export const getCachedProduct = cache(
  (slugOrId: string, expand: string[], surface: Surface = "dtc") =>
    getProduct(slugOrId, { expand, fields: PRODUCT_PAGE_FIELDS }, surface),
);

export const getCachedCategory = cache(
  (idOrPermalink: string, expand: string[]) =>
    getCategory(idOrPermalink, { expand }),
);
