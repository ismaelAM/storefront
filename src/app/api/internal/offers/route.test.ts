import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getShippingOperationsSessionValue } from "@/lib/shipping/operations-auth";
import { GET, POST } from "./route";

const { snapshot, publish } = vi.hoisted(() => ({
  snapshot: vi.fn(),
  publish: vi.fn(),
}));
vi.mock("@/lib/social/data", () => ({ getDailySocialOffers: snapshot }));
vi.mock("@/lib/social/publication", () => ({
  runDailySocialPublication: publish,
}));
const offers = { dayKey: "2026-10-11", priceListId: "daily", offers: [] };
function request(method = "GET", headers: Record<string, string> = {}) {
  return new Request("https://example.test/api/internal/offers", {
    method,
    headers,
  });
}
function cookie() {
  return {
    cookie: `bison_shipping_ops=${getShippingOperationsSessionValue()}`,
  };
}
beforeEach(() => {
  vi.stubEnv("SHIPPING_OPERATIONS_TOKEN", "operations-test");
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://example.test");
  vi.stubEnv("INSTAGRAM_ACCOUNT_ID", "1234");
  vi.stubEnv("INSTAGRAM_ACCESS_TOKEN", "secret-never-returned");
  vi.stubEnv("INSTAGRAM_API_VERSION", "v25.0");
  snapshot.mockReset().mockResolvedValue(offers);
  publish
    .mockReset()
    .mockResolvedValue({ status: "published", mediaId: "12345" });
});
afterEach(() => vi.unstubAllEnvs());

describe("private daily offer operations", () => {
  it.each<Record<string, string>>([
    {},
    { cookie: "bison_shipping_ops=forged" },
    { authorization: "Bearer wrong" },
  ])("rejects invalid GET credentials %j", async (headers) => {
    const response = await GET(request("GET", headers));
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Unauthorized" });
    expect(snapshot).not.toHaveBeenCalled();
  });
  it("returns fresh offers and caption with private caching and no Instagram secrets", async () => {
    const response = await GET(request("GET", cookie()));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    const data = await response.json();
    expect(data).toMatchObject({ snapshot: offers, instagramConfigured: true });
    expect(data.caption).toContain("https://example.test");
    expect(JSON.stringify(data)).not.toContain("secret-never-returned");
    expect(data).not.toHaveProperty("accessToken");
  });
  it("keeps the download fallback available without Instagram credentials", async () => {
    vi.stubEnv("INSTAGRAM_ACCESS_TOKEN", "");
    const response = await GET(request("GET", cookie()));
    expect(response.status).toBe(200);
    expect((await response.json()).instagramConfigured).toBe(false);
  });
  it("sanitizes data errors", async () => {
    snapshot.mockRejectedValue(new Error("database secret-never-returned"));
    const response = await GET(request("GET", cookie()));
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("secret-never-returned");
  });
  it("rejects unauthenticated publication", async () => {
    expect(
      (await POST(request("POST", { origin: "https://example.test" }))).status,
    ).toBe(401);
    expect(publish).not.toHaveBeenCalled();
  });
  it.each([
    undefined,
    "https://evil.test",
    "null",
  ])("rejects cookie publication with Origin %s", async (origin) => {
    const response = await POST(
      request("POST", { ...cookie(), ...(origin ? { origin } : {}) }),
    );
    expect(response.status).toBe(403);
    expect(publish).not.toHaveBeenCalled();
  });
  it("does not let a forged bearer bypass the origin requirement of a valid cookie", async () => {
    expect(
      (
        await POST(
          request("POST", { ...cookie(), authorization: "Bearer wrong" }),
        )
      ).status,
    ).toBe(403);
    expect(publish).not.toHaveBeenCalled();
  });
  it("publishes for an authenticated same-origin browser", async () => {
    const response = await POST(
      request("POST", { ...cookie(), origin: "https://example.test" }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      status: "published",
      mediaId: "12345",
    });
  });
  it("allows a valid operations bearer without browser origin", async () => {
    expect(
      (await POST(request("POST", { authorization: "Bearer operations-test" })))
        .status,
    ).toBe(200);
    expect(publish).toHaveBeenCalledOnce();
  });
  it("sanitizes unexpected publication errors", async () => {
    publish.mockRejectedValue(new Error("provider secret-never-returned"));
    const response = await POST(
      request("POST", { authorization: "Bearer operations-test" }),
    );
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("secret-never-returned");
  });
});
