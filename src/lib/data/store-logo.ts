import "server-only";

import { cacheLife, cacheTag } from "next/cache";
import { spreeShippingRequest } from "@/lib/shipping/spree-fulfillment";

function imageUrl(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const url = value.trim();
  if (url.startsWith("/") && !url.startsWith("//")) return url;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && !parsed.username && !parsed.password
      ? parsed.href
      : null;
  } catch {
    return null;
  }
}

/** Only the public image URL leaves the server, never the Admin response/key. */
export async function cachedGetStoreLogo(): Promise<string | null> {
  "use cache: remote";
  cacheLife("tenMinutes");
  cacheTag("store-branding");
  const fallback = imageUrl(process.env.STORE_LOGO_URL);
  try {
    const store = await spreeShippingRequest<{ logo_url?: unknown }>(
      "GET",
      "/store",
      undefined,
      {
        fetcher: (input, init) =>
          fetch(input, { ...init, signal: AbortSignal.timeout(5_000) }),
      },
    );
    return imageUrl(store.logo_url) ?? fallback;
  } catch {
    // Branding must not block shopping when read_settings is unavailable.
    return fallback;
  }
}
