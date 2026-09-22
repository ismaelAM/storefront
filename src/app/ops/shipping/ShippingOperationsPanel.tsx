"use client";

import { useMemo, useState } from "react";

interface Fulfillment {
  id: string;
  number?: string | null;
  tracking?: string | null;
  tracking_url?: string | null;
  status?: string | null;
  fulfilled_at?: string | null;
}

interface FulfillmentList {
  data?: Fulfillment[];
}

async function shippingAction(body: Record<string, unknown>) {
  const response = await fetch("/api/internal/shipping", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    credentials: "same-origin",
    body: JSON.stringify(body),
  });

  const data = (await response.json().catch(() => ({}))) as {
    error?: string;
    [key: string]: unknown;
  };

  if (!response.ok) {
    throw new Error(data.error || `HTTP ${response.status}`);
  }

  return data;
}

export function ShippingOperationsPanel() {
  const [orderId, setOrderId] = useState("");
  const [fulfillments, setFulfillments] = useState<Fulfillment[]>([]);
  const [fulfillmentId, setFulfillmentId] = useState("");
  const [tracking, setTracking] = useState("");
  const [trackingCarrier, setTrackingCarrier] = useState("Correos");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const selected = useMemo(
    () => fulfillments.find((item) => item.id === fulfillmentId),
    [fulfillments, fulfillmentId],
  );

  function selectFulfillment(id: string, items = fulfillments) {
    setFulfillmentId(id);
    const item = items.find((entry) => entry.id === id);
    if (item) {
      setTracking(item.tracking ?? "");
    }
  }

  async function loadFulfillments() {
    const value = orderId.trim();
    if (!value) {
      setMessage("Introduce el ID o número del pedido.");
      return;
    }

    setBusy(true);
    setMessage("");
    try {
      const result = (await shippingAction({
        action: "spree-list-fulfillments",
        orderId: value,
      })) as FulfillmentList;
      const items = Array.isArray(result.data) ? result.data : [];
      setFulfillments(items);

      if (items.length === 0) {
        setFulfillmentId("");
        setTracking("");
        setMessage("El pedido no tiene fulfillments.");
        return;
      }

      selectFulfillment(items[0].id, items);
      setMessage(
        items.length === 1
          ? "Fulfillment cargado."
          : `${items.length} fulfillments cargados.`,
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo cargar.");
    } finally {
      setBusy(false);
    }
  }

  async function runMutation(
    action: "spree-save-tracking" | "spree-fulfill" | "spree-mark-delivered",
  ) {
    if (!orderId.trim() || !fulfillmentId) {
      setMessage("Carga un pedido y selecciona un fulfillment.");
      return;
    }

    if (action !== "spree-mark-delivered" && !tracking.trim()) {
      setMessage("Introduce el número de seguimiento.");
      return;
    }

    if (
      action === "spree-fulfill" &&
      !window.confirm(
        "¿Marcar este fulfillment como enviado en Spree? Esto no crea ningún envío en Correos.",
      )
    ) {
      return;
    }

    if (
      action === "spree-mark-delivered" &&
      !window.confirm("¿Marcar este fulfillment como entregado en Spree?")
    ) {
      return;
    }

    setBusy(true);
    setMessage("");
    try {
      await shippingAction({
        action,
        orderId: orderId.trim(),
        fulfillmentId,
        ...(tracking.trim() ? { tracking: tracking.trim() } : {}),
        ...(trackingCarrier.trim()
          ? { trackingCarrier: trackingCarrier.trim() }
          : {}),
      });

      setMessage(
        action === "spree-save-tracking"
          ? "Tracking guardado."
          : action === "spree-fulfill"
            ? "Fulfillment marcado como enviado."
            : "Fulfillment marcado como entregado.",
      );
      await loadFulfillments();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "No se pudo guardar el cambio.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-neutral-950">Pedido</h2>
        <p className="mt-1 text-sm text-neutral-600">
          Introduce el ID o número de pedido de Spree. No se consulta ni se crea
          nada en Correos.
        </p>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row">
          <input
            className="min-w-0 flex-1 rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
            value={orderId}
            onChange={(event) => setOrderId(event.target.value)}
            placeholder="Ej. R123456789"
            autoComplete="off"
          />
          <button
            type="button"
            className="rounded-lg bg-neutral-950 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            disabled={busy}
            onClick={loadFulfillments}
          >
            {busy ? "Cargando…" : "Cargar envío"}
          </button>
        </div>
      </section>

      {fulfillments.length > 0 ? (
        <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-neutral-950">
            Datos de envío
          </h2>

          <div className="mt-4 grid gap-4">
            <label className="grid gap-1.5 text-sm font-medium text-neutral-800">
              Fulfillment
              <select
                className="rounded-lg border border-neutral-300 bg-white px-3 py-2 font-normal"
                value={fulfillmentId}
                onChange={(event) => selectFulfillment(event.target.value)}
              >
                {fulfillments.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.number || item.id}
                    {item.status ? ` · ${item.status}` : ""}
                  </option>
                ))}
              </select>
            </label>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-1.5 text-sm font-medium text-neutral-800">
                Número de seguimiento
                <input
                  className="rounded-lg border border-neutral-300 px-3 py-2 font-normal"
                  value={tracking}
                  onChange={(event) => setTracking(event.target.value)}
                  placeholder="PQ…"
                  autoComplete="off"
                />
              </label>

              <label className="grid gap-1.5 text-sm font-medium text-neutral-800">
                Transportista
                <input
                  className="rounded-lg border border-neutral-300 px-3 py-2 font-normal"
                  value={trackingCarrier}
                  onChange={(event) => setTrackingCarrier(event.target.value)}
                  placeholder="Correos"
                  autoComplete="off"
                />
              </label>
            </div>

            {selected ? (
              <div className="rounded-lg bg-neutral-50 px-3 py-2 text-xs text-neutral-600">
                Estado actual: <strong>{selected.status || "sin estado"}</strong>
                {selected.fulfilled_at
                  ? ` · enviado ${new Date(selected.fulfilled_at).toLocaleString("es-ES")}`
                  : ""}
                {selected.tracking_url ? (
                  <>
                    {" · "}
                    <a
                      className="underline"
                      href={selected.tracking_url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      abrir seguimiento
                    </a>
                  </>
                ) : null}
              </div>
            ) : null}

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium disabled:opacity-50"
                disabled={busy}
                onClick={() => runMutation("spree-save-tracking")}
              >
                Guardar tracking
              </button>
              <button
                type="button"
                className="rounded-lg bg-neutral-950 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                disabled={busy}
                onClick={() => runMutation("spree-fulfill")}
              >
                Marcar enviado
              </button>
              <button
                type="button"
                className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium disabled:opacity-50"
                disabled={busy}
                onClick={() => runMutation("spree-mark-delivered")}
              >
                Marcar entregado
              </button>
            </div>
          </div>
        </section>
      ) : null}

      {message ? (
        <p
          className="rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-800"
          role="status"
        >
          {message}
        </p>
      ) : null}
    </div>
  );
}
