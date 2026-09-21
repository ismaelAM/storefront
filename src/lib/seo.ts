import type { Category, Media, Product } from "@spree/sdk";
import {
  ensureProtocol,
  getStoreDescription,
  getStoreName,
  getStoreUrl,
} from "@/lib/store";

/**
 * Default social image path (stored in public/).
 * Replace public/social-image.png with your own 1200x630 OG image.
 */
export const SOCIAL_IMAGE_PATH = "/social-image.webp";

/**
 * Build a full canonical URL from a store URL and a relative path.
 */
export function buildCanonicalUrl(storeUrl: string, path: string): string {
  const base = ensureProtocol(storeUrl).replace(/\/$/, "");
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  return `${base}${cleanPath}`;
}

/**
 * Strip HTML tags from a string.
 */
export function stripHtml(html: string): string {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;|&#34;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function truncateAtWord(value: string, maxLength = 160): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) return normalized;
  const candidate = normalized.slice(0, maxLength - 1);
  const wordBoundary = candidate.lastIndexOf(" ");
  return `${candidate.slice(0, wordBoundary > 80 ? wordBoundary : undefined).trim()}…`;
}

const PRODUCT_DESCRIPTION_TEMPLATES: Record<
  string,
  (name: string, store: string) => string
> = {
  de: (name, store) =>
    `${name} bei ${store}. Preis, Verfügbarkeit, Varianten und Kaufoptionen ansehen.`,
  en: (name, store) =>
    `Shop ${name} at ${store}. Check price, availability, variants, and purchase options.`,
  es: (name, store) =>
    `${name} en ${store}. Consulta precio, disponibilidad, variantes y opciones de compra.`,
  fr: (name, store) =>
    `${name} chez ${store}. Consultez le prix, la disponibilité, les variantes et les options d'achat.`,
  pl: (name, store) =>
    `${name} w ${store}. Sprawdź cenę, dostępność, warianty i opcje zakupu.`,
  pt: (name, store) =>
    `${name} na ${store}. Consulte o preço, a disponibilidade, as variantes e as opções de compra.`,
};

/**
 * Returns a concise, visible description using Spree content first. The
 * localized fallback only states facts that are present on every product page.
 */
export function buildProductShortDescription(
  product: Pick<
    Product,
    "name" | "meta_description" | "description" | "description_html"
  >,
  locale: string,
): string {
  const authored =
    product.meta_description || product.description || product.description_html;
  if (authored) {
    const plainText = stripHtml(authored);
    if (plainText) return truncateAtWord(plainText);
  }

  const language = locale.toLowerCase().split(/[-_]/)[0];
  const template =
    PRODUCT_DESCRIPTION_TEMPLATES[language] ?? PRODUCT_DESCRIPTION_TEMPLATES.en;
  return truncateAtWord(template(product.name, getStoreName()));
}

function customFieldText(
  product: Product,
  aliases: string[],
): string | undefined {
  for (const field of product.custom_fields ?? []) {
    const key = String(field.key ?? "");
    const identifiers = [key, key.split(/[._-]/).at(-1), field.label]
      .map((value) =>
        String(value ?? "")
          .toLowerCase()
          .replace(/[._-]+/g, " ")
          .replace(/\s+/g, " ")
          .trim(),
      )
      .filter(Boolean);
    if (!identifiers.some((identifier) => aliases.includes(identifier))) {
      continue;
    }
    if (typeof field.value === "string" && field.value.trim()) {
      return field.value.trim();
    }
    if (typeof field.value === "number" && Number.isFinite(field.value)) {
      return String(field.value);
    }
  }
  return undefined;
}

function validGtin(value: string): boolean {
  if (![8, 12, 13, 14].includes(value.length) || !/^\d+$/.test(value)) {
    return false;
  }
  const digits = value.split("").map(Number);
  const checkDigit = digits.pop();
  if (checkDigit === undefined) return false;
  const sum = digits
    .reverse()
    .reduce(
      (total, digit, index) => total + digit * (index % 2 === 0 ? 3 : 1),
      0,
    );
  return (10 - (sum % 10)) % 10 === checkDigit;
}

function productIdentifiers(product: Product): Record<string, string> {
  const identifiers: Record<string, string> = {};
  const customGtin = customFieldText(product, ["gtin", "ean", "isbn"]);
  const sku = product.default_variant?.sku?.trim();
  const gtinCandidate = (customGtin || sku || "").replace(/[^0-9]/g, "");

  if (validGtin(gtinCandidate)) {
    identifiers[`gtin${gtinCandidate.length}`] = gtinCandidate;
  }

  const mpn = customFieldText(product, [
    "mpn",
    "manufacturer sku",
    "manufacturer reference",
    "referencia fabricante",
  ]);
  if (mpn) identifiers.mpn = mpn;
  return identifiers;
}

function schemaAvailability(product: {
  preorder?: boolean;
  purchasable?: boolean;
  in_stock?: boolean;
  backorderable?: boolean;
}): string {
  if (product.preorder) return "https://schema.org/PreOrder";
  if (product.purchasable && product.in_stock) {
    return "https://schema.org/InStock";
  }
  if (product.backorderable) return "https://schema.org/BackOrder";
  return "https://schema.org/OutOfStock";
}

function buildOffer(
  source: {
    sku?: string | null;
    price?: Product["price"];
    preorder?: boolean;
    purchasable?: boolean;
    in_stock?: boolean;
    backorderable?: boolean;
  },
  canonicalUrl: string,
): Record<string, unknown> | null {
  if (!source.price?.amount || !source.price.currency) return null;
  const storeUrl = getStoreUrl();
  return {
    "@type": "Offer",
    url: canonicalUrl,
    priceCurrency: source.price.currency,
    price: source.price.amount,
    availability: schemaAvailability(source),
    itemCondition: "https://schema.org/NewCondition",
    ...(source.sku ? { sku: source.sku } : {}),
    seller: {
      "@type": "Organization",
      ...(storeUrl
        ? { "@id": `${storeUrl.replace(/\/$/, "")}#organization` }
        : {}),
      name: getStoreName(),
    },
  };
}

/**
 * Build JSON-LD Product schema.
 * https://schema.org/Product
 */
export function buildProductJsonLd(
  product: Product,
  canonicalUrl: string,
  options: { description?: string; locale?: string } = {},
): Record<string, unknown> {
  const description =
    options.description ??
    buildProductShortDescription(product, options.locale ?? "en");
  const schema: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Product",
    "@id": `${canonicalUrl}#product`,
    name: product.name,
    url: canonicalUrl,
    description,
    ...productIdentifiers(product),
  };

  if (product.default_variant?.sku) {
    schema.sku = product.default_variant.sku;
  }

  const brand = customFieldText(product, [
    "brand",
    "marca",
    "manufacturer",
    "fabricante",
  ]);
  if (brand) schema.brand = { "@type": "Brand", name: brand };

  const category = product.categories?.find((entry) => !entry.is_root);
  if (category) schema.category = category.name;

  const imageUrls = (product.media || [])
    .map((img: Media) => img.original_url || img.large_url)
    .filter(Boolean);
  // Fall back to thumbnail_url if no media from expand
  if (imageUrls.length === 0 && product.thumbnail_url) {
    imageUrls.push(product.thumbnail_url);
  }
  if (imageUrls.length > 0) {
    schema.image = imageUrls;
  }

  const variantOffers = (product.variants ?? [])
    .map((variant) => buildOffer(variant, canonicalUrl))
    .filter((offer): offer is Record<string, unknown> => offer !== null);
  const defaultOffer = buildOffer(
    product.default_variant ?? product,
    canonicalUrl,
  );
  const offers = variantOffers.length > 0 ? variantOffers : defaultOffer;
  if (offers) schema.offers = offers;

  return schema;
}

/** Build WebSite markup for Google site-name and publisher understanding. */
export function buildWebSiteJsonLd(
  canonicalUrl: string,
  locale: string,
): Record<string, unknown> {
  const storeUrl = getStoreUrl()?.replace(/\/$/, "") ?? canonicalUrl;
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${storeUrl}#website`,
    url: canonicalUrl,
    name: getStoreName(),
    description: getStoreDescription(),
    inLanguage: locale,
    publisher: {
      "@id": `${storeUrl}#organization`,
    },
  };
}

/**
 * Build JSON-LD CollectionPage schema for a category listing.
 * https://schema.org/CollectionPage
 */
export function buildCategoryJsonLd(
  category: Category,
  canonicalUrl: string,
): Record<string, unknown> {
  const schema: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: category.name,
    url: canonicalUrl,
  };

  const description = category.description
    ? stripHtml(category.description)
    : null;
  if (description) schema.description = description;

  if (category.image_url) {
    schema.image = [category.image_url];
  }

  return schema;
}

/**
 * Build JSON-LD BreadcrumbList schema from a category with ancestors.
 * https://schema.org/BreadcrumbList
 */
export function buildBreadcrumbJsonLd(
  category: Category,
  basePath: string,
  storeUrl: string,
  product?: { name: string; slug: string },
): Record<string, unknown> {
  const items: Array<{ name: string; url: string }> = [
    { name: "Home", url: buildCanonicalUrl(storeUrl, basePath) },
  ];

  if (category.ancestors) {
    for (const ancestor of category.ancestors) {
      if (!ancestor.is_root) {
        items.push({
          name: ancestor.name,
          url: buildCanonicalUrl(
            storeUrl,
            `${basePath}/c/${ancestor.permalink}`,
          ),
        });
      }
    }
  }

  items.push({
    name: category.name,
    url: buildCanonicalUrl(storeUrl, `${basePath}/c/${category.permalink}`),
  });

  if (product) {
    items.push({
      name: product.name,
      url: buildCanonicalUrl(storeUrl, `${basePath}/products/${product.slug}`),
    });
  }

  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: item.url,
    })),
  };
}

/**
 * Build JSON-LD Organization schema from environment variables.
 * https://schema.org/Organization
 */
export function buildOrganizationJsonLd(): Record<string, unknown> {
  const storeName = getStoreName();
  const storeUrl = getStoreUrl();
  const logoUrl = process.env.STORE_LOGO_URL;
  const facebook = process.env.STORE_FACEBOOK;
  const twitter = process.env.STORE_TWITTER;
  const instagram = process.env.STORE_INSTAGRAM;
  const supportEmail = process.env.STORE_SUPPORT_EMAIL;

  const schema: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Organization",
    ...(storeUrl
      ? { "@id": `${storeUrl.replace(/\/$/, "")}#organization` }
      : {}),
    name: storeName,
    description: getStoreDescription(),
    ...(storeUrl ? { url: storeUrl } : {}),
  };

  if (logoUrl) {
    schema.logo = logoUrl;
  }

  const sameAs: string[] = [];
  if (facebook) sameAs.push(facebook);
  if (twitter) {
    sameAs.push(
      twitter.startsWith("http")
        ? twitter
        : `https://twitter.com/${twitter.replace("@", "")}`,
    );
  }
  if (instagram) {
    sameAs.push(
      instagram.startsWith("http")
        ? instagram
        : `https://instagram.com/${instagram.replace("@", "")}`,
    );
  }
  if (sameAs.length > 0) {
    schema.sameAs = sameAs;
  }

  if (supportEmail) {
    schema.contactPoint = {
      "@type": "ContactPoint",
      email: supportEmail,
      contactType: "customer service",
    };
  }

  return schema;
}
