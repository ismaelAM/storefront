import { NextResponse } from "next/server";
import { isShippingOperationsAuthorized } from "@/lib/shipping/operations-auth";
import { createSupabaseClient } from "@/lib/supabase/server";

const PROGRAM_CODE = "BISON3";

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

async function programSnapshot() {
  const supabase = createSupabaseClient();

  const { data: program, error: programError } = await supabase
    .from("special_pricing_programs")
    .select(
      "code,name,target_margin,active,requires_approval,exclude_fixed_price_books,last_prices_synced_at,updated_at",
    )
    .eq("code", PROGRAM_CODE)
    .single();
  if (programError) throw programError;

  const { data: requests, error: requestsError } = await supabase
    .from("special_pricing_requests")
    .select("id,email,status,requested_at,decided_at,note")
    .eq("program_code", PROGRAM_CODE)
    .order("requested_at", { ascending: false })
    .limit(50);
  if (requestsError) throw requestsError;

  const lastSyncedAt = program.last_prices_synced_at
    ? new Date(program.last_prices_synced_at).getTime()
    : 0;
  const updatedAt = new Date(program.updated_at).getTime();

  return {
    program,
    requests: requests ?? [],
    pricesNeedSync: !lastSyncedAt || updatedAt > lastSyncedAt + 1000,
  };
}

function cloudWorkerUrl(): string {
  const explicit = process.env.DEVIR_CLOUD_WORKER_URL?.trim();
  if (explicit) return explicit;

  const supabaseUrl = process.env.SUPABASE_URL?.trim().replace(/\/$/, "");
  if (!supabaseUrl) {
    throw new Error("Falta SUPABASE_URL para llamar a devir-sync.");
  }
  return `${supabaseUrl}/functions/v1/devir-sync`;
}

function spreeAdminKey(): string {
  const key =
    process.env.DEVIR_B2B_SPREE_ADMIN_API_KEY?.trim() ||
    process.env.SPREE_ADMIN_API_KEY?.trim();
  if (!key) {
    throw new Error("Falta la clave administrativa de Spree en el servidor.");
  }
  return key;
}

async function callPricingAction(
  action:
    | "special-pricing-setup"
    | "special-pricing-approve"
    | "special-pricing-reject",
  body: Record<string, unknown> = {},
) {
  const response = await fetch(cloudWorkerUrl(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-spree-admin-key": spreeAdminKey(),
    },
    body: JSON.stringify({
      action,
      code: PROGRAM_CODE,
      ...body,
    }),
    cache: "no-store",
  });

  const payload = (await response.json().catch(() => ({}))) as {
    error?: string;
    [key: string]: unknown;
  };

  if (!response.ok || payload.ok === false) {
    throw new Error(
      typeof payload.error === "string"
        ? payload.error
        : `devir-sync HTTP ${response.status}`,
    );
  }

  return payload;
}

export async function GET(request: Request) {
  if (!isShippingOperationsAuthorized(request)) return unauthorized();

  try {
    return NextResponse.json({ ok: true, ...(await programSnapshot()) });
  } catch (error) {
    console.error("Special pricing status failed", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "No se pudo cargar el programa BISON3.",
      },
      { status: 400 },
    );
  }
}

export async function POST(request: Request) {
  if (!isShippingOperationsAuthorized(request)) return unauthorized();

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  try {
    const action = typeof body.action === "string" ? body.action : "";

    if (action === "sync") {
      await callPricingAction("special-pricing-setup");
      return NextResponse.json({ ok: true, ...(await programSnapshot()) });
    }

    if (action === "approve" || action === "reject") {
      const requestId =
        typeof body.requestId === "string" ? body.requestId.trim() : "";
      if (!requestId) {
        return NextResponse.json(
          { error: "Falta requestId" },
          { status: 400 },
        );
      }

      if (action === "approve") {
        // One-click approval also refreshes the price rows first so an account
        // never receives a stale BISON3 price list after a margin/cost change.
        await callPricingAction("special-pricing-setup");
      }

      await callPricingAction(
        action === "approve"
          ? "special-pricing-approve"
          : "special-pricing-reject",
        {
          requestId,
          ...(typeof body.note === "string" && body.note.trim()
            ? { note: body.note.trim() }
            : {}),
        },
      );

      return NextResponse.json({ ok: true, ...(await programSnapshot()) });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    console.error("Special pricing operation failed", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "No se pudo completar la operación BISON3.",
      },
      { status: 400 },
    );
  }
}
