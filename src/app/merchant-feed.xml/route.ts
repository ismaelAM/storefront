import { connection } from "next/server";
import { getMerchantCatalog, getMerchantGtins } from "@/lib/merchant/data";
import { buildMerchantFeed } from "@/lib/merchant/feed";
import { getStoreUrl } from "@/lib/store";

export const maxDuration = 300;

export async function GET() {
  // Cache Components: defer catalogue access to request time.
  await connection();
  const headers = {
    "Cache-Control": "no-store",
    "X-Robots-Tag": "noindex, nofollow",
  };
  let stage = "configuration";
  try {
    const storeUrl = getStoreUrl();
    if (!storeUrl) throw new Error("Merchant store URL is not configured.");
    stage = "market/catalogue";
    const products = await getMerchantCatalog();
    stage = "identifiers";
    const gtins = await getMerchantGtins(products);
    stage = "xml";
    const { chunks, itemCount, skippedCount } = buildMerchantFeed(products, {
      storeUrl,
      gtins,
    });
    // All remote work and XML validation have finished. Only local chunks are
    // streamed, so an upstream error cannot become successful partial XML.
    const encoder = new TextEncoder();
    let index = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (index < chunks.length)
          controller.enqueue(encoder.encode(chunks[index++]));
        else controller.close();
      },
    });
    return new Response(stream, {
      headers: {
        ...headers,
        "Content-Type": "application/xml; charset=utf-8",
        "X-Merchant-Item-Count": String(itemCount),
        "X-Merchant-Skipped-Count": String(skippedCount),
      },
    });
  } catch {
    // Only fixed stage names: no upstream payload, catalogue or credentials.
    console.error("Merchant feed unavailable", { stage });
    return new Response(
      "Merchant feed temporarily unavailable; no catalogue update was generated.",
      {
        status: 503,
        headers: {
          ...headers,
          "Content-Type": "text/plain; charset=utf-8",
          "Retry-After": "300",
        },
      },
    );
  }
}
