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
  // Fresh guest DTC requests: never use a customer token or cached account prices.
  // Keep below the native session-pool limit even while web traffic is active.
  // A failed read is an upstream failure, not proof an offer is unavailable.
  const products: PublicOfferProduct[] = [];
  for (let offset = 0; offset < ids.length; offset += 2) {
    const batch = await Promise.allSettled(
      ids.slice(offset, offset + 2).map((id) =>
        getClient().products.get(
          id,
          {
            expand: ["variants", "default_variant"],
            fields: [
              "id",
              "name",
              "slug",
              "purchasable",
              "tags",
              "default_variant_id",
              "thumbnail_url",
              "price",
              "original_price",
              "variants",
              "default_variant",
            ],
          },
          { country: "es", locale: "es" },
        ),
      ),
    );
    if (batch.some((result) => result.status === "rejected"))
      throw new Error("No se pudo comprobar el catálogo para la publicación.");
    for (const result of batch) {
      if (result.status === "fulfilled") products.push(result.value);
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
