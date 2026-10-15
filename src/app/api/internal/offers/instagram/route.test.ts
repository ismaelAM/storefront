import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getShippingOperationsSessionValue } from "@/lib/shipping/operations-auth";

const { verify } = vi.hoisted(() => ({ verify: vi.fn() }));
vi.mock("@/lib/social/connection", () => ({ verifyInstagramAccount: verify }));

import { GET } from "./route";

function request(authenticated = true) {
  return new Request("https://example.test/api/internal/offers/instagram", {
    headers: authenticated
      ? { cookie: `bison_shipping_ops=${getShippingOperationsSessionValue()}` }
      : {},
  });
}
beforeEach(() => {
  vi.stubEnv("SHIPPING_OPERATIONS_TOKEN", "operations-test");
  vi.stubEnv("INSTAGRAM_ACCOUNT_ID", "123");
  vi.stubEnv("INSTAGRAM_ACCESS_TOKEN", "private-token");
  vi.stubEnv("INSTAGRAM_API_VERSION", "v26.0");
  verify
    .mockReset()
    .mockResolvedValue({ accountId: "123", username: "bisontcg" });
});
afterEach(() => vi.unstubAllEnvs());
describe("private read-only Instagram connection check", () => {
  it("rejects an unauthenticated check before contacting Meta", async () => {
    expect((await GET(request(false))).status).toBe(401);
    expect(verify).not.toHaveBeenCalled();
  });
  it("reports missing configuration without contacting Meta", async () => {
    vi.stubEnv("INSTAGRAM_ACCESS_TOKEN", "");
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ status: "not_configured" });
    expect(verify).not.toHaveBeenCalled();
  });
  it("returns the connected identity privately without exposing credentials", async () => {
    const response = await GET(request());
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    const body = await response.json();
    expect(body).toMatchObject({ status: "connected", username: "bisontcg" });
    expect(JSON.stringify(body)).not.toContain("private-token");
    expect(body.message).toContain("permiso");
  });
  it("sanitizes provider errors", async () => {
    verify.mockRejectedValue(new Error("private-token"));
    const response = await GET(request());
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("private-token");
  });
});
