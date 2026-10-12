import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  marketsList: vi.fn(),
  productsList: vi.fn(),
  categoriesList: vi.fn(),
}));

const cache = vi.hoisted(() => ({
  life: vi.fn(),
  tag: vi.fn(),
}));

vi.mock("@/lib/spree", () => ({
  getClient: () => ({
    markets: { list: api.marketsList },
    products: { list: api.productsList },
    categories: { list: api.categoriesList },
  }),
}));

vi.mock("next/cache", () => ({
  cacheLife: cache.life,
  cacheTag: cache.tag,
}));

import {
  getSitemapFallbackFingerprints as fallbackIndex,
  getSitemapCategoryPage,
  getSitemapFallbackFingerprintChunk,
  getSitemapResourceCount,
} from "@/lib/data/sitemap";

async function fingerprintChunk(
  chunkId: number,
): Promise<Record<string, string>> {
  return getSitemapFallbackFingerprintChunk(
    "products",
    "market-1",
    { country: "us", locale: "en" },
    chunkId,
  );
}

const product = {
  id: "product-1",
  name: "Coffee",
  slug: "coffee",
  description: "Rich coffee",
  description_html: "<p>Rich coffee</p>",
  meta_title: "Coffee beans",
  meta_description: "Whole coffee beans",
  meta_keywords: "coffee",
  price: { amount: "10" },
};

function expectedFingerprint(item: typeof product): string {
  return createHash("sha256")
    .update(
      JSON.stringify([
        item.name,
        item.slug,
        item.description,
        item.description_html,
        item.meta_title,
        item.meta_description,
        item.meta_keywords,
      ]),
    )
    .digest("hex");
}

describe("sitemap data cache", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("counts public categories including top-level landing pages", async () => {
    api.categoriesList.mockResolvedValue({
      data: [],
      meta: { count: 19 },
    });

    await expect(
      getSitemapResourceCount("categories", "market-1", {
        country: "us",
        locale: "en",
      }),
    ).resolves.toBe(19);

    expect(api.categoriesList).toHaveBeenCalledWith(
      { page: 1, limit: 1 },
      { country: "us", locale: "en" },
    );
    expect(cache.life).toHaveBeenCalledWith("tenMinutes");
    expect(cache.tag).toHaveBeenCalledWith(
      "sitemap",
      "categories",
      "sitemap-market:market-1",
    );
  });

  it("loads top-level categories along with child categories", async () => {
    api.categoriesList.mockResolvedValue({ data: [], meta: { count: 0 } });

    await getSitemapCategoryPage("market-1", 2, 100, {
      country: "us",
      locale: "de",
    });

    expect(api.categoriesList).toHaveBeenCalledWith(
      { page: 2, limit: 100 },
      { country: "us", locale: "de" },
    );
  });

  it("builds a compact default-locale hash index with the sitemap cache policy", async () => {
    api.productsList.mockResolvedValue({ data: [product], meta: { count: 1 } });
    const result = await fallbackIndex("products", "market-1", {
      country: "us",
      locale: "en",
    });
    expect(result).toEqual({ "product-1": expectedFingerprint(product) });
    expect(JSON.stringify(result)).not.toContain(product.description_html);
    expect(cache.life).toHaveBeenCalledWith("tenMinutes");
    expect(cache.tag).toHaveBeenCalledWith(
      "sitemap",
      "products",
      "sitemap-market:market-1",
    );
  });

  it.each([
    "name",
    "slug",
    "description",
    "description_html",
    "meta_title",
    "meta_description",
    "meta_keywords",
  ] as const)("changes the indexed hash when translated field %s changes", async (field) => {
    api.productsList.mockResolvedValue({ data: [product], meta: { count: 1 } });
    const before = await fallbackIndex("products", "market-1", {
      country: "us",
      locale: "en",
    });
    api.productsList.mockResolvedValue({
      data: [{ ...product, [field]: "Changed translation" }],
      meta: { count: 1 },
    });
    const after = await fallbackIndex("products", "market-1", {
      country: "us",
      locale: "en",
    });
    expect(after[product.id]).not.toBe(before[product.id]);
  });

  it("isolates resource, market, and locale context even when stable IDs overlap", async () => {
    api.productsList.mockImplementation(async (_params, options) => ({
      data: [{ ...product, name: `${options.country}/${options.locale}` }],
      meta: { count: 1 },
    }));
    const { slug: _slug, ...categoryFields } = product;
    api.categoriesList.mockResolvedValue({
      data: [{ ...categoryFields, permalink: "games" }],
      meta: { count: 1 },
    });
    const us = await fallbackIndex("products", "market-1", {
      country: "us",
      locale: "en",
    });
    const ca = await fallbackIndex("products", "market-2", {
      country: "ca",
      locale: "en",
    });
    const es = await fallbackIndex("products", "market-1", {
      country: "us",
      locale: "es",
    });
    const categories = await fallbackIndex("categories", "market-1", {
      country: "us",
      locale: "en",
    });
    expect(
      new Set([
        us[product.id],
        ca[product.id],
        es[product.id],
        categories[product.id],
      ]).size,
    ).toBe(4);
    expect(cache.tag).toHaveBeenCalledWith(
      "sitemap",
      "products",
      "sitemap-market:market-2",
    );
    expect(cache.tag).toHaveBeenCalledWith(
      "sitemap",
      "categories",
      "sitemap-market:market-1",
    );
  });

  it("rejects a failed catalogue page instead of caching a partial comparison index", async () => {
    api.productsList.mockImplementation(async ({ limit }) => {
      if (limit === 1) return { data: [], meta: { count: 101 } };
      throw new Error("catalogue unavailable");
    });
    await expect(
      fallbackIndex("products", "market-1", { country: "us", locale: "en" }),
    ).rejects.toThrow("catalogue unavailable");
  });

  it("rejects catalogues beyond the comparison pagination cap", async () => {
    api.productsList.mockResolvedValue({ data: [], meta: { count: 100_001 } });
    await expect(
      fallbackIndex("products", "market-1", { country: "us", locale: "en" }),
    ).rejects.toThrow("pagination limit");
  });

  it("keeps comparison pages inside their 10,000-item cache chunk", async () => {
    api.productsList.mockImplementation(async ({ page, limit }) => ({
      data: limit === 1 ? [] : [{ ...product, id: `product-page-${page}` }],
      meta: { count: 10_001 },
    }));
    const first = await fingerprintChunk(0);
    expect(first["product-page-100"]).toBe(expectedFingerprint(product));
    expect(first["product-page-101"]).toBeUndefined();
    expect(
      api.productsList.mock.calls
        .filter(([params]) => params.limit === 100)
        .map(([params]) => params.page),
    ).toEqual(Array.from({ length: 100 }, (_, index) => index + 1));
    api.productsList.mockClear();
    const next = await fingerprintChunk(1);
    expect(next).toEqual({ "product-page-101": expectedFingerprint(product) });
    expect(
      api.productsList.mock.calls
        .filter(([params]) => params.limit === 100)
        .map(([params]) => params.page),
    ).toEqual([101]);
  });

  it("assembles comparison hashes across the 10,000-item boundary", async () => {
    api.productsList.mockImplementation(async ({ page, limit }) => ({
      data: limit === 1 ? [] : [{ ...product, id: `product-page-${page}` }],
      meta: { count: 10_001 },
    }));
    const index = await fallbackIndex("products", "market-1", {
      country: "us",
      locale: "en",
    });
    expect(index["product-page-100"]).toBe(expectedFingerprint(product));
    expect(index["product-page-101"]).toBe(expectedFingerprint(product));
    expect(Object.keys(index)).toHaveLength(101);
  });

  it("rejects oversized encoded cache chunks below Vercel's 2 MB limit", async () => {
    // UTF-8 bytes, rather than JS string length, determine cache payload size.
    api.productsList.mockResolvedValue({
      data: [{ ...product, id: "🦬".repeat(480_000) }],
      meta: { count: 1 },
    });
    await expect(fingerprintChunk(0)).rejects.toThrow("cache byte limit");
  });
});
