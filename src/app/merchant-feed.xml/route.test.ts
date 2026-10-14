// @vitest-environment node
import type { Product } from "@spree/sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET, maxDuration } from "./route";

const mocks = vi.hoisted(() => ({ catalog: vi.fn(), gtins: vi.fn() }));
vi.mock("@/lib/merchant/data", () => ({
  getMerchantCatalog: mocks.catalog,
  getMerchantGtins: mocks.gtins,
}));
vi.mock("next/server", () => ({
  connection: vi.fn().mockResolvedValue(undefined),
}));
const product = {
  id: "p-1",
  name: "Juego",
  slug: "juego",
  price: { amount: "25", currency: "EUR" },
  purchasable: true,
  in_stock: true,
  default_variant_id: "v-1",
  media: [
    {
      media_type: "image",
      original_url: "https://images.example.com/juego.jpg",
      variant_ids: [],
    },
  ],
} as unknown as Product;
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://www.bisontcg.com");
  mocks.catalog.mockResolvedValue([product]);
  mocks.gtins.mockResolvedValue(new Map());
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => vi.restoreAllMocks());

describe("public Merchant feed route", () => {
  it("streams complete XML with feed diagnostics and noindex", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/xml");
    expect(response.headers.get("x-robots-tag")).toContain("noindex");
    expect(response.headers.get("x-merchant-item-count")).toBe("1");
    expect(maxDuration).toBe(300);
    expect(await response.text()).toMatch(
      /<item>[\s\S]*<\/item><\/channel><\/rss>$/,
    );
  });
  it.each([
    "catalog",
    "gtins",
  ] as const)("returns a non-cacheable 503 before XML on %s failure", async (dependency) => {
    mocks[dependency].mockRejectedValue(
      new Error("secret private backend details"),
    );
    const response = await GET();
    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const body = await response.text();
    expect(body).not.toContain("<rss");
    expect(body).not.toContain("secret private backend details");
    expect(console.error).toHaveBeenCalledWith("Merchant feed unavailable", {
      stage: dependency === "catalog" ? "market/catalogue" : "identifiers",
    });
  });
  it("rejects an empty eligible feed", async () => {
    mocks.catalog.mockResolvedValue([{ ...product, media: [] }]);
    expect((await GET()).status).toBe(503);
  });

  it("streams a complete document larger than the ordinary Vercel response limit", async () => {
    mocks.catalog.mockResolvedValue(
      Array.from({ length: 1000 }, (_, i) => ({
        ...product,
        id: `p-${i}`,
        default_variant_id: `v-${i}`,
        media: [
          {
            media_type: "image",
            original_url: `https://images.example.com/x?${"&".repeat(1200)}`,
            variant_ids: [],
          },
        ],
      })),
    );
    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("x-merchant-item-count")).toBe("1000");
    const xml = await response.text();
    expect(Buffer.byteLength(xml)).toBeGreaterThan(4_500_000);
    expect(xml.match(/<item>/g)).toHaveLength(1000);
    expect(xml.endsWith("</channel></rss>")).toBe(true);
  });
});
