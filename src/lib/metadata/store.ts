import type { Metadata } from "next";
import { headers } from "next/headers";
import {
  findMarketForCountry,
  getDefaultMarketLocaleTarget,
  getMarketLocales,
} from "@/i18n/markets";
import { getMarkets } from "@/lib/data/markets";
import { validateMetadataRoute } from "@/lib/metadata/validate-route";
import { SOCIAL_IMAGE_PATH } from "@/lib/seo";
import {
  getStoreMetaDescription,
  getStoreName,
  getStoreSeoTitle,
  getStoreUrl,
} from "@/lib/store";

function normalizeOpenGraphLocale(locale: string): string {
  const parts = locale.split(/[-_]/);
  if (parts.length < 2) return locale;
  return `${parts[0].toLowerCase()}_${parts[1].toUpperCase()}`;
}

function getPathSuffix(pathname: string | null, country: string, locale: string): string {
  if (!pathname) return "";
  const prefix = `/${country.toLowerCase()}/${locale.toLowerCase()}`;
  if (pathname.toLowerCase().startsWith(prefix)) {
    return pathname.slice(prefix.length) || "";
  }

  const match = pathname.match(/^\/[a-z]{2}\/[a-z]{2,3}(?:-[a-z0-9]{2,8})*(\/.*)?$/i);
  return match?.[1] ?? "";
}

async function buildLocaleAlternates(
  country: string,
  locale: string,
  storeUrl: string,
): Promise<NonNullable<Metadata["alternates"]> | undefined> {
  try {
    const requestHeaders = await headers();
    const pathname = requestHeaders.get("x-spree-request-pathname");
    const suffix = getPathSuffix(pathname, country, locale);
    const base = storeUrl.replace(/\/$/, "");
    const markets = await getMarkets({ country, locale }).then((res) => res.data);
    const currentMarket = findMarketForCountry(markets, country);

    if (!currentMarket) return undefined;

    const languages: Record<string, string> = {};
    for (const marketLocale of getMarketLocales(currentMarket)) {
      languages[marketLocale] = `${base}/${country.toLowerCase()}/${marketLocale}${suffix}`;
    }

    const defaultTarget = getDefaultMarketLocaleTarget(markets);
    if (defaultTarget) {
      languages["x-default"] = `${base}/${defaultTarget.country}/${defaultTarget.locale}${suffix}`;
    }

    return {
      canonical: `${base}/${country.toLowerCase()}/${locale}${suffix}`,
      languages,
    };
  } catch {
    return undefined;
  }
}

interface StoreMetadataParams {
  locale: string;
  country: string;
}

export async function generateStoreMetadata({
  locale,
  country,
}: StoreMetadataParams): Promise<Metadata> {
  validateMetadataRoute(country, locale);
  const storeName = getStoreSeoTitle();
  const storeUrl = getStoreUrl();
  const metaDescription = getStoreMetaDescription();
  const metaKeywords = process.env.STORE_META_KEYWORDS;
  const twitter = process.env.STORE_TWITTER;

  let metadataBaseSpread: Partial<{ metadataBase: URL }> = {};
  if (storeUrl) {
    try {
      metadataBaseSpread = { metadataBase: new URL(storeUrl) };
    } catch {
      metadataBaseSpread = {};
    }
  }

  const alternates = storeUrl
    ? await buildLocaleAlternates(country, locale, storeUrl)
    : undefined;

  return {
    ...metadataBaseSpread,
    ...(alternates ? { alternates } : {}),
    title: {
      template: `%s | ${storeName}`,
      default: storeName,
    },
    description: metaDescription,
    ...(metaKeywords ? { keywords: metaKeywords } : {}),
    openGraph: {
      siteName: getStoreName(),
      locale: normalizeOpenGraphLocale(locale),
      type: "website",
      images: [SOCIAL_IMAGE_PATH],
    },
    twitter: {
      card: "summary_large_image",
      ...(twitter
        ? {
            site: twitter.startsWith("@") ? twitter : `@${twitter}`,
          }
        : {}),
    },
  };
}
