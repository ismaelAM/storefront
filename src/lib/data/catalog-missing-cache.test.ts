import { SpreeError } from "@spree/sdk";
import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({ product: vi.fn(), category: vi.fn() }));
vi.mock("next/cache", () => ({ cacheLife: vi.fn(), cacheTag: vi.fn() }));
vi.mock("@/lib/spree", () => ({
  DEFAULT_SURFACE: "dtc",
  cacheTagSuffix: (surface: string) => (surface === "dtc" ? "" : ":wholesale"),
  getAccessToken: async () => undefined,
  getLocaleOptions: async () => ({ country: "es", locale: "es" }),
  getClient: () => ({ categories: { get: api.category } }),
  getClientForSurface: () => ({ products: { get: api.product } }),
}));

import { cachedGetCategory, getCategory } from "./categories";
import { cachedGetProduct, getProduct } from "./products";

beforeEach(() => vi.resetAllMocks());

// A thrown SDK error loses custom status/code fields across the remote cache.
// A confirmed absence must cross that boundary as data; request wrappers retain
// the existing status404 API for page, metadata and legacy redirect callers.
describe.each([
  {
    name: "category",
    fetch: api.category,
    cached: () =>
      cachedGetCategory("retired", undefined, { country: "es", locale: "es" }),
    read: () => getCategory("retired"),
  },
  {
    name: "product",
    fetch: api.product,
    cached: () =>
      cachedGetProduct("retired", [], { country: "es", locale: "es" }, "dtc"),
    read: () => getProduct("retired"),
  },
  {
    name: "wholesale product",
    fetch: api.product,
    cached: () =>
      cachedGetProduct(
        "retired",
        [],
        { country: "es", locale: "es" },
        "wholesale",
        "buyer-token",
      ),
    read: () => getProduct("retired", undefined, "wholesale"),
  },
])("$name absence at the remote cache boundary", ({ fetch, cached, read }) => {
  it("transports an upstream404 as null and restores status404 outside the cache", async () => {
    fetch.mockRejectedValue(
      new SpreeError(
        { error: { code: "record_not_found", message: "Missing" } },
        404,
      ),
    );
    await expect(cached()).resolves.toBeNull();
    await expect(read()).rejects.toMatchObject({ status: 404 });
  });
  it.each([
    401, 403, 500,
  ])("does not cache an upstream%s failure as absence", async (status) => {
    const error = new SpreeError(
      { error: { code: "api_failure", message: "Upstream failure" } },
      status,
    );
    fetch.mockRejectedValue(error);
    await expect(cached()).rejects.toBe(error);
    await expect(read()).rejects.toBe(error);
  });
  it("does not turn transport errors into missing resources", async () => {
    const error = new TypeError("fetch failed");
    fetch.mockRejectedValue(error);
    await expect(cached()).rejects.toBe(error);
  });
  it("preserves a successful resource across the cache and request wrappers", async () => {
    const resource = {
      id: "resource",
      name: "Existing",
      slug: "existing",
      permalink: "existing",
    };
    fetch.mockResolvedValue(resource);
    await expect(cached()).resolves.toBe(resource);
    await expect(read()).resolves.toBe(resource);
  });
});
