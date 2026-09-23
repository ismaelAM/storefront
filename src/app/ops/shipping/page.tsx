import type { Metadata } from "next";
import { getDefaultCountry, getDefaultLocale } from "@/lib/store";
import { cookies } from "next/headers";
import {
  hasShippingOperationsToken,
  isShippingOperationsSessionValue,
  SHIPPING_OPERATIONS_SESSION_COOKIE,
} from "@/lib/shipping/operations-auth";
import { ShippingOperationsPanel } from "./ShippingOperationsPanel";
import { SpecialPricingOperationsPanel } from "./SpecialPricingOperationsPanel";

export const metadata: Metadata = {
  title: "Operaciones | BisonTCG",
  robots: {
    index: false,
    follow: false,
  },
};


export default async function ShippingOperationsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const configured = hasShippingOperationsToken();
  const cookieStore = await cookies();
  const authenticated = isShippingOperationsSessionValue(
    cookieStore.get(SHIPPING_OPERATIONS_SESSION_COOKIE)?.value,
  );
  const query = await searchParams;
  const puckEditorHref = `/${getDefaultCountry()}/${getDefaultLocale()}/editor`;

  if (!configured) {
    return (
      <main className="min-h-screen bg-neutral-50 px-4 py-12">
        <div className="mx-auto max-w-xl rounded-2xl border border-amber-200 bg-white p-6 shadow-sm">
          <h1 className="text-xl font-semibold text-neutral-950">
            Operaciones BisonTCG
          </h1>
          <p className="mt-3 text-sm leading-6 text-neutral-700">
            Falta configurar <code>SHIPPING_OPERATIONS_TOKEN</code> en el
            servidor. La pantalla está desactivada hasta que exista esa
            credencial.
          </p>
        </div>
      </main>
    );
  }

  if (!authenticated) {
    return (
      <main className="min-h-screen bg-neutral-50 px-4 py-12">
        <div className="mx-auto max-w-md rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
          <h1 className="text-xl font-semibold text-neutral-950">
            Operaciones BisonTCG
          </h1>
          <p className="mt-2 text-sm leading-6 text-neutral-600">
            Acceso interno. Introduce la clave de operaciones. La sesión dura hasta
            8 horas.
          </p>

          {query.error ? (
            <p
              className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
              role="alert"
            >
              Clave incorrecta.
            </p>
          ) : null}

          <form
            className="mt-5 grid gap-3"
            action="/api/internal/shipping/session"
            method="post"
          >
            <label className="grid gap-1.5 text-sm font-medium text-neutral-800">
              Clave
              <input
                className="rounded-lg border border-neutral-300 px-3 py-2 font-normal"
                type="password"
                name="token"
                required
                autoComplete="current-password"
              />
            </label>
            <button
              className="rounded-lg bg-neutral-950 px-4 py-2 text-sm font-medium text-white"
              type="submit"
            >
              Entrar
            </button>
          </form>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-neutral-50 px-4 py-10">
      <div className="mx-auto max-w-3xl">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
              BisonTCG · Operaciones
            </p>
            <h1 className="mt-1 text-2xl font-semibold text-neutral-950">
              Operaciones BisonTCG
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-neutral-600">
              Centralita interna para controles operativos del storefront.
              Envíos y programas especiales comparten esta sesión protegida.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <a
              className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm font-medium text-neutral-700"
              href={puckEditorHref}
            >
              Abrir Puck
            </a>
            <form action="/api/internal/shipping/session" method="post">
              <input type="hidden" name="action" value="logout" />
              <button
                className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm font-medium text-neutral-700"
                type="submit"
              >
                Cerrar sesión
              </button>
            </form>
          </div>
        </div>

        <div className="space-y-6">
          <SpecialPricingOperationsPanel />

          <section>
            <div className="mb-3">
              <h2 className="text-lg font-semibold text-neutral-950">
                Envíos manuales
              </h2>
              <p className="mt-1 text-sm text-neutral-600">
                Tracking y estados de fulfillment en Spree.
              </p>
            </div>
            <ShippingOperationsPanel />
          </section>
        </div>
      </div>
    </main>
  );
}
