import type { ProductListParams } from "@spree/sdk";
import { cacheLife, cacheTag } from "next/cache";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ list: vi.fn(), client: vi.fn() }));
vi.mock("next/cache", () => ({ cacheLife: vi.fn(), cacheTag: vi.fn() }));
vi.mock("@/lib/spree", () => ({
  DEFAULT_SURFACE: "dtc",
  cacheTagSuffix: (surface: string) =>
    surface === "wholesale" ? "-wholesale" : "",
  getClientForSurface: mocks.client,
  getAccessToken: async () => undefined,
  getLocaleOptions: async () => ({ country: "es", locale: "es" }),
}));
vi.mock("next-intl/plugin", () => ({
  default: () => (config: unknown) => config,
}));
vi.mock("@sentry/nextjs", () => ({
  withSentryConfig: (config: unknown) => config,
}));

import nextConfig from "../../../next.config";
import { cachedListProducts } from "./products";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.client.mockReturnValue({ products: { list: mocks.list } });
  mocks.list.mockResolvedValue({ data: [] });
});

describe("catalogue cache economy", () => {
  it.each([
    ["catalogGuestProducts", { stale: 120, revalidate: 600, expire: 1800 }],
    ["catalogProducts", { stale: 30, revalidate: 60, expire: 300 }],
    ["catalogDailyOffers", { stale: 15, revalidate: 60, expire: 120 }],
  ] as const)("configures %s with the approved freshness budget", (profile, lifetime) => {
    expect(nextConfig.cacheLife?.[profile]).toEqual(lifetime);
  });

  it.each([
    ["dtc", undefined, "catalogGuestProducts"],
    ["dtc", "customer-one-jwt", "catalogProducts"],
    ["wholesale", "buyer-jwt", "catalogProducts"],
    ["wholesale", undefined, "catalogProducts"],
  ] as const)("keeps the ordinary %s/%s catalogue on %s", async (surface, token, profile) => {
    await cachedListProducts(
      { limit: 8 },
      { country: "es", locale: "es" },
      surface,
      token,
    );
    expect(cacheLife).toHaveBeenCalledExactlyOnceWith(profile);
  });

  it.each([
    ["dtc", undefined],
    ["dtc", "customer-one-jwt"],
    ["wholesale", "buyer-jwt"],
  ] as const)("refreshes date-tagged offers quickly for %s/%s, including an empty selection at rotation", async (surface, token) => {
    const params = {
      limit: 40,
      tags_name_in: ["sale", "offer-date:2026-11-07"],
    };
    const response = { data: [] };
    mocks.list.mockResolvedValue(response);
    expect(
      await cachedListProducts(
        params,
        { country: "es", locale: "es" },
        surface,
        token,
      ),
    ).toBe(response);
    expect(cacheLife).toHaveBeenCalledExactlyOnceWith("catalogDailyOffers");
    expect(mocks.client).toHaveBeenCalledExactlyOnceWith(surface);
    expect(mocks.list).toHaveBeenCalledExactlyOnceWith(params, {
      country: "es",
      locale: "es",
      ...(token ? { token } : {}),
    });
    expect(cacheTag).toHaveBeenCalledExactlyOnceWith(
      surface === "dtc" ? "products" : "products-wholesale",
    );
  });

  it.each([
    undefined,
    false,
    42,
    [],
    ["daily-offer"],
    ["offer-date:2026-11"],
    ["offer-date:2026-11-07:archive"],
  ])("keeps unrelated or malformed date tags on the general guest budget: %j", async (tags) => {
    await cachedListProducts(
      { tags_name_in: tags },
      { country: "es", locale: "es" },
      "dtc",
    );
    expect(cacheLife).toHaveBeenCalledExactlyOnceWith("catalogGuestProducts");
  });

  it("recognizes a single date tag passed as an SDK string filter", async () => {
    await cachedListProducts(
      { tags_name_in: "offer-date:2026-11-07" },
      { country: "es", locale: "es" },
      "dtc",
    );
    expect(cacheLife).toHaveBeenCalledExactlyOnceWith("catalogDailyOffers");
  });

  it("preserves every JWT, market/country, locale, surface and selection when fetching native prices", async () => {
    const requests = [
      { country: "es", locale: "es", surface: "dtc", token: undefined },
      {
        country: "es",
        locale: "es",
        surface: "dtc",
        token: "customer-one-jwt",
      },
      {
        country: "es",
        locale: "es",
        surface: "dtc",
        token: "customer-two-jwt",
      },
      {
        country: "us",
        locale: "en",
        surface: "dtc",
        token: "customer-one-jwt",
      },
      { country: "es", locale: "en", surface: "wholesale", token: "buyer-jwt" },
    ] as const;
    const params: ProductListParams = {
      limit: 8,
      tags_name_in: ["offer-date:2026-11-07"],
    };
    for (const [
      index,
      { country, locale, surface, token },
    ] of requests.entries()) {
      const native = {
        data: [
          { id: `product-${index}`, price: { amount: `${100 - index}.00` } },
        ],
      };
      mocks.list.mockResolvedValueOnce(native);
      expect(
        await cachedListProducts(params, { country, locale }, surface, token),
      ).toBe(native);
      expect(mocks.client).toHaveBeenNthCalledWith(index + 1, surface);
      expect(mocks.list).toHaveBeenNthCalledWith(index + 1, params, {
        country,
        locale,
        ...(token ? { token } : {}),
      });
    }
  });
});
