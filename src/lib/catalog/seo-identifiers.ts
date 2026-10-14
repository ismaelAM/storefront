import "server-only";
import { createSupabaseClient } from "@/lib/supabase/server";

/** Public identifier only; prices and availability remain authoritative in Spree. */
export async function getCatalogGtin(
  productId: string,
  variantId: string,
): Promise<string | undefined> {
  if (!productId || !variantId) return undefined;
  try {
    const { data, error } = await createSupabaseClient()
      .from("catalog_variant_identifiers")
      .select(
        "value,catalog_variants!inner(spree_variant_id,catalog_products!inner(spree_product_id))",
      )
      .eq("namespace", "gtin")
      .eq("catalog_variants.spree_variant_id", variantId)
      .eq("catalog_variants.catalog_products.spree_product_id", productId)
      .maybeSingle();
    if (error || typeof data?.value !== "string") return undefined;
    // Only the explicit GTIN namespace, never supplier SKUs or family identities.
    return /^\d+$/.test(data.value) ? data.value : undefined;
  } catch {
    // Optional enrichment must not make the product unavailable.
    return undefined;
  }
}
