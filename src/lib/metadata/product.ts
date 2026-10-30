import type { Metadata } from "next";
import { getCachedProduct, PRODUCT_METADATA_EXPAND } from "@/lib/data/cached";
import { cachedGetProduct } from "@/lib/data/products";
import {
  buildLocalizedAlternates,
  translationFingerprint,
} from "@/lib/metadata/alternates";
import {
  buildProductShortDescription,
  getProductOfferSource,
  normalizeOpenGraphLocale,
  SOCIAL_IMAGE_PATH,
  schemaAvailability,
  validOfferPrice,
} from "@/lib/seo";
import { DEFAULT_SURFACE } from "@/lib/spree";
import { getStoreName, getStoreUrl } from "@/lib/store";

interface ProductMetadataParams {
  country: string;
  locale: string;
  slug: string;
}

export async function generateProductMetadata({
  country,
  locale,
  slug,
}: ProductMetadataParams): Promise<Metadata> {
  let product;
  try {
    product = await getCachedProduct(slug, PRODUCT_METADATA_EXPAND);
  } catch (error) {
    const notFound =
      typeof error === "object" &&
      error !== null &&
      "status" in error &&
      (error as { status?: unknown }).status === 404;
    if (!notFound) throw error;
    return { title: "Product Not Found" };
  }

  const title = product.meta_title || product.name;
  const description = buildProductShortDescription(product, locale);

  const storeUrl = getStoreUrl();
  const localizedAlternates = storeUrl
    ? await buildLocalizedAlternates({
        storeUrl,
        country,
        locale,
        path: `/products/${product.slug}`,
        currentResourceFingerprint: productTranslationFingerprint(product),
        resolvePath: async (target) => {
          const localizedProduct = await cachedGetProduct(
            product.id,
            [],
            { country: target.country, locale: target.locale },
            DEFAULT_SURFACE,
          );
          if (!localizedProduct) return null;
          return {
            path: `/products/${localizedProduct.slug}`,
            fingerprint: productTranslationFingerprint(localizedProduct),
          };
        },
      })
    : undefined;

  const primaryMedia = product.primary_media;
  const ogSrc =
    primaryMedia?.og_image_url ||
    primaryMedia?.original_url ||
    product.thumbnail_url ||
    null;
  const ogImage = ogSrc
    ? {
        url: ogSrc,
        ...(primaryMedia?.og_image_url ? { width: 1200, height: 630 } : {}),
        alt: primaryMedia?.alt || product.name,
      }
    : { url: SOCIAL_IMAGE_PATH, width: 1200, height: 630, alt: getStoreName() };
  const offerSource = getProductOfferSource(product);
  const price = validOfferPrice(offerSource.price) ? offerSource.price : null;
  const availability = {
    "https://schema.org/PreOrder": "preorder",
    "https://schema.org/InStock": "in stock",
    "https://schema.org/BackOrder": "backorder",
    "https://schema.org/OutOfStock": "out of stock",
  }[schemaAvailability(offerSource)];

  return {
    title,
    description,
    ...(product.meta_keywords ? { keywords: product.meta_keywords } : {}),
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
      ...(ogImage ? { images: [ogImage] } : {}),
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      ...(ogImage ? { images: [ogImage] } : {}),
    },
    other: {
      ...(price
        ? {
            "product:price:amount": price.amount,
            "product:price:currency": price.currency,
          }
        : {}),
      "product:availability": availability,
      ...("sku" in offerSource && offerSource.sku
        ? { "product:retailer_item_id": offerSource.sku }
        : {}),
    },
  };
}

function productTranslationFingerprint(product: {
  name: string;
  slug: string;
  description: string | null;
  description_html: string | null;
  meta_title: string | null;
  meta_description: string | null;
  meta_keywords: string | null;
}): string {
  return translationFingerprint(
    product.name,
    product.slug,
    product.description,
    product.description_html,
    product.meta_title,
    product.meta_description,
    product.meta_keywords,
  );
}
