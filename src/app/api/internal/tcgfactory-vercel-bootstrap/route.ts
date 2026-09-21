import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SUPABASE_FUNCTION_URL =
  "https://ikglqbjlbkbaronbiryl.supabase.co/functions/v1/devir-sync";

function firstEnv(names: string[]): { name: string; value: string } | null {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) return { name, value };
  }
  return null;
}

export async function GET() {
  if (process.env.VERCEL_ENV !== "production") {
    return NextResponse.json({ ok: false, error: "production_only" }, { status: 404 });
  }

  const email = firstEnv([
    "TCGFACTORY_B2B_EMAIL",
    "TCGFACTORY_B2B_USERNAME",
    "TCGFACTORY_EMAIL",
    "TCGFACTORY_USERNAME",
    "TCG_FACTORY_EMAIL",
  ]);
  const password = firstEnv([
    "TCGFACTORY_B2B_PASSWORD",
    "TCGFACTORY_PASSWORD",
    "TCGFACTORY_PASS",
    "TCG_FACTORY_PASSWORD",
  ]);
  const spreeKey = firstEnv([
    "SPREE_ADMIN_API_KEY",
    "DEVIR_B2B_SPREE_ADMIN_API_KEY",
  ]);

  if (!email || !password || !spreeKey) {
    return NextResponse.json(
      {
        ok: false,
        configured: false,
        hasEmail: Boolean(email),
        hasPassword: Boolean(password),
        hasSpreeAdminKey: Boolean(spreeKey),
        emailVariable: email?.name ?? null,
        passwordVariable: password?.name ?? null,
      },
      { status: 409 },
    );
  }

  const response = await fetch(SUPABASE_FUNCTION_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-spree-admin-key": spreeKey.value,
    },
    body: JSON.stringify({
      action: "tcgfactory-credentials",
      email: email.value,
      password: password.value,
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(45_000),
  });

  const data = (await response.json().catch(() => null)) as
    | Record<string, unknown>
    | null;

  return NextResponse.json(
    {
      ok: response.ok && data?.ok === true,
      configured: true,
      emailVariable: email.name,
      passwordVariable: password.name,
      supplier: "tcgfactory",
      stored: data?.stored === true,
      validated: data?.validated === true,
      error:
        typeof data?.error === "string"
          ? data.error
          : response.ok
            ? null
            : "supplier_bootstrap_failed",
    },
    { status: response.ok ? 200 : response.status },
  );
}
