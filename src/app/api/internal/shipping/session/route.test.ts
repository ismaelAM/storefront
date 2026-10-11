import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getShippingOperationsSessionValue } from "@/lib/shipping/operations-auth";
import { POST } from "./route";

function request(fields: Record<string, string>) {
  return new Request("https://example.test/api/internal/shipping/session", {
    method: "POST",
    body: new URLSearchParams(fields),
  });
}

beforeEach(() => vi.stubEnv("SHIPPING_OPERATIONS_TOKEN", "operations-test"));
afterEach(() => vi.unstubAllEnvs());

describe("operations login destinations", () => {
  it("returns a successful login to the offers panel with the existing signed session", async () => {
    const response = await POST(
      request({ token: "operations-test", returnTo: "/ops/offers" }),
    );
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "https://example.test/ops/offers",
    );
    expect(response.headers.get("set-cookie")).toContain(
      `bison_shipping_ops=${getShippingOperationsSessionValue()}`,
    );
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
    expect(response.headers.get("set-cookie")).toContain("SameSite=strict");
  });

  it("returns a failed login to the offers panel without issuing a session", async () => {
    const response = await POST(
      request({ token: "wrong", returnTo: "/ops/offers" }),
    );
    expect(response.headers.get("location")).toBe(
      "https://example.test/ops/offers?error=1",
    );
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("returns logout to the offers panel and removes the existing cookie", async () => {
    const response = await POST(
      request({ action: "logout", returnTo: "/ops/offers" }),
    );
    expect(response.headers.get("location")).toBe(
      "https://example.test/ops/offers",
    );
    expect(response.headers.get("set-cookie")).toContain("Max-Age=-1");
  });

  it.each([
    "https://evil.test",
    "//evil.test",
    "/\\evil.test",
    "/ops/offers?next=https://evil.test",
    "/ops/offers/../shipping",
    "/ops/offers#evil",
    "%2f%2fevil.test",
  ])("rejects unapproved returnTo %s", async (returnTo) => {
    const response = await POST(
      request({ token: "operations-test", returnTo }),
    );
    expect(response.headers.get("location")).toBe(
      "https://example.test/ops/shipping",
    );
  });

  it("preserves the shipping destination when no returnTo is supplied", async () => {
    expect(
      (await POST(request({ token: "operations-test" }))).headers.get(
        "location",
      ),
    ).toBe("https://example.test/ops/shipping");
  });

  it("fails closed when operations are unconfigured", async () => {
    vi.stubEnv("SHIPPING_OPERATIONS_TOKEN", "");
    expect(
      (
        await POST(
          request({ token: "operations-test", returnTo: "/ops/offers" }),
        )
      ).status,
    ).toBe(503);
  });
});
