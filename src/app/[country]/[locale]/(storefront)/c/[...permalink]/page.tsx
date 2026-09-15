import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { CategoryPuckRenderer } from "@/components/puck/CategoryPuckRenderer";
import { Breadcrumbs } from "@/components/navigation/Breadcrumbs";
import { JsonLd } from "@/components/seo/JsonLd";
import { ProductListing } from "@/components/products/ProductListing";
import { getCategory, getCategoryProducts } from "@/lib/data/categories";
import { resolveCurrency } from "@/lib/data/markets";
import { getCategoryPageData } from "@/lib/puck/get-category-data";
import { getProductFilters } from "@/lib/data/products";
import { generateCategoryMetadata } from "@/lib/metadata/category";
import {
  buildBreadcrumbJsonLd,
  buildCategoryJsonLd,
  buildCanonicalUrl,
} from "@/lib/seo";
import { getStoreUrl } from "@/lib/store";
import { parseListingSearchParams } from "@/lib/utils/listing-search-params";
import { CategoryBanner } from "./CategoryBanner";

interface CategoryPageProps {
  params: Promise<{
    country: string;
    locale: string;
    permalink: string[];
  }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({
  params,
}: CategoryPageProps): Promise<Metadata> {
  const { country, locale, permalink } = await params;
  return generateCategoryMetadata({ country, locale, permalink });
}

export default async function CategoryPage({
  params,
  searchParams,
}: CategoryPageProps) {
  const { country, locale, permalink } = await params;
  const rawSearchParams = await searchParams;
  const fullPermalink = permalink.join("/");
  const basePath = `/${country}/${locale}`;

  let category;
  try {
    category = await getCategory(fullPermalink, {
      expand: ["ancestors", "children"],
    });
  } catch (error) {
    console.error("Failed to fetch category:", error);
    notFound();
  }

  if (!category) {
    notFound();
  }

  const storeUrl = getStoreUrl();
  const canonicalUrl = storeUrl
    ? buildCanonicalUrl(
        storeUrl,
        `${basePath}/c/${category.permalink}`,
      )
    : undefined;
  const currency = await resolveCurrency(country);
  const listingState = parseListingSearchParams(rawSearchParams);
  const fetchCategoryProducts = getCategoryProducts.bind(null, category.id);
  const categoryProducts = await getCategoryProducts(category.id, { limit: 8 });
  const fallbackData = {
    content: [
      {
        type: "CategoryHero" as const,
        props: {
          id: "category-hero",
          title: category.name,
          description: category.description ?? "",
          backgroundImage: category.image_url ?? "",
          backgroundColor: "#f9fafb",
          titleColor: "#111827",
          textColor: "#4b5563",
          minHeight: "medium" as const,
        },
      },
    ],
    root: {},
  };
  const data = await getCategoryPageData(fullPermalink, fallbackData);

  return (
    <div>
      {canonicalUrl && (
        <JsonLd data={buildCategoryJsonLd(category, canonicalUrl)} />
      )}
      {storeUrl && (
        <JsonLd data={buildBreadcrumbJsonLd(category, basePath, storeUrl)} />
      )}

      <CategoryPuckRenderer
        data={data}
        products={categoryProducts.data ?? []}
        basePath={basePath}
      />
      <CategoryBanner
        category={category}
        basePath={basePath}
        locale={locale}
        showHero={false}
      />

      <div className="container mx-auto px-4 pt-4 sm:px-6 lg:px-8">
        <ProductListing
          state={listingState}
          basePath={basePath}
          currency={currency}
          locale={locale as Locale}
          listId={`category-${category.id}`}
          listName={`Category: ${category.name}`}
          categoryId={category.id}
          baseParams={{ in_category: category.id }}
          fetchProducts={fetchCategoryProducts}
          fetchFilters={getProductFilters}
        />
      </div>
    </div>
  );
}
