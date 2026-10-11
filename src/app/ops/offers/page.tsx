import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Suspense } from "react";
import {
  hasShippingOperationsToken,
  isShippingOperationsSessionValue,
  SHIPPING_OPERATIONS_SESSION_COOKIE,
} from "@/lib/shipping/operations-auth";
import { OffersPanel } from "./OffersPanel";

export const metadata: Metadata = {
  title: "Ofertas e Instagram | BisonTCG",
  robots: { index: false, follow: false },
};

type PageProps = { searchParams: Promise<{ error?: string }> };

async function OffersAccess({ searchParams }: PageProps) {
  const cookieStore = await cookies();
  const query = await searchParams;
  const configured = hasShippingOperationsToken();
  const authenticated = isShippingOperationsSessionValue(
    cookieStore.get(SHIPPING_OPERATIONS_SESSION_COOKIE)?.value,
  );

  if (!configured)
    return (
      <div className="mx-auto max-w-xl rounded-2xl border border-amber-200 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold text-neutral-950">
          Ofertas BisonTCG
        </h1>
        <p className="mt-3 text-sm leading-6 text-neutral-700">
          Falta configurar la clave de operaciones en el servidor. El panel
          privado estará disponible cuando se active ese acceso.
        </p>
      </div>
    );

  if (!authenticated)
    return (
      <div className="mx-auto max-w-md rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold text-neutral-950">
          Ofertas e Instagram
        </h1>
        <p className="mt-2 text-sm leading-6 text-neutral-600">
          Acceso interno. Usa la misma clave de operaciones que para envíos. La
          sesión dura hasta 8 horas.
        </p>
        {query.error ? (
          <p
            className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800"
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
          <input type="hidden" name="returnTo" value="/ops/offers" />
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
    );

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
            BisonTCG · Operaciones
          </p>
          <h1 className="mt-1 text-2xl font-semibold text-neutral-950">
            Ofertas e Instagram
          </h1>
          <p className="mt-2 text-sm leading-6 text-neutral-600">
            Prepara las imágenes del día y publica las ofertas de la tienda.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a
            className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm font-medium text-neutral-700"
            href="/ops/shipping"
          >
            Operaciones
          </a>
          <form action="/api/internal/shipping/session" method="post">
            <input type="hidden" name="action" value="logout" />
            <input type="hidden" name="returnTo" value="/ops/offers" />
            <button
              className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm font-medium text-neutral-700"
              type="submit"
            >
              Cerrar sesión
            </button>
          </form>
        </div>
      </div>
      <OffersPanel />
    </div>
  );
}

export default function OffersPage(props: PageProps) {
  return (
    <main className="min-h-screen bg-neutral-50 px-4 py-10">
      <Suspense
        fallback={
          <p className="mx-auto max-w-5xl text-sm text-neutral-600">
            Comprobando acceso…
          </p>
        }
      >
        <OffersAccess {...props} />
      </Suspense>
    </main>
  );
}
