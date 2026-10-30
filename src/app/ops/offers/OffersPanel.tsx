"use client";

import { useCallback, useEffect, useState } from "react";
import {
  OFFER_CATEGORIES,
  type SocialOfferSnapshot,
} from "@/lib/social/offers";

interface OfferResponse {
  snapshot: SocialOfferSnapshot;
  caption: string;
  instagramConfigured: boolean;
}

const buttonClass =
  "rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm font-medium text-neutral-700 disabled:opacity-50";

export function OffersPanel() {
  const [data, setData] = useState<OfferResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [checkingConnection, setCheckingConnection] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [revision, setRevision] = useState(0);
  const [failedImages, setFailedImages] = useState<string[]>([]);

  const load = useCallback(async (signal?: AbortSignal) => {
    setBusy(true);
    setData(null);
    setError("");
    setMessage("");
    setFailedImages([]);
    try {
      const response = await fetch("/api/internal/offers", {
        credentials: "same-origin",
        cache: "no-store",
        signal,
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(
          response.status === 401
            ? "La sesión ha caducado. Vuelve a entrar con la clave de operaciones."
            : result.error || "No se pudieron cargar las ofertas.",
        );
      if (signal?.aborted) return;
      setData(result as OfferResponse);
      setRevision((value) => value + 1);
    } catch (cause) {
      if (!signal?.aborted)
        setError(
          cause instanceof Error
            ? cause.message
            : "No se pudieron cargar las ofertas.",
        );
    } finally {
      if (!signal?.aborted) setBusy(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  async function copyCaption() {
    if (!data) return;
    try {
      await navigator.clipboard.writeText(data.caption);
      setMessage(
        "Texto copiado. Puedes pegarlo junto a las imágenes en Instagram.",
      );
    } catch {
      setMessage(
        "No se pudo copiar automáticamente. Selecciona y copia el texto del recuadro.",
      );
    }
  }

  async function checkConnection() {
    setCheckingConnection(true);
    setMessage("");
    setError("");
    try {
      const response = await fetch("/api/internal/offers/instagram", {
        method: "GET",
        credentials: "same-origin",
        cache: "no-store",
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(
          response.status === 401
            ? "La sesión ha caducado. Vuelve a entrar con la clave de operaciones."
            : result.error || "No se pudo comprobar la conexión.",
        );
      setMessage(result.message);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "No se pudo comprobar la conexión.",
      );
    } finally {
      setCheckingConnection(false);
    }
  }

  async function publish() {
    setPublishing(true);
    setMessage("");
    setError("");
    try {
      const response = await fetch("/api/internal/offers", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
      });
      const result = (await response.json()) as {
        status?: string;
        mediaId?: string;
        message?: string;
        error?: string;
      };
      if (!response.ok)
        throw new Error(result.error || "No se pudo completar la publicación.");
      const messages: Record<string, string> = {
        published: "Ofertas publicadas en Instagram.",
        already_published:
          "Las ofertas de hoy ya se han publicado en Instagram.",
        not_configured:
          "Instagram aún no está configurado. Descarga las imágenes y copia el texto para publicar manualmente.",
        busy: "Hay una publicación en curso. Espera antes de volver a intentarlo.",
        incomplete:
          "Faltan ofertas vigentes en alguna categoría. La publicación automática necesita las cuatro imágenes.",
        uncertain:
          "La publicación está pendiente de comprobar. Revisa Instagram antes de reintentar.",
        failed:
          "No se pudo completar la publicación. Revisa su estado antes de reintentar.",
      };
      setMessage(
        result.message ||
          messages[result.status ?? ""] ||
          "Operación recibida. Revisa el estado de la publicación.",
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "No se pudo completar la publicación.",
      );
    } finally {
      setPublishing(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-neutral-950">
              Ofertas vigentes
            </h2>
            <p className="mt-1 text-sm leading-6 text-neutral-600">
              Hasta 12 ofertas: tres por categoría. Las imágenes usan las fotos
              y los precios reales de la tienda.
            </p>
            {data ? (
              <p className="mt-2 text-sm font-medium text-neutral-800">
                {data.snapshot.dayKey.split("-").reverse().join("/")} ·{" "}
                {data.snapshot.offers.length} ofertas disponibles
              </p>
            ) : null}
          </div>
          <button
            type="button"
            className={buttonClass}
            disabled={busy || publishing}
            onClick={() => void load()}
          >
            {busy ? "Actualizando…" : "Actualizar"}
          </button>
        </div>
        {busy ? (
          <p className="mt-4 text-sm text-neutral-600" role="status">
            Comprobando las ofertas de hoy…
          </p>
        ) : null}
        {error ? (
          <p
            className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800"
            role="alert"
          >
            {error}
          </p>
        ) : null}
        {data && !data.instagramConfigured ? (
          <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-amber-900">
            Instagram aún no está conectado. Descarga las imágenes de abajo y
            copia el texto para publicarlas manualmente.
          </p>
        ) : null}
        <button
          type="button"
          className={`${buttonClass} mt-4`}
          disabled={checkingConnection || publishing}
          onClick={() => void checkConnection()}
        >
          {checkingConnection
            ? "Comprobando conexión…"
            : "Comprobar conexión con Instagram"}
        </button>
        {data && data.snapshot.offers.length < 12 ? (
          <p className="mt-3 text-sm leading-6 text-neutral-600">
            Hay menos de 12 ofertas válidas disponibles. Solo se incluyen
            productos con precio y disponibilidad comprobados.
          </p>
        ) : null}
      </section>

      {data ? (
        <>
          <div className="grid gap-5 sm:grid-cols-2">
            {Object.entries(OFFER_CATEGORIES).map(([category, label]) => {
              const offers = data.snapshot.offers.filter(
                (offer) => offer.category === category,
              );
              const imageHref = `/api/internal/offers/image?category=${category}&revision=${revision}`;
              return (
                <section
                  key={category}
                  className="overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm"
                >
                  <div className="flex items-center justify-between gap-3 p-4">
                    <h2 className="font-semibold text-neutral-950">{label}</h2>
                    <span className="text-sm text-neutral-600">
                      {offers.length}/3
                    </span>
                  </div>
                  {offers.length && !failedImages.includes(category) ? (
                    // Private authenticated images must use the browser session directly.
                    // biome-ignore lint/performance/noImgElement: next/image would fetch without the operations session.
                    <img
                      src={imageHref}
                      alt={`Imagen de ofertas de ${label} del ${data.snapshot.dayKey}`}
                      width={1080}
                      height={1350}
                      className="h-auto w-full bg-neutral-100"
                      onError={() =>
                        setFailedImages((current) => [...current, category])
                      }
                    />
                  ) : (
                    <p className="mx-4 rounded-lg bg-neutral-50 p-4 text-sm leading-6 text-neutral-600">
                      {offers.length
                        ? "No se pudo preparar la imagen. Actualiza las ofertas para volver a intentarlo."
                        : "No hay ofertas vigentes en esta categoría."}
                    </p>
                  )}
                  <div className="space-y-3 p-4">
                    <ul className="space-y-1 text-sm text-neutral-700">
                      {offers.map((offer) => (
                        <li key={offer.variantId}>{offer.name}</li>
                      ))}
                    </ul>
                    {offers.length ? (
                      <a
                        href={`${imageHref}&download=1`}
                        className={`${buttonClass} inline-block`}
                      >
                        Descargar JPEG
                      </a>
                    ) : null}
                  </div>
                </section>
              );
            })}
          </div>

          <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-neutral-950">
                Texto para Instagram
              </h2>
              <button
                type="button"
                className={buttonClass}
                onClick={() => void copyCaption()}
              >
                Copiar texto
              </button>
            </div>
            <textarea
              aria-label="Texto para Instagram"
              readOnly
              value={data.caption}
              rows={14}
              className="mt-4 w-full rounded-lg border border-neutral-300 bg-neutral-50 p-3 text-sm leading-6 text-neutral-800"
            />
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                type="button"
                disabled={
                  !data.instagramConfigured ||
                  !data.snapshot.offers.length ||
                  publishing ||
                  checkingConnection ||
                  busy
                }
                onClick={() => void publish()}
                className="rounded-lg bg-neutral-950 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {publishing ? "Publicando…" : "Publicar en Instagram"}
              </button>
              <p className="text-sm text-neutral-600">
                La publicación automática agrupa las cuatro categorías en un
                carrusel.
              </p>
            </div>
          </section>
        </>
      ) : null}
      {message ? (
        <p
          role="status"
          className="rounded-lg border border-neutral-200 bg-white p-3 text-sm text-neutral-800"
        >
          {message}
        </p>
      ) : null}
    </div>
  );
}
