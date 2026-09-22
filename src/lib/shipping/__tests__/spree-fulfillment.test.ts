import { describe, expect, it, vi } from "vitest";

import {
  fulfillFulfillment,
  getSpreeShippingConfigurationStatus,
  markFulfillmentDelivered,
  SpreeShippingApiError,
  spreeShippingRequest,
  updateFulfillmentTracking,
} from "@/lib/shipping/spree-fulfillment";

const env = {
  SPREE_API_URL: "https://shop.example.test",
  SPREE_ADMIN_API_KEY: "sk_test_shipping",
};

describe("Spree fulfillment shipping operations", () => {
  it("reports whether the private Admin API configuration is usable", () => {
    expect(getSpreeShippingConfigurationStatus(env)).toEqual({
      ready: true,
      hasBaseUrl: true,
      hasAdminApiKey: true,
    });
    expect(
      getSpreeShippingConfigurationStatus({
        SPREE_API_URL: "https://shop.example.test",
        SPREE_ADMIN_API_KEY: "[SENSITIVE]",
      }),
    ).toMatchObject({ ready: false, hasAdminApiKey: false });
  });

  it("saves tracking through the Admin fulfillment endpoint", async () => {
    const fetcher = vi.fn<typeof fetch>(async (input, init) => {
      expect(String(input)).toBe(
        "https://shop.example.test/api/v3/admin/orders/or_1/fulfillments/ful_1",
      );
      expect(init?.method).toBe("PATCH");
      expect(new Headers(init?.headers).get("X-Spree-Api-Key")).toBe(
        "sk_test_shipping",
      );
      expect(init?.body).toBe(
        JSON.stringify({ tracking: "PQ123", tracking_carrier: "correos" }),
      );
      return Response.json({ id: "ful_1", tracking: "PQ123" });
    });

    await expect(
      updateFulfillmentTracking("or_1", "ful_1", "PQ123", "correos", {
        env,
        fetcher,
      }),
    ).resolves.toMatchObject({ id: "ful_1", tracking: "PQ123" });
  });

  it("marks a fulfillment shipped using Spree's native workflow", async () => {
    const fetcher = vi.fn<typeof fetch>(async (input, init) => {
      expect(String(input)).toBe(
        "https://shop.example.test/api/v3/admin/orders/or_1/fulfillments/ful_1/fulfill",
      );
      expect(init?.method).toBe("PATCH");
      expect(init?.body).toBe(
        JSON.stringify({ tracking: "PQ123", tracking_carrier: "correos" }),
      );
      return Response.json({ id: "ful_1", status: "fulfilled" });
    });

    await expect(
      fulfillFulfillment(
        "or_1",
        "ful_1",
        { tracking: "PQ123", tracking_carrier: "correos" },
        { env, fetcher },
      ),
    ).resolves.toMatchObject({ status: "fulfilled" });
  });

  it("marks delivery through Spree instead of inventing a local state", async () => {
    const fetcher = vi.fn<typeof fetch>(async (input, init) => {
      expect(String(input)).toBe(
        "https://shop.example.test/api/v3/admin/orders/or_1/fulfillments/ful_1/mark_delivered",
      );
      expect(init?.body).toBe(
        JSON.stringify({ delivered_at: "2026-09-21T12:00:00.000Z" }),
      );
      return Response.json({ id: "ful_1", status: "delivered" });
    });

    await expect(
      markFulfillmentDelivered("or_1", "ful_1", "2026-09-21T12:00:00.000Z", {
        env,
        fetcher,
      }),
    ).resolves.toMatchObject({ status: "delivered" });
  });

  it("rejects absolute and escaping paths before sending the Admin key", async () => {
    const fetcher = vi.fn<typeof fetch>();

    await expect(
      spreeShippingRequest("GET", "https://example.com/steal", undefined, {
        env,
        fetcher,
      }),
    ).rejects.toThrow("debe ser relativa");

    await expect(
      spreeShippingRequest("GET", "../outside", undefined, { env, fetcher }),
    ).rejects.toThrow("sale del endpoint Admin");

    expect(fetcher).not.toHaveBeenCalled();
  });

  it("does not include provider response bodies or secrets in errors", async () => {
    const fetcher = vi.fn<typeof fetch>(async () =>
      Response.json(
        { secret: "sk_test_shipping", detail: "provider private payload" },
        { status: 422 },
      ),
    );

    const error = await spreeShippingRequest(
      "GET",
      "/orders/or_1/fulfillments",
      undefined,
      { env, fetcher },
    ).catch((cause: unknown) => cause);

    expect(error).toBeInstanceOf(SpreeShippingApiError);
    expect(String(error)).toContain("HTTP 422");
    expect(String(error)).not.toContain("sk_test_shipping");
    expect(String(error)).not.toContain("provider private payload");
  });
});
