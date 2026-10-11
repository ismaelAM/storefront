import "server-only";
import { createSupabaseClient } from "@/lib/supabase/server";
import { OFFER_CATEGORIES, type SocialOfferSnapshot } from "./offers";
import type { PublicationRepository } from "./publication";
import { renderOfferSlide } from "./template";

const TABLE = "social_offer_publications";
export function createPublicationRepository(): PublicationRepository {
  const db = createSupabaseClient();
  return {
    async claim(key) {
      const { data, error } = await db.rpc("claim_social_offer_publication", {
        p_day: key.dayKey,
        p_account: key.accountId,
        p_token: key.token,
      });
      if (error) throw new Error("No se pudo reservar la publicación diaria.");
      let row = data?.[0];
      if (!row) {
        const result = await db
          .from(TABLE)
          .select("status,checkpoint,media_id")
          .eq("day_key", key.dayKey)
          .eq("account_id", key.accountId)
          .maybeSingle();
        if (result.error)
          throw new Error("No se pudo consultar la publicación diaria.");
        row = result.data;
        if (!row || row.status === "working" || row.status === "failed")
          return null;
      }
      return {
        status: row.status,
        checkpoint: row.checkpoint,
        mediaId: row.media_id,
      };
    },
    async saveCheckpoint(key, checkpoint, beforePublish) {
      const { data, error } = await db
        .from(TABLE)
        .update({
          checkpoint,
          ...(beforePublish ? { status: "publishing" } : {}),
          updated_at: new Date().toISOString(),
        })
        .eq("day_key", key.dayKey)
        .eq("account_id", key.accountId)
        .eq("lease_token", key.token)
        .in("status", ["working", "publishing"])
        .gt("lease_until", new Date().toISOString())
        .select("day_key");
      if (error || !data?.length)
        throw new Error(
          "La publicación perdió su reserva. No se repetirá automáticamente.",
        );
    },
    async finish(key, status, mediaId) {
      const { data, error } = await db
        .from(TABLE)
        .update({
          status,
          media_id: mediaId,
          lease_until: null,
          updated_at: new Date().toISOString(),
        })
        .eq("day_key", key.dayKey)
        .eq("account_id", key.accountId)
        .eq("lease_token", key.token)
        .in("status", ["working", "publishing"])
        .select("day_key");
      if (error || !data?.length)
        throw new Error(
          "No se pudo confirmar el resultado. Comprueba el estado antes de reintentar.",
        );
    },
  };
}

export async function preparePublicationImages(
  snapshot: SocialOfferSnapshot,
  hash: string,
  storeUrl: string,
): Promise<string[]> {
  const db = createSupabaseClient();
  const urls: string[] = [];
  // Immutable paths: a changed price can never overwrite media already sent to Meta.
  for (const [category, categoryLabel] of Object.entries(OFFER_CATEGORIES)) {
    const path = `${snapshot.dayKey}/${hash}/${category}.jpg`;
    const bucket = db.storage.from("daily-offers");
    const existing = await bucket.exists(path);
    // storage-js returns data=false AND a 400/404 error for a missing object;
    // permission/transport failures throw instead. A missing JPEG needs upload.
    if (existing.error && existing.data !== false)
      throw new Error("No se pudo comprobar la imagen diaria.");
    if (!existing.data) {
      const bytes = await renderOfferSlide({
        dayKey: snapshot.dayKey,
        categoryLabel,
        offers: snapshot.offers.filter((o) => o.category === category),
        logoUrl: process.env.STORE_LOGO_URL,
        storeUrl,
      });
      const { error } = await bucket.upload(path, bytes, {
        contentType: "image/jpeg",
        cacheControl: "86400",
        upsert: false,
      });
      // Concurrent account preparations may safely find the same immutable asset.
      if (error && error.message !== "The resource already exists")
        throw new Error("No se pudo guardar la imagen diaria.");
    }
    urls.push(bucket.getPublicUrl(path).data.publicUrl);
  }
  return urls;
}
