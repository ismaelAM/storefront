"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

interface SpecialPricingProgram {
  code: string;
  name: string;
  target_margin: string | number;
  active: boolean;
  requires_approval: boolean;
  exclude_fixed_price_books: boolean;
  last_prices_synced_at?: string | null;
  updated_at: string;
}

interface SpecialPricingRequest {
  id: string;
  email: string;
  status: string;
  requested_at: string;
  decided_at?: string | null;
  note?: string | null;
}

interface SpecialPricingSnapshot {
  ok: boolean;
  program: SpecialPricingProgram;
  requests: SpecialPricingRequest[];
  pricesNeedSync: boolean;
  error?: string;
}

async function pricingAction(
  method: "GET" | "POST",
  body?: Record<string, unknown>,
): Promise<SpecialPricingSnapshot> {
  const response = await fetch("/api/internal/operations/special-pricing", {
    method,
    headers:
      method === "POST" ? { "Content-Type": "application/json" } : undefined,
    credentials: "same-origin",
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  const data = (await response.json().catch(() => ({}))) as SpecialPricingSnapshot;
  if (!response.ok) {
    throw new Error(data.error || `HTTP ${response.status}`);
  }
  return data;
}

function formatDate(value?: string | null) {
  if (!value) return "Nunca";
  return new Intl.DateTimeFormat("es-ES", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

export function SpecialPricingOperationsPanel() {
  const [snapshot, setSnapshot] = useState<SpecialPricingSnapshot | null>(null);
  const [busyKey, setBusyKey] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    setMessage("");
    try {
      setSnapshot(await pricingAction("GET"));
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "No se pudo cargar BISON3.",
      );
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const pending = useMemo(
    () => snapshot?.requests.filter((request) => request.status === "pending") ?? [],
    [snapshot],
  );
  const recentDecisions = useMemo(
    () =>
      snapshot?.requests
        .filter((request) => request.status !== "pending")
        .slice(0, 8) ?? [],
    [snapshot],
  );

  async function run(
    action: "sync" | "approve" | "reject",
    requestId?: string,
  ) {
    const key = requestId ? `${action}:${requestId}` : action;
    setBusyKey(key);
    setMessage("");
    try {
      const next = await pricingAction("POST", {
        action,
        ...(requestId ? { requestId } : {}),
      });
      setSnapshot(next);
      setMessage(
        action === "sync"
          ? "Precios BISON3 sincronizados."
          : action === "approve"
            ? "Cuenta aprobada y añadida a BISON3."
            : "Solicitud rechazada.",
      );
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "No se pudo completar.",
      );
    } finally {
      setBusyKey("");
    }
  }

  const margin = Number(snapshot?.program.target_margin ?? 0) * 100;

  return (
    <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold text-neutral-950">BISON3</h2>
            {snapshot?.program.active ? (
              <span className="rounded-full bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700">
                Activo
              </span>
            ) : (
              <span className="rounded-full bg-neutral-100 px-2 py-1 text-xs font-medium text-neutral-600">
                Inactivo
              </span>
            )}
            {snapshot?.pricesNeedSync ? (
              <span className="rounded-full bg-amber-50 px-2 py-1 text-xs font-medium text-amber-800">
                Precios pendientes de sincronizar
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-sm leading-6 text-neutral-600">
            Cuentas amigas con precio por margen objetivo. Aprobar una solicitud
            sincroniza primero los precios y después activa la cuenta en Spree.
          </p>
        </div>

        <button
          type="button"
          className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm font-medium text-neutral-700 disabled:opacity-50"
          disabled={!snapshot || Boolean(busyKey)}
          onClick={() => run("sync")}
        >
          {busyKey === "sync" ? "Sincronizando…" : "Sincronizar precios"}
        </button>
      </div>

      {snapshot ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl bg-neutral-50 p-3">
            <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
              Margen objetivo
            </p>
            <p className="mt-1 text-xl font-semibold text-neutral-950">
              {margin.toLocaleString("es-ES", { maximumFractionDigits: 2 })}%
            </p>
          </div>
          <div className="rounded-xl bg-neutral-50 p-3">
            <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
              Pendientes
            </p>
            <p className="mt-1 text-xl font-semibold text-neutral-950">
              {pending.length}
            </p>
          </div>
          <div className="rounded-xl bg-neutral-50 p-3">
            <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
              Última sincronización
            </p>
            <p className="mt-1 text-sm font-medium text-neutral-900">
              {formatDate(snapshot.program.last_prices_synced_at)}
            </p>
          </div>
        </div>
      ) : null}

      <div className="mt-5">
        <h3 className="text-sm font-semibold text-neutral-950">
          Solicitudes pendientes
        </h3>

        {!snapshot && !message ? (
          <p className="mt-2 text-sm text-neutral-500">Cargando…</p>
        ) : null}

        {snapshot && pending.length === 0 ? (
          <p className="mt-2 rounded-xl bg-neutral-50 px-3 py-3 text-sm text-neutral-600">
            No hay solicitudes pendientes.
          </p>
        ) : null}

        {pending.length > 0 ? (
          <div className="mt-2 divide-y divide-neutral-200 overflow-hidden rounded-xl border border-neutral-200">
            {pending.map((request) => {
              const approving = busyKey === `approve:${request.id}`;
              const rejecting = busyKey === `reject:${request.id}`;
              return (
                <div
                  key={request.id}
                  className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-neutral-950">
                      {request.email}
                    </p>
                    <p className="mt-0.5 text-xs text-neutral-500">
                      Solicitado {formatDate(request.requested_at)}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className="rounded-lg bg-neutral-950 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
                      disabled={Boolean(busyKey)}
                      onClick={() => run("approve", request.id)}
                    >
                      {approving ? "Aprobando…" : "Aprobar"}
                    </button>
                    <button
                      type="button"
                      className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm font-medium text-neutral-700 disabled:opacity-50"
                      disabled={Boolean(busyKey)}
                      onClick={() => run("reject", request.id)}
                    >
                      {rejecting ? "Rechazando…" : "Rechazar"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : null}
      </div>

      {recentDecisions.length > 0 ? (
        <details className="mt-5">
          <summary className="cursor-pointer text-sm font-medium text-neutral-700">
            Historial reciente
          </summary>
          <div className="mt-2 divide-y divide-neutral-200 overflow-hidden rounded-xl border border-neutral-200">
            {recentDecisions.map((request) => (
              <div
                key={request.id}
                className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
              >
                <span className="min-w-0 truncate text-neutral-800">
                  {request.email}
                </span>
                <span
                  className={
                    request.status === "approved"
                      ? "text-emerald-700"
                      : "text-neutral-500"
                  }
                >
                  {request.status === "approved" ? "Aprobada" : "Rechazada"}
                </span>
              </div>
            ))}
          </div>
        </details>
      ) : null}

      {message ? (
        <p
          className="mt-4 rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm text-neutral-800"
          role="status"
        >
          {message}
        </p>
      ) : null}
    </section>
  );
}
