import { NextResponse } from "next/server";
import {
  isShippingOperationsAuthorized,
  shippingOperationsTokenMatches,
} from "@/lib/shipping/operations-auth";
import { getDailySocialOffers } from "@/lib/social/data";
import { readInstagramConfig } from "@/lib/social/instagram";
import { offerCaption } from "@/lib/social/offers";
import { runDailySocialPublication } from "@/lib/social/publication";
import { getStoreUrl } from "@/lib/store";

export const maxDuration = 120;
const headers = { "Cache-Control": "private, no-store" };

export async function GET(request: Request) {
  if (!isShippingOperationsAuthorized(request)) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers },
    );
  }
  try {
    const storeUrl = getStoreUrl();
    if (!storeUrl) throw new Error("Store URL unavailable");
    const snapshot = await getDailySocialOffers();
    return NextResponse.json(
      {
        snapshot,
        caption: offerCaption(snapshot, storeUrl),
        instagramConfigured: readInstagramConfig().configured,
      },
      { headers },
    );
  } catch {
    return NextResponse.json(
      {
        error:
          "No se pudieron cargar las ofertas vigentes. Espera a que termine la rotación y vuelve a intentarlo.",
      },
      { status: 503, headers },
    );
  }
}

export async function POST(request: Request) {
  if (!isShippingOperationsAuthorized(request)) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers },
    );
  }
  const authorization = request.headers.get("authorization") ?? "";
  const bearerAuthorized =
    authorization.startsWith("Bearer ") &&
    shippingOperationsTokenMatches(authorization.slice(7));
  if (
    !bearerAuthorized &&
    request.headers.get("origin") !== new URL(request.url).origin
  ) {
    return NextResponse.json(
      { error: "Origen no permitido." },
      { status: 403, headers },
    );
  }
  try {
    return NextResponse.json(await runDailySocialPublication(), { headers });
  } catch {
    return NextResponse.json(
      {
        error:
          "No se pudo completar la publicación. Revisa su estado antes de reintentar.",
      },
      { status: 503, headers },
    );
  }
}
