import "server-only";
import { getClient } from "@/lib/spree/config";
import { createSupabaseClient } from "@/lib/supabase/server";
import {
  assertCurrentOfferRotation,
  buildSocialOffers,
  type DailyOfferState,
  type PublicOfferProduct,
} from "./offers";

export async function getDailySocialOffers() {
  const db = createSupabaseClient();
  const { data, error } = await db
    .from("catalog_daily_offer_state")
    .select(
      "day_key,spree_price_list_id,last_rotated_at,last_error,active_products",
    )
    .eq("id", "primary")
    .maybeSingle();
  if (error) throw new Error("No se pudieron consultar las ofertas de hoy.");
  const state = data as DailyOfferState | null;
  // A paused or unfinished rotation cannot publish. Reject it before any Spree
  // reads; retrying yesterday's twelve products only spends compute.
  assertCurrentOfferRotation(state);
  const ids = [
    ...new Set(state?.active_products.map((p) => p.productId) ?? []),
  ];
  if (ids.length > 24)
    throw new Error("La selección diaria supera el límite previsto.");
  const { data: catalog, error: categoryError } = ids.length
    ? await db
        .from("catalog_products")
        .select("spree_product_id,category_key")
        .in("spree_product_id", ids)
    : { data: [], error: null };
  if (categoryError)
    throw new Error("No se pudieron comprobar las categorías.");
  // Recheck prices and shipping eligibility in one fresh DTC request.
  // The storefront's ID filter decodes native prefixed product IDs.
  let products: PublicOfferProduct[] = [];
  if (ids.length) {
    try {
      const response = await getClient().products.list(
        {
          id_in: ids,
          limit: ids.length,
          expand: ["variants", "default_variant"],
          fields: ["id", "name", "slug", "purchasable", "tags", "default_variant_id", "thumbnail_url"],
        },
        { country: "es", locale: "es", headers: { "Cache-Control": "no-cache" } },
      );
      products = response.data;
    } catch {
      throw new Error("No se pudo comprobar el catálogo para la publicación.");
    }
    // A missing or unexpected row must never stand in for a verified set.
    const returnedIds = new Set(products.map((product) => product.id));
    if (products.length !== ids.length || !ids.every((id) => returnedIds.has(id))) {
      throw new Error("No se pudo comprobar el catálogo para la publicación.");
    }
  }
  return buildSocialOffers(
    state,
    products,
    Object.fromEntries(
      (catalog ?? []).map((p) => [p.spree_product_id, p.category_key]),
    ),
  );
}
