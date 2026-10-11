import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getShippingOperationsSessionValue } from "@/lib/shipping/operations-auth";
import { GET } from "./route";

const { snapshot, render } = vi.hoisted(() => ({
  snapshot: vi.fn(),
  render: vi.fn(),
}));
vi.mock("@/lib/social/data", () => ({ getDailySocialOffers: snapshot }));
vi.mock("@/lib/social/template", () => ({ renderOfferSlide: render }));
const offer = {
  productId: "p1",
  variantId: "v1",
  category: "tcg",
  name: "Oferta",
  slug: "oferta",
  price: 10,
  originalPrice: 15,
  imageUrl: "https://example.test/photo.jpg",
};
function request(query: string, authenticated = true) {
  return new Request(
    `https://example.test/api/internal/offers/image?${query}`,
    {
      headers: authenticated
        ? {
            cookie: `bison_shipping_ops=${getShippingOperationsSessionValue()}`,
          }
        : {},
    },
  );
}
beforeEach(() => {
  vi.stubEnv("SHIPPING_OPERATIONS_TOKEN", "operations-test");
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://example.test");
  vi.stubEnv("STORE_LOGO_URL", "https://example.test/logo.png");
  snapshot
    .mockReset()
    .mockResolvedValue({
      dayKey: "2026-10-11",
      priceListId: "daily",
      offers: [offer],
    });
  render.mockReset().mockResolvedValue(Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
});
afterEach(() => vi.unstubAllEnvs());

describe("private daily offer images", () => {
  it("requires operations auth before loading images", async () => {
    expect((await GET(request("category=tcg", false))).status).toBe(401);
    expect(snapshot).not.toHaveBeenCalled();
    expect(render).not.toHaveBeenCalled();
  });
  it.each([
    "",
    "category=constructor",
    "category=__proto__",
    "category=unknown",
    "category=tcg%0d%0a",
  ])("rejects unknown category %s", async (query) => {
    expect((await GET(request(query))).status).toBe(400);
    expect(render).not.toHaveBeenCalled();
  });
  it("returns an inline private JPEG built only from the requested category", async () => {
    const response = await GET(request("category=tcg"));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/jpeg");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("content-disposition")).toBe(
      'inline; filename="bison-ofertas-2026-10-11-tcg.jpg"',
    );
    expect([...new Uint8Array(await response.arrayBuffer())]).toEqual([
      0xff, 0xd8, 0xff, 0xd9,
    ]);
    expect(render).toHaveBeenCalledWith({
      dayKey: "2026-10-11",
      categoryLabel: "TCG",
      offers: [offer],
      logoUrl: "https://example.test/logo.png",
      storeUrl: "https://example.test",
    });
  });
  it("offers an attachment download", async () => {
    const response = await GET(request("category=tcg&download=1"));
    expect(response.headers.get("content-disposition")).toBe(
      'attachment; filename="bison-ofertas-2026-10-11-tcg.jpg"',
    );
  });
  it("does not render an empty category", async () => {
    expect((await GET(request("category=accesorios"))).status).toBe(404);
    expect(render).not.toHaveBeenCalled();
  });
  it("sanitizes rendering failures", async () => {
    render.mockRejectedValue(new Error("image secret-never-returned"));
    const response = await GET(request("category=tcg"));
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("secret-never-returned");
  });
});
