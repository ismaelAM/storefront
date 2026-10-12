import type { Metadata } from "next";
import { headers } from "next/headers";
import {
  findMarketForCountry,
  getDefaultMarketLocaleTarget,
  getMarketLocales,
} from "@/i18n/markets";
import { getMarkets } from "@/lib/data/markets";
import { validateMetadataRoute } from "@/lib/metadata/validate-route";
import { normalizeOpenGraphLocale, SOCIAL_IMAGE_PATH } from "@/lib/seo";
import {
  getStoreMetaDescription,
  getStoreName,
  getStoreSeoTitle,
  getStoreUrl,
} from "@/lib/store";

function getPathSuffix(
  pathname: string | null,
  country: string,
  locale: string,
): string {
  if (!pathname) return "";
  const prefix = `/${country.toLowerCase()}/${locale.toLowerCase()}`;
  if (pathname.toLowerCase().startsWith(prefix)) {
    return pathname.slice(prefix.length) || "";
  }

  const match = pathname.match(
    /^\/[a-z]{2}\/[a-z]{2,3}(?:-[a-z0-9]{2,8})*(\/.*)?$/i,
  );
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
    const markets = await getMarkets({ country, locale }).then(
      (res) => res.data,
    );
    const currentMarket = findMarketForCountry(markets, country);

    if (!currentMarket) return undefined;

    const languages: Record<string, string> = {};
    for (const marketLocale of getMarketLocales(currentMarket)) {
      languages[marketLocale] =
        `${base}/${country.toLowerCase()}/${marketLocale}${suffix}`;
    }

    const defaultTarget = getDefaultMarketLocaleTarget(markets);
    if (defaultTarget) {
      languages["x-default"] =
        `${base}/${defaultTarget.country}/${defaultTarget.locale}${suffix}`;
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
  const googleVerification = process.env.GOOGLE_SITE_VERIFICATION?.trim();
  const socialImage = {
    url: SOCIAL_IMAGE_PATH,
    width: 1200,
    height: 630,
    alt: getStoreName(),
  };

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
      template: `%s | ${getStoreName()}`,
      default: storeName,
    },
    description: metaDescription,
    ...(metaKeywords ? { keywords: metaKeywords } : {}),
    ...(googleVerification
      ? { verification: { google: googleVerification } }
      : {}),
    robots: { googleBot: { "max-image-preview": "large" } },
    icons: {
      icon: [{ url: "/bison-icon.png", sizes: "192x192", type: "image/png" }],
      apple: [
        { url: "/bison-apple-icon.png", sizes: "180x180", type: "image/png" },
      ],
    },
    openGraph: {
      siteName: getStoreName(),
      locale: normalizeOpenGraphLocale(locale, country),
      type: "website",
      images: [socialImage],
    },
    twitter: {
      card: "summary_large_image",
      images: [socialImage],
      ...(twitter
        ? {
            site: twitter.startsWith("@") ? twitter : `@${twitter}`,
          }
        : {}),
    },
  };
}
