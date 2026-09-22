import type { Metadata } from "next";
import { cookies } from "next/headers";
import {
  hasShippingOperationsToken,
  isShippingOperationsSessionValue,
  SHIPPING_OPERATIONS_SESSION_COOKIE,
} from "@/lib/shipping/operations-auth";
import { ShippingOperationsPanel } from "./ShippingOperationsPanel";

export const metadata: Metadata = {
  title: "Envíos manuales | BisonTCG",
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

  if (!configured) {
    return (
      <main className="min-h-screen bg-neutral-50 px-4 py-12">
        <div className="mx-auto max-w-xl rounded-2xl border border-amber-200 bg-white p-6 shadow-sm">
          <h1 className="text-xl font-semibold text-neutral-950">
            Envíos manuales
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
            Envíos manuales
          </h1>
          <p className="mt-2 text-sm leading-6 text-neutral-600">
            Acceso interno. Introduce la clave de operaciones de envío. La
            sesión dura hasta 8 horas.
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
              Envíos manuales
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-neutral-600">
              Guarda tracking y actualiza el estado del fulfillment en Spree.
              Esta pantalla no crea envíos, etiquetas ni recogidas en Correos.
            </p>
          </div>

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

        <ShippingOperationsPanel />
      </div>
    </main>
  );
}
