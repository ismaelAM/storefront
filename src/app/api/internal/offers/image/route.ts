import { NextResponse } from "next/server";
import { isShippingOperationsAuthorized } from "@/lib/shipping/operations-auth";
import { getDailySocialOffers } from "@/lib/social/data";
import { OFFER_CATEGORIES } from "@/lib/social/offers";
import { renderOfferSlide } from "@/lib/social/template";
import { getStoreUrl } from "@/lib/store";

export const maxDuration = 60;
const headers = { "Cache-Control": "private, no-store" };

export async function GET(request: Request) {
  if (!isShippingOperationsAuthorized(request)) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers },
    );
  }
  const query = new URL(request.url).searchParams;
  const category = query.get("category") ?? "";
  if (!Object.hasOwn(OFFER_CATEGORIES, category)) {
    return NextResponse.json(
      { error: "Categoría no válida." },
      { status: 400, headers },
    );
  }
  try {
    const storeUrl = getStoreUrl();
    if (!storeUrl) throw new Error("Store URL unavailable");
    const snapshot = await getDailySocialOffers();
    const offers = snapshot.offers.filter(
      (offer) => offer.category === category,
    );
    if (!offers.length) {
      return NextResponse.json(
        { error: "No hay ofertas vigentes en esta categoría." },
        { status: 404, headers },
      );
    }
    const bytes = await renderOfferSlide({
      dayKey: snapshot.dayKey,
      categoryLabel:
        OFFER_CATEGORIES[category as keyof typeof OFFER_CATEGORIES],
      offers,
      logoUrl: process.env.STORE_LOGO_URL,
      storeUrl,
    });
    const disposition = query.get("download") === "1" ? "attachment" : "inline";
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        ...headers,
        "Content-Type": "image/jpeg",
        "Content-Disposition": `${disposition}; filename="bison-ofertas-${snapshot.dayKey}-${category}.jpg"`,
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return NextResponse.json(
      {
        error:
          "No se pudo preparar la imagen con las ofertas vigentes. Vuelve a intentarlo.",
      },
      { status: 503, headers },
    );
  }
}
