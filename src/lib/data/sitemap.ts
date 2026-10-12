"use server";

import type { Category, Media, Product } from "@spree/sdk";
import { cacheLife, cacheTag } from "next/cache";
import { getClient } from "@/lib/spree";
import { hashSitemapResource } from "./sitemap-fingerprint";

interface LocaleOptions {
  locale: string;
  country: string;
}

export type SitemapProduct = Product & {
  media?: Media[];
  updated_at?: string;
};

export type SitemapCategory = Category & {
  updated_at?: string;
};

export type SitemapResource = "products" | "categories";

const INDEX_PAGE_SIZE = 100;
const MAX_INDEX_PAGES = 1000;
const MAX_CONCURRENT_INDEX_PAGES = 8;
const INDEX_CHUNK_SIZE = 10_000;
// Leave room for the cache envelope below Vercel's 2 MB per-item limit.
const MAX_INDEX_CHUNK_BYTES = 1_900_000;

export async function getSitemapMarkets(options: LocaleOptions) {
  "use cache: remote";
  cacheLife("hours");
  cacheTag("markets", "sitemap");
  return (await getClient().markets.list(options)).data;
}

export async function getSitemapResourceCount(
  resource: SitemapResource,
  marketId: string,
  options: LocaleOptions,
): Promise<number> {
  "use cache: remote";
  cacheLife("tenMinutes");
  cacheTag("sitemap", resource, `sitemap-market:${marketId}`);

  const response =
    resource === "products"
      ? await getClient().products.list({ page: 1, limit: 1 }, options)
      : await getClient().categories.list({ page: 1, limit: 1 }, options);
  return Math.max(0, response.meta.count);
}

export async function getSitemapProductPage(
  marketId: string,
  page: number,
  limit: number,
  options: LocaleOptions,
): Promise<SitemapProduct[]> {
  "use cache: remote";
  cacheLife("tenMinutes");
  cacheTag("sitemap", "products", `sitemap-market:${marketId}`);
  const response = await getClient().products.list(
    { page, limit, expand: ["media"] },
    options,
  );
  return response.data as SitemapProduct[];
}

export async function getSitemapCategoryPage(
  marketId: string,
  page: number,
  limit: number,
  options: LocaleOptions,
): Promise<SitemapCategory[]> {
  "use cache: remote";
  cacheLife("tenMinutes");
  cacheTag("sitemap", "categories", `sitemap-market:${marketId}`);
  const response = await getClient().categories.list({ page, limit }, options);
  return response.data;
}

/**
 * Assemble remote-cached hash chunks locally; never cache the entire index.
 * Cold generation is capped at 1,000 catalogue pages (100,000 items). Chunks
 * run sequentially so eight concurrent page requests remain the upper bound.
 */
export async function getSitemapFallbackFingerprints(
  resource: SitemapResource,
  marketId: string,
  options: LocaleOptions,
): Promise<Record<string, string>> {
  const count = await getSitemapResourceCount(resource, marketId, options);
  const pageCount = Math.ceil(count / INDEX_PAGE_SIZE);
  if (pageCount > MAX_INDEX_PAGES) {
    throw new Error(
      `Sitemap comparison catalogue exceeds the ${MAX_INDEX_PAGES * INDEX_PAGE_SIZE}-item pagination limit.`,
    );
  }
  const index: Record<string, string> = {};
  for (
    let chunkId = 0;
    chunkId < Math.ceil(count / INDEX_CHUNK_SIZE);
    chunkId++
  ) {
    Object.assign(
      index,
      await getSitemapFallbackFingerprintChunk(
        resource,
        marketId,
        options,
        chunkId,
      ),
    );
  }
  return index;
}

/** A cold chunk reads at most 100 pages; its cached hashes stay below 2 MB. */
export async function getSitemapFallbackFingerprintChunk(
  resource: SitemapResource,
  marketId: string,
  options: LocaleOptions,
  chunkId: number,
): Promise<Record<string, string>> {
  "use cache: remote";
  cacheLife("tenMinutes");
  cacheTag("sitemap", resource, `sitemap-market:${marketId}`);

  const pagesPerChunk = INDEX_CHUNK_SIZE / INDEX_PAGE_SIZE;
  if (
    !Number.isSafeInteger(chunkId) ||
    chunkId < 0 ||
    chunkId >= MAX_INDEX_PAGES / pagesPerChunk
  ) {
    throw new Error("Invalid sitemap comparison chunk identifier.");
  }
  const count = await getSitemapResourceCount(resource, marketId, options);
  const pageCount = Math.ceil(count / INDEX_PAGE_SIZE);
  if (pageCount > MAX_INDEX_PAGES) {
    throw new Error(
      `Sitemap comparison catalogue exceeds the ${MAX_INDEX_PAGES * INDEX_PAGE_SIZE}-item pagination limit.`,
    );
  }
  const lastPage = Math.min((chunkId + 1) * pagesPerChunk, pageCount);
  const index: Record<string, string> = {};
  for (
    let firstPage = chunkId * pagesPerChunk + 1;
    firstPage <= lastPage;
    firstPage += MAX_CONCURRENT_INDEX_PAGES
  ) {
    const pages = Array.from(
      {
        length: Math.min(MAX_CONCURRENT_INDEX_PAGES, lastPage - firstPage + 1),
      },
      (_, offset) => firstPage + offset,
    );
    const batch = await Promise.all(
      pages.map((page) =>
        resource === "products"
          ? getSitemapProductPage(marketId, page, INDEX_PAGE_SIZE, options)
          : getSitemapCategoryPage(marketId, page, INDEX_PAGE_SIZE, options),
      ),
    );
    for (const items of batch) {
      for (const item of items) index[item.id] = hashSitemapResource(item);
    }
  }
  if (
    Buffer.byteLength(JSON.stringify(index), "utf8") > MAX_INDEX_CHUNK_BYTES
  ) {
    throw new Error(
      `Sitemap comparison chunk exceeds the ${MAX_INDEX_CHUNK_BYTES}-byte cache byte limit.`,
    );
  }
  return index;
}
