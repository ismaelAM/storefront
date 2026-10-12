import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ headers: vi.fn(), markets: vi.fn() }));
vi.mock("next/headers", () => ({ headers: mocks.headers }));
vi.mock("@/lib/data/markets", () => ({ getMarkets: mocks.markets }));

import { generateHomeMetadata } from "./home";
import { generateStoreMetadata } from "./store";

beforeEach(() => {
  mocks.headers.mockResolvedValue(new Headers());
  mocks.markets.mockResolvedValue({ data: [] });
  vi.stubEnv("NEXT_PUBLIC_STORE_NAME", "BisonTCG");
  vi.stubEnv("STORE_SEO_TITLE", "BisonTCG | TCG y juegos de mesa");
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://www.bisontcg.com");
  vi.stubEnv("GOOGLE_SITE_VERIFICATION", "");
});

afterEach(() => vi.unstubAllEnvs());

describe("store search and sharing metadata", () => {
  it("keeps the Open Graph locale on the homepage override", async () => {
    expect(
      (await generateHomeMetadata({ country: "es", locale: "es" })).openGraph,
    ).toMatchObject({ locale: "es_ES" });
  });
  it("uses the concise brand in page title templates", async () => {
    const metadata = await generateStoreMetadata({
      country: "es",
      locale: "es",
    });
    expect(metadata.title).toEqual({
      default: "BisonTCG | TCG y juegos de mesa",
      template: "%s | BisonTCG",
    });
  });

  it("provides actual branded image dimensions, icons and country locale", async () => {
    const metadata = await generateStoreMetadata({
      country: "es",
      locale: "es",
    });
    expect(metadata.openGraph).toMatchObject({
      locale: "es_ES",
      images: [
        {
          url: "/bison-social-image.webp",
          width: 1200,
          height: 630,
          alt: "BisonTCG",
        },
      ],
    });
    expect(metadata.icons).toMatchObject({
      icon: [{ url: "/bison-icon.png", sizes: "192x192" }],
      apple: [{ url: "/bison-apple-icon.png", sizes: "180x180" }],
    });
    expect(metadata.robots).toMatchObject({
      googleBot: { "max-image-preview": "large" },
    });
  });

  it("includes only a configured Google ownership token", async () => {
    expect(
      (await generateStoreMetadata({ country: "es", locale: "es" }))
        .verification,
    ).toBeUndefined();
    vi.stubEnv("GOOGLE_SITE_VERIFICATION", "  verified-owner-token  ");
    expect(
      (await generateStoreMetadata({ country: "es", locale: "es" }))
        .verification,
    ).toEqual({ google: "verified-owner-token" });
  });
});
