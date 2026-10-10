import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getShippingOperationsSessionValue } from "@/lib/shipping/operations-auth";
import { POST } from "./route";

const parcel = {
  postalCode: "28001",
  weightKg: 1,
  lengthCm: 20,
  widthCm: 15,
  heightCm: 10,
};
function request(cookie?: string) {
  return new Request("https://example.test/api/shipping/estimate", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify(parcel),
  });
}
beforeEach(() => {
  vi.stubEnv("SHIPPING_OPERATIONS_TOKEN", "test-operations-token");
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-10T12:00:00Z"));
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});
describe("internal-only shipping estimates", () => {
  it("rejects anonymous requests before calculating", async () => {
    const response = await POST(request());
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Unauthorized" });
  });
  it("rejects a forged operations session", async () => {
    expect((await POST(request("bison_shipping_ops=forged"))).status).toBe(401);
  });
  it("allows the existing signed operations session", async () => {
    const session = getShippingOperationsSessionValue();
    const response = await POST(request(`bison_shipping_ops=${session}`));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ totalCents: 1365 });
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });
});
