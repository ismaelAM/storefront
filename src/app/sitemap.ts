import type { MetadataRoute } from "next";
import {
  DEFAULT_LOCALE,
  resolveSupportedLocale,
  type SupportedLocale,
} from "@/i18n/locales";
import {
  getMarketLocaleTargets,
  type MarketLocaleTarget,
} from "@/i18n/markets";
import {
  getSitemapCategoryPage,
  getSitemapFallbackFingerprints,
  getSitemapMarkets,
  getSitemapProductPage,
  getSitemapResourceCount,
  type SitemapCategory,
  type SitemapProduct,
} from "@/lib/data/sitemap";
import { hashSitemapResource } from "@/lib/data/sitemap-fingerprint";
import { BUYING_GUIDES, isBuyingGuideRoute } from "@/lib/guides/content";
import { getDefaultCountry, getDefaultLocale, getStoreUrl } from "@/lib/store";

export const dynamic = "force-dynamic";

type CountryLocale = MarketLocaleTarget;

interface LocaleOptions {
  locale: string;
  country: string;
}

interface LocaleCatalog extends LocaleOptions {
  marketId: string;
  productCount: number;
  categoryCount: number;
}

interface PageCaches {
  products: Map<string, Promise<SitemapProduct[]>>;
  categories: Map<string, Promise<SitemapCategory[]>>;
  fallbackFingerprints: Map<string, Promise<Record<string, string>>>;
}

/**
 * Google permits 50,000 URLs, but 10,000 bounds each shard's own URL pages to
 * roughly 100. The remote-cached translation baseline has a separate cold
 * generation limit of 1,000 pages per Market/resource/default locale.
 */
const URLS_PER_SITEMAP = 10_000;
const ITEMS_PER_PAGE = 100;
const MAX_PAGES = 1000;
const MAX_CONCURRENT_PAGE_REQUESTS = 8;
const MAX_CONCURRENT_CATALOG_REQUESTS = 4;
/** Maximum items we can actually fetch, given pagination limits. */
const MAX_FETCHABLE_ITEMS = ITEMS_PER_PAGE * MAX_PAGES;

/**
 * Default locale options for build-time API calls. During build, cookies() is
 * not available, so sitemap requests always pass explicit locale options.
 */
function getDefaultLocaleOptions(): LocaleOptions {
  return {
    locale: getDefaultLocale(),
    country: getDefaultCountry(),
  };
}

async function resolveLocaleCatalogs(
  countryLocales: CountryLocale[],
): Promise<Map<string, LocaleCatalog>> {
  const uniqueTargets = new Map<string, CountryLocale>();

  for (const target of countryLocales) {
    const key = catalogKey(target);
    if (!uniqueTargets.has(key)) uniqueTargets.set(key, target);
  }

  const targets = Array.from(uniqueTargets.entries());
  const entries: Array<readonly [string, LocaleCatalog]> = [];
  for (
    let offset = 0;
    offset < targets.length;
    offset += MAX_CONCURRENT_CATALOG_REQUESTS
  ) {
    const batch = targets.slice(
      offset,
      offset + MAX_CONCURRENT_CATALOG_REQUESTS,
    );
    entries.push(
      ...(await Promise.all(
        batch.map(
          async ([key, target]) =>
            [key, await buildLocaleCatalog(target)] as const,
        ),
      )),
    );
  }
  return new Map(entries);
}

function catalogKey(target: { marketId: string; locale: string }): string {
  return `${target.marketId}:${target.locale.toLowerCase()}`;
}

/**
 * Splits the sitemap into bounded files. Counts are fetched once per
 * Market/locale pair: countries in one Market share an inventory, while two
 * Markets using the same locale may expose entirely different catalogs.
 */
export async function generateSitemaps(): Promise<Array<{ id: number }>> {
  try {
    const { countryLocales } = await resolveCountryLocales();
    const catalogs = await resolveLocaleCatalogs(countryLocales);
    const totalUrls = countryLocales.reduce((total, target) => {
      const catalog = catalogs.get(catalogKey(target));
      return total + (catalog ? catalogSize(catalog, target) : 0);
    }, 0);
    const sitemapCount = Math.max(1, Math.ceil(totalUrls / URLS_PER_SITEMAP));

    return Array.from({ length: sitemapCount }, (_, id) => ({ id }));
  } catch {
    // API may be unavailable at build time. Return a single sitemap chunk that
    // will be populated on demand when the API recovers.
    return [{ id: 0 }];
  }
}

export default async function sitemap(props: {
  id: Promise<string>;
}): Promise<MetadataRoute.Sitemap> {
  const id = Number(await props.id);
  if (!Number.isSafeInteger(id) || id < 0) return [];

  const baseUrl = resolveBaseUrl();
  if (!baseUrl) return [];

  let countryLocales: CountryLocale[];
  let contentDefaultLocale: SupportedLocale | undefined;
  let catalogs: Map<string, LocaleCatalog>;

  try {
    ({ countryLocales, contentDefaultLocale } = await resolveCountryLocales());
    catalogs = await resolveLocaleCatalogs(countryLocales);
  } catch (error) {
    console.error("Sitemap generation failed: API unavailable.", error);
    return [];
  }

  const chunkStart = id * URLS_PER_SITEMAP;
  const chunkEnd = chunkStart + URLS_PER_SITEMAP;
  const entries: MetadataRoute.Sitemap = [];
  const pageCaches: PageCaches = {
    products: new Map(),
    categories: new Map(),
    fallbackFingerprints: new Map(),
  };
  let targetStart = 0;

  for (const target of countryLocales) {
    const catalog = catalogs.get(catalogKey(target));
    if (!catalog) continue;

    const targetEnd = targetStart + catalogSize(catalog, target);
    if (targetEnd <= chunkStart) {
      targetStart = targetEnd;
      continue;
    }
    if (targetStart >= chunkEnd) break;

    const basePath = `${baseUrl}/${target.country}/${target.locale}`;
    const staticPaths = staticPathsForTarget(target);
    appendStaticEntries(
      entries,
      basePath,
      staticPaths,
      targetStart,
      chunkStart,
      chunkEnd,
    );

    const productStart = targetStart + staticPaths.length;
    const productEnd = productStart + catalog.productCount;
    const categoryStart = productEnd;
    const categoryEnd = categoryStart + catalog.categoryCount;

    const productRange = intersectRange(
      productStart,
      productEnd,
      chunkStart,
      chunkEnd,
    );
    const categoryRange = intersectRange(
      categoryStart,
      categoryEnd,
      chunkStart,
      chunkEnd,
    );

    const [products, categories] = await Promise.allSettled([
      productRange
        ? fetchProductRange(
            catalog,
            productRange.start - productStart,
            productRange.end - productStart,
            pageCaches,
          )
        : Promise.resolve([]),
      categoryRange
        ? fetchCategoryRange(
            catalog,
            categoryRange.start - categoryStart,
            categoryRange.end - categoryStart,
            pageCaches,
          )
        : Promise.resolve([]),
    ]);

    const [canonicalProducts, canonicalCategories] = await Promise.all([
      products.status === "fulfilled"
        ? filterCanonicalResources(
            products.value,
            "products",
            catalog,
            contentDefaultLocale,
            pageCaches,
          )
        : Promise.resolve([]),
      categories.status === "fulfilled"
        ? filterCanonicalResources(
            categories.value,
            "categories",
            catalog,
            contentDefaultLocale,
            pageCaches,
          )
        : Promise.resolve([]),
    ]);

    if (products.status === "fulfilled") {
      appendProductEntries(entries, basePath, canonicalProducts);
    } else {
      console.error(
        `Sitemap: skipping products for ${target.country}/${target.locale}.`,
        products.reason,
      );
    }
    if (categories.status === "fulfilled") {
      appendCategoryEntries(entries, basePath, canonicalCategories);
    } else {
      console.error(
        `Sitemap: skipping categories for ${target.country}/${target.locale}.`,
        categories.reason,
      );
    }

    targetStart = targetEnd;
  }

  return entries;
}

function resolveBaseUrl(): string | undefined {
  const candidate = (getStoreUrl() || "").replace(/\/$/, "");

  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new Error(`Unsupported protocol: ${parsed.protocol}`);
    }
    return parsed.origin + parsed.pathname.replace(/\/$/, "");
  } catch {
    console.error(
      "Sitemap generation skipped: neither NEXT_PUBLIC_SITE_URL nor " +
        "NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL is set or valid. " +
        "Sitemaps require absolute http(s) URLs.",
    );
    return undefined;
  }
}

function staticPathsForTarget(target: LocaleOptions): string[] {
  return [
    "",
    ...(isBuyingGuideRoute(target.country, target.locale)
      ? ["/guias", ...BUYING_GUIDES.map((guide) => `/guias/${guide.slug}`)]
      : []),
  ];
}

function catalogSize(catalog: LocaleCatalog, target: LocaleOptions): number {
  return (
    staticPathsForTarget(target).length +
    catalog.productCount +
    catalog.categoryCount
  );
}

function intersectRange(
  rangeStart: number,
  rangeEnd: number,
  chunkStart: number,
  chunkEnd: number,
): { start: number; end: number } | undefined {
  const start = Math.max(rangeStart, chunkStart);
  const end = Math.min(rangeEnd, chunkEnd);
  return start < end ? { start, end } : undefined;
}

function appendStaticEntries(
  entries: MetadataRoute.Sitemap,
  basePath: string,
  paths: string[],
  targetStart: number,
  chunkStart: number,
  chunkEnd: number,
): void {
  const staticEntries: MetadataRoute.Sitemap = paths.map((path) => ({
    url: `${basePath}${path}`,
    changeFrequency: path ? "monthly" : "daily",
    priority: path ? 0.5 : 1,
  }));

  for (const [offset, entry] of staticEntries.entries()) {
    const position = targetStart + offset;
    if (position >= chunkStart && position < chunkEnd) entries.push(entry);
  }
}

function appendProductEntries(
  entries: MetadataRoute.Sitemap,
  basePath: string,
  products: SitemapProduct[],
): void {
  for (const product of products) {
    entries.push({
      url: `${basePath}/products/${product.slug}`,
      ...(product.updated_at
        ? { lastModified: new Date(product.updated_at) }
        : {}),
      changeFrequency: "weekly",
      priority: 0.6,
      ...(product.media && product.media.length > 0
        ? {
            images: product.media
              .map((image) => image.original_url || image.large_url)
              .filter((url: string | null): url is string => url != null),
          }
        : {}),
    });
  }
}

function appendCategoryEntries(
  entries: MetadataRoute.Sitemap,
  basePath: string,
  categories: SitemapCategory[],
): void {
  for (const category of categories) {
    entries.push({
      url: `${basePath}/c/${category.permalink}`,
      ...(category.updated_at
        ? { lastModified: new Date(category.updated_at) }
        : {}),
      changeFrequency: "weekly",
      priority: 0.5,
    });
  }
}

/** Resolve every valid country/locale URL exposed by configured Markets. */
async function resolveCountryLocales(): Promise<{
  countryLocales: CountryLocale[];
  contentDefaultLocale: SupportedLocale | undefined;
}> {
  const localeOptions = getDefaultLocaleOptions();
  const markets = await getSitemapMarkets(localeOptions);
  const targets = getMarketLocaleTargets(markets);

  const countryLocales =
    targets.length > 0
      ? targets
      : [
          {
            marketId: "default",
            country: localeOptions.country,
            locale:
              resolveSupportedLocale(localeOptions.locale) ?? DEFAULT_LOCALE,
          },
        ];
  const defaultMarket = markets.find((market) => market.default) ?? markets[0];
  return {
    countryLocales,
    // Match metadata's detection of Spree's untranslated Store-locale fallback.
    contentDefaultLocale: resolveSupportedLocale(defaultMarket?.default_locale),
  };
}

/** Compare stable IDs using batch payloads, never one request per resource. */
async function filterCanonicalResources<
  T extends SitemapProduct | SitemapCategory,
>(
  resources: T[],
  resource: "products" | "categories",
  catalog: LocaleCatalog,
  contentDefaultLocale: SupportedLocale | undefined,
  pageCaches: PageCaches,
): Promise<T[]> {
  if (
    !resources.length ||
    !contentDefaultLocale ||
    catalog.locale === contentDefaultLocale
  ) {
    return resources;
  }

  const fallbackTarget = { ...catalog, locale: contentDefaultLocale };
  const key = `${catalogKey(fallbackTarget)}:${resource}`;
  let fingerprints = pageCaches.fallbackFingerprints.get(key);
  if (!fingerprints) {
    fingerprints = getSitemapFallbackFingerprints(resource, catalog.marketId, {
      country: catalog.country,
      locale: contentDefaultLocale,
    });
    pageCaches.fallbackFingerprints.set(key, fingerprints);
  }

  try {
    const fallbackById = await fingerprints;
    return resources.filter(
      (item) => fallbackById[item.id] !== hashSitemapResource(item),
    );
  } catch (error) {
    // A failed comparison cannot safely advertise untranslated duplicate URLs.
    // Keep the other resources/locales available and retry next request.
    console.error(
      `Sitemap: cannot verify ${resource} translations for ${catalog.country}/${catalog.locale}.`,
      error,
    );
    return [];
  }
}

async function buildLocaleCatalog(
  target: CountryLocale,
): Promise<LocaleCatalog> {
  const localeOptions = { locale: target.locale, country: target.country };
  const [productCount, categoryCount] = await Promise.all([
    getSitemapResourceCount("products", target.marketId, localeOptions),
    getSitemapResourceCount("categories", target.marketId, localeOptions),
  ]);

  if (
    productCount > MAX_FETCHABLE_ITEMS ||
    categoryCount > MAX_FETCHABLE_ITEMS
  ) {
    console.warn(
      `Sitemap: catalog exceeds the ${MAX_FETCHABLE_ITEMS}-item pagination limit for ${target.country}/${target.locale}.`,
    );
  }

  return {
    marketId: target.marketId,
    ...localeOptions,
    productCount: Math.min(productCount, MAX_FETCHABLE_ITEMS),
    categoryCount: Math.min(categoryCount, MAX_FETCHABLE_ITEMS),
  };
}

async function fetchProductRange(
  catalog: LocaleCatalog,
  start: number,
  end: number,
  pageCaches: PageCaches,
): Promise<SitemapProduct[]> {
  return fetchItemRange(start, end, (page) =>
    getCachedProductPage(catalog, page, pageCaches.products),
  );
}

async function fetchCategoryRange(
  catalog: LocaleCatalog,
  start: number,
  end: number,
  pageCaches: PageCaches,
): Promise<SitemapCategory[]> {
  return fetchItemRange(start, end, (page) =>
    getCachedCategoryPage(catalog, page, pageCaches.categories),
  );
}

async function fetchItemRange<T>(
  start: number,
  end: number,
  loadPage: (page: number) => Promise<T[]>,
): Promise<T[]> {
  if (start >= end) return [];

  const firstPage = Math.floor(start / ITEMS_PER_PAGE) + 1;
  const lastPage = Math.ceil(end / ITEMS_PER_PAGE);
  const pages = Array.from(
    { length: lastPage - firstPage + 1 },
    (_, index) => firstPage + index,
  );
  const items: T[] = [];

  for (
    let offset = 0;
    offset < pages.length;
    offset += MAX_CONCURRENT_PAGE_REQUESTS
  ) {
    const batch = pages.slice(offset, offset + MAX_CONCURRENT_PAGE_REQUESTS);
    const results = await Promise.all(batch.map(loadPage));
    for (const result of results) items.push(...result);
  }

  const loadedRangeStart = (firstPage - 1) * ITEMS_PER_PAGE;
  return items.slice(start - loadedRangeStart, end - loadedRangeStart);
}

function getCachedProductPage(
  catalog: LocaleCatalog,
  page: number,
  cache: PageCaches["products"],
): Promise<SitemapProduct[]> {
  const key = `${catalogKey(catalog)}:${page}`;
  let cached = cache.get(key);
  if (!cached) {
    cached = getSitemapProductPage(catalog.marketId, page, ITEMS_PER_PAGE, {
      locale: catalog.locale,
      country: catalog.country,
    }).catch((error) => {
      cache.delete(key);
      throw error;
    });
    cache.set(key, cached);
  }
  return cached;
}

function getCachedCategoryPage(
  catalog: LocaleCatalog,
  page: number,
  cache: PageCaches["categories"],
): Promise<SitemapCategory[]> {
  const key = `${catalogKey(catalog)}:${page}`;
  let cached = cache.get(key);
  if (!cached) {
    cached = getSitemapCategoryPage(catalog.marketId, page, ITEMS_PER_PAGE, {
      locale: catalog.locale,
      country: catalog.country,
    }).catch((error) => {
      cache.delete(key);
      throw error;
    });
    cache.set(key, cached);
  }
  return cached;
}
