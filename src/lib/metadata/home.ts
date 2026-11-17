import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { buildHreflangLanguages } from "@/lib/metadata/alternates";
import { validateMetadataRoute } from "@/lib/metadata/validate-route";
import {
  buildCanonicalUrl,
  normalizeOpenGraphLocale,
  SOCIAL_IMAGE_PATH,
} from "@/lib/seo";
import {
  getStoreName,
  getStoreUrl,
} from "@/lib/store";

interface HomeMetadataParams {
  country: string;
  locale: string;
}

export async function generateHomeMetadata({
  country,
  locale,
}: HomeMetadataParams): Promise<Metadata> {
  validateMetadataRoute(country, locale);
  const t = await getTranslations({ locale: locale as Locale, namespace: "tcgShop" });
  const storeName = `${getStoreName()} | ${t("catalogName")}`;
  const description = t("description");
  const storeUrl = getStoreUrl();
  const canonicalUrl = storeUrl
    ? buildCanonicalUrl(storeUrl, `/${country}/${locale}`)
    : undefined;
  const languages = storeUrl
    ? await buildHreflangLanguages({
        storeUrl,
        country,
        locale,
        path: "",
      })
    : undefined;

  return {
    title: { absolute: storeName },
    description,
    ...(canonicalUrl
      ? {
          alternates: {
            canonical: canonicalUrl,
            ...(languages ? { languages } : {}),
          },
        }
      : {}),
    openGraph: {
      title: storeName,
      description,
      ...(canonicalUrl ? { url: canonicalUrl } : {}),
      type: "website",
      siteName: getStoreName(),
      locale: normalizeOpenGraphLocale(locale, country),
      images: [
        {
          url: SOCIAL_IMAGE_PATH,
          width: 1200,
          height: 630,
          alt: getStoreName(),
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: storeName,
      description,
      images: [
        {
          url: SOCIAL_IMAGE_PATH,
          width: 1200,
          height: 630,
          alt: getStoreName(),
        },
      ],
    },
  };
}
