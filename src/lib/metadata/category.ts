import type { Metadata } from "next";
import { getCachedCategory } from "@/lib/data/cached";
import { cachedGetCategory } from "@/lib/data/categories";
import {
  buildLocalizedAlternates,
  translationFingerprint,
} from "@/lib/metadata/alternates";
import { normalizeOpenGraphLocale, SOCIAL_IMAGE_PATH } from "@/lib/seo";
import { getStoreName, getStoreUrl } from "@/lib/store";

export interface CategoryMetadataParams {
  country: string;
  locale: string;
  permalink: string[];
}

export async function generateCategoryMetadata({
  country,
  locale,
  permalink,
}: CategoryMetadataParams): Promise<Metadata> {
  const fullPermalink = permalink.join("/");

  let category;
  try {
    category = await getCachedCategory(fullPermalink, [
      "ancestors",
      "children",
    ]);
  } catch {
    return { title: "Category Not Found" };
  }

  const title = category.meta_title || category.name;
  const description =
    category.meta_description ||
    category.description ||
    categoryDescriptionFallback(category.name, locale);
  const socialImage = category.image_url
    ? { url: category.image_url, alt: category.name }
    : { url: SOCIAL_IMAGE_PATH, width: 1200, height: 630, alt: getStoreName() };

  const storeUrl = getStoreUrl();
  const localizedAlternates = storeUrl
    ? await buildLocalizedAlternates({
        storeUrl,
        country,
        locale,
        path: `/c/${category.permalink}`,
        currentResourceFingerprint: categoryTranslationFingerprint(category),
        resolvePath: async (target) => {
          const localizedCategory = await cachedGetCategory(
            category.id,
            undefined,
            { country: target.country, locale: target.locale },
          );
          return {
            path: `/c/${localizedCategory.permalink}`,
            fingerprint: categoryTranslationFingerprint(localizedCategory),
          };
        },
      })
    : undefined;

  return {
    title,
    description,
    ...(category.meta_keywords ? { keywords: category.meta_keywords } : {}),
    ...(localizedAlternates
      ? {
          alternates: {
            canonical: localizedAlternates.canonical,
            languages: localizedAlternates.languages,
          },
        }
      : {}),
    openGraph: {
      title,
      description,
      siteName: getStoreName(),
      locale: normalizeOpenGraphLocale(locale, country),
      ...(localizedAlternates ? { url: localizedAlternates.canonical } : {}),
      type: "website",
      images: [socialImage],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [socialImage],
    },
  };
}

function categoryDescriptionFallback(name: string, locale: string): string {
  switch (locale.toLowerCase().split(/[-_]/)[0]) {
    case "es":
      return `Explora los productos de ${name}.`;
    case "fr":
      return `Découvrez les produits de ${name}.`;
    case "pt":
      return `Explore os produtos de ${name}.`;
    case "de":
      return `Entdecke die Produkte von ${name}.`;
    case "pl":
      return `Przeglądaj produkty z kategorii ${name}.`;
    default:
      return `Browse ${name} products.`;
  }
}

function categoryTranslationFingerprint(category: {
  name: string;
  permalink: string;
  description: string;
  description_html: string;
  meta_title: string | null;
  meta_description: string | null;
  meta_keywords: string | null;
}): string {
  return translationFingerprint(
    category.name,
    category.permalink,
    category.description,
    category.description_html,
    category.meta_title,
    category.meta_description,
    category.meta_keywords,
  );
}
