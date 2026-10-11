import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { getStoreUrl } from "@/lib/store";
import { madridCommercialDay } from "../../../supabase/functions/_shared/commercial-pricing-policy";
import { getDailySocialOffers } from "./data";
import {
  type InstagramCheckpoint,
  type InstagramConfig,
  type InstagramPublishOptions,
  type InstagramPublishResult,
  InstagramPublishUncertainError,
  publishInstagramCarousel,
  readInstagramConfig,
} from "./instagram";
import {
  OFFER_CATEGORIES,
  offerCaption,
  type SocialOfferSnapshot,
} from "./offers";
import {
  createPublicationRepository,
  preparePublicationImages,
} from "./publication-store";

export type PublicationStatus =
  | "working"
  | "publishing"
  | "prepared"
  | "published"
  | "failed"
  | "uncertain";
export interface PublicationKey {
  dayKey: string;
  accountId: string;
  token: string;
}
export interface PublicationRepository {
  claim(key: PublicationKey): Promise<{
    status: PublicationStatus;
    checkpoint: InstagramCheckpoint | null;
    mediaId: string | null;
  } | null>;
  saveCheckpoint(
    key: PublicationKey,
    checkpoint: InstagramCheckpoint,
    beforePublish: boolean,
  ): Promise<void>;
  finish(
    key: PublicationKey,
    status: PublicationStatus,
    mediaId: string | null,
  ): Promise<void>;
}
export interface PublicationDependencies {
  getSnapshot(): Promise<SocialOfferSnapshot>;
  config: InstagramConfig;
  storeUrl: string;
  repo: PublicationRepository;
  prepareImages(snapshot: SocialOfferSnapshot, hash: string): Promise<string[]>;
  publish(
    config: InstagramConfig,
    input: { imageUrls: string[]; caption: string },
    options: InstagramPublishOptions,
  ): Promise<InstagramPublishResult>;
  now(): Date;
}
function snapshotHash(snapshot: SocialOfferSnapshot) {
  return createHash("sha256").update(JSON.stringify(snapshot)).digest("hex");
}

export async function executeDailyPublication(deps: PublicationDependencies) {
  const snapshot = await deps.getSnapshot();
  if (snapshot.dayKey !== madridCommercialDay(deps.now()).dayKey)
    throw new Error("Las ofertas han caducado.");
  if (
    Object.keys(OFFER_CATEGORIES).some(
      (category) =>
        snapshot.offers.filter((o) => o.category === category).length !== 3,
    )
  ) {
    return {
      status: "incomplete",
      message:
        "La selección de hoy no completa tres ofertas válidas por categoría. Puedes descargar las disponibles.",
    };
  }
  const key = {
    dayKey: snapshot.dayKey,
    accountId: deps.config.configured ? deps.config.accountId : "download",
    token: randomUUID(),
  };
  const claim = await deps.repo.claim(key);
  if (!claim)
    return { status: "busy", message: "Ya hay una preparación en curso." };
  if (claim.status !== "working")
    return {
      status: claim.status,
      ...(claim.mediaId ? { mediaId: claim.mediaId } : {}),
      message:
        claim.status === "uncertain" || claim.status === "publishing"
          ? "Comprueba Instagram antes de reintentar: el envío anterior no tiene confirmación definitiva."
          : "La tarea de hoy ya está completada.",
    };
  let attempted = Boolean(claim.checkpoint?.publishAttempted);
  try {
    const hash = snapshotHash(snapshot);
    const imageUrls = await deps.prepareImages(snapshot, hash);
    if (!deps.config.configured) {
      await deps.repo.finish(key, "prepared", null);
      return {
        status: "prepared",
        message:
          "Imágenes listas. Falta conectar la cuenta profesional de Instagram.",
      };
    }
    const result = await deps.publish(
      deps.config,
      { imageUrls, caption: offerCaption(snapshot, deps.storeUrl) },
      {
        checkpoint: claim.checkpoint ?? undefined,
        maxPollAttempts: 3,
        pollIntervalMs: 2_000,
        requestTimeoutMs: 10_000,
        onCheckpoint: (checkpoint) =>
          deps.repo.saveCheckpoint(key, checkpoint, false),
        beforePublish: async (checkpoint) => {
          const fresh = await deps.getSnapshot();
          if (
            fresh.dayKey !== madridCommercialDay(deps.now()).dayKey ||
            snapshotHash(fresh) !== hash
          ) {
            throw new Error(
              "Las ofertas han cambiado. No se publicarán precios antiguos.",
            );
          }
          // A failed acknowledgement may follow a successful durable write.
          attempted = true;
          await deps.repo.saveCheckpoint(key, checkpoint, true);
        },
      },
    );
    await deps.repo.finish(key, "published", result.mediaId);
    return {
      status: "published",
      mediaId: result.mediaId,
      message: "Carrusel publicado en Instagram.",
    };
  } catch (error) {
    const uncertain =
      attempted || error instanceof InstagramPublishUncertainError;
    await deps.repo.finish(
      key,
      uncertain ? "uncertain" : "failed",
      error instanceof InstagramPublishUncertainError
        ? (error.publishedMediaId ?? null)
        : null,
    );
    throw error;
  }
}

export async function runDailySocialPublication() {
  const storeUrl = getStoreUrl();
  if (!storeUrl?.startsWith("https://"))
    throw new Error("La dirección pública de la tienda no está configurada.");
  return executeDailyPublication({
    getSnapshot: getDailySocialOffers,
    config: readInstagramConfig(),
    storeUrl,
    repo: createPublicationRepository(),
    prepareImages: (snapshot, hash) =>
      preparePublicationImages(snapshot, hash, storeUrl),
    publish: publishInstagramCarousel,
    now: () => new Date(),
  });
}
