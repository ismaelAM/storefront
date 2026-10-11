import "server-only";
import { getClient } from "@/lib/spree/config";
import { createSupabaseClient } from "@/lib/supabase/server";
import { buildSocialOffers, type DailyOfferState } from "./offers";

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
  const products = await Promise.allSettled(
    ids.map((id) =>
      getClient().products.get(
        id,
        {
          expand: ["variants", "default_variant"],
        },
        { country: "es", locale: "es" },
      ),
    ),
  );
  return buildSocialOffers(
    state,
    products.flatMap((p) => (p.status === "fulfilled" ? [p.value] : [])),
    Object.fromEntries(
      (catalog ?? []).map((p) => [p.spree_product_id, p.category_key]),
    ),
  );
}
