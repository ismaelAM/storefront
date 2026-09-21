import { cache } from "react";
import { createSupabaseClient } from "@/lib/supabase/server";

/** Resolve the current Spree product behind an old grouped Devir manga URL. */
export const getLegacyGroupedSpreeProductId = cache(
  async (groupKey: string): Promise<string | null> => {
    if (!groupKey) return null;
    try {
      const supabase = createSupabaseClient();
      const { data, error } = await supabase
        .from("devir_sync_catalog")
        .select("spree_product_id")
        .eq("group_key", groupKey)
        .eq("item_kind", "variant_candidate")
        .not("spree_product_id", "is", null)
        .limit(1);
      if (error) throw error;
      return data?.[0]?.spree_product_id ?? null;
    } catch (error) {
      console.error("Failed to resolve legacy grouped product", error);
      return null;
    }
  },
);
