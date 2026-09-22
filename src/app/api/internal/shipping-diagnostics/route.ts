import { NextResponse } from "next/server";
import {
  SpreeShippingApiError,
  spreeShippingRequest,
} from "@/lib/shipping/spree-fulfillment";

type DiagnosticResult =
  | { ok: true; data: unknown }
  | { ok: false; status?: number; error: string };

async function inspect(path: string): Promise<DiagnosticResult> {
  try {
    const data = await spreeShippingRequest<unknown>("GET", path);
    return { ok: true, data };
  } catch (error) {
    if (error instanceof SpreeShippingApiError) {
      return { ok: false, status: error.status, error: error.message };
    }
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

export async function GET() {
  if (process.env.VERCEL_ENV !== "preview") {
    return new NextResponse(null, { status: 404 });
  }

  const [shippingMethods, shippingCategories, zones] = await Promise.all([
    inspect("/shipping_methods?limit=100"),
    inspect("/shipping_categories?limit=100"),
    inspect("/zones?limit=100"),
  ]);

  return NextResponse.json({
    shippingMethods,
    shippingCategories,
    zones,
  });
}
