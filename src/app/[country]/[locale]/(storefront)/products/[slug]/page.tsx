import type { Data } from "@puckeditor/core";
import type { Category } from "@spree/sdk";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Breadcrumbs } from "@/components/navigation/Breadcrumbs";
import { ProductPuckRenderer } from "@/components/puck/ProductPuckRenderer";
import { JsonLd } from "@/components/seo/JsonLd";
import { getLegacyGroupedSpreeProductId } from "@/lib/catalog/legacy-product";
import {
  getCachedCategory,
  getCachedProduct,
  PRODUCT_PAGE_EXPAND,
} from "@/lib/data/cached";
import { generateProductMetadata } from "@/lib/metadata/product";
import { getProductPageData } from "@/lib/puck/get-product-data";
import {
  buildBreadcrumbJsonLd,
  buildCanonicalUrl,
  buildProductJsonLd,
  buildProductShortDescription,
} from "@/lib/seo";
import { getStoreUrl } from "@/lib/store";
import { legacyGroupedProductSlug } from "@/lib/utils/product-slug";
import { ProductDetails } from "./ProductDetails";

interface ProductPageProps {
  params: Promise<{
    country: string;
    locale: string;
    slug: string;
  }>;
  searchParams: Promise<{
    category_id?: string;
  }>;
}

export async function generateMetadata({
  params,
}: ProductPageProps): Promise<Metadata> {
  const { country, locale, slug } = await params;
  return generateProductMetadata({ country, locale, slug });
}

function isSpreeNotFound(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    (error as { status?: unknown }).status === 404
  );
}

function findBreadcrumbCategory(
  categories: Category[],
  categoryId?: string,
): Category | undefined {
  if (categories.length === 0) return undefined;
  if (categoryId) {
    const match = categories.find((c) => c.id === categoryId);
    if (match) return match;
  }
  return categories[0];
}

export default async function ProductPage({
  params,
  searchParams,
}: ProductPageProps) {
  const { country, locale, slug } = await params;
  const { category_id } = await searchParams;
  const basePath = `/${country}/${locale}`;

  let product;
  try {
    product = await getCachedProduct(slug, PRODUCT_PAGE_EXPAND);
  } catch (error) {
    if (!isSpreeNotFound(error)) throw error;

    const groupedSlug = legacyGroupedProductSlug(slug);
    let replacementSlug: string | null = null;
    if (groupedSlug) {
      try {
        const replacement = await getCachedProduct(
          groupedSlug,
          PRODUCT_PAGE_EXPAND,
        );
        replacementSlug = replacement.slug;
      } catch (replacementError) {
        if (!isSpreeNotFound(replacementError)) throw replacementError;

        const replacementProductId =
          await getLegacyGroupedSpreeProductId(groupedSlug);
        if (replacementProductId) {
          try {
            const replacement = await getCachedProduct(
              replacementProductId,
              PRODUCT_PAGE_EXPAND,
            );
            replacementSlug = replacement.slug;
          } catch (replacementByIdError) {
            if (!isSpreeNotFound(replacementByIdError)) {
              throw replacementByIdError;
            }
            replacementSlug = null;
          }
        }
      }
    }
    if (replacementSlug) {
      const categoryQuery = category_id
        ? `?category_id=${encodeURIComponent(category_id)}`
        : "";
      redirect(`${basePath}/products/${replacementSlug}${categoryQuery}`);
    }
    notFound();
  }

  const storeUrl = getStoreUrl();
  const shortDescription = buildProductShortDescription(product, locale);
  const canonicalUrl = storeUrl
    ? buildCanonicalUrl(
        storeUrl,
        `/${country}/${locale}/products/${product.slug}`,
      )
    : undefined;

  let breadcrumbCategory: Category | undefined;
  if (category_id) {
    try {
      breadcrumbCategory = await getCachedCategory(category_id, ["ancestors"]);
    } catch {
      breadcrumbCategory = undefined;
    }
  } else {
    breadcrumbCategory = findBreadcrumbCategory(product.categories || []);
  }

  const fallbackData: Data = {
    content: [],
    root: {},
  };
  const productPageData = await getProductPageData(slug, fallbackData);

  return (
    <>
      {canonicalUrl && (
        <JsonLd
          data={buildProductJsonLd(product, canonicalUrl, {
            description: shortDescription,
            locale,
          })}
        />
      )}
      {breadcrumbCategory && storeUrl && (
        <JsonLd
          data={buildBreadcrumbJsonLd(breadcrumbCategory, basePath, storeUrl, {
            name: product.name,
            slug: product.slug,
          })}
        />
      )}
      <div className="container mx-auto px-4 pt-6 sm:px-6 lg:px-8">
        {breadcrumbCategory && (
          <Breadcrumbs
            category={breadcrumbCategory}
            basePath={basePath}
            productName={product.name}
            locale={locale}
          />
        )}
      </div>

      <ProductPuckRenderer data={productPageData} />
      <ProductDetails
        product={product}
        basePath={basePath}
        shortDescription={shortDescription}
      />
    </>
  );
}
