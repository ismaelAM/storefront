import { notFound, permanentRedirect } from "next/navigation";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { readTcgFormat } from "@/lib/catalog/tcg-navigation";
import { TCG_CATALOG_TAG, TCG_FORMATS, TCG_FORMAT_TAG_PREFIX, tcgGameForPath } from "../../../../../../../supabase/functions/_shared/tcg-shop";
import type { Metadata } from "next";
import { CategoryPuckRenderer } from "@/components/puck/CategoryPuckRenderer";
import { JsonLd } from "@/components/seo/JsonLd";
import { ProductListing } from "@/components/products/ProductListing";
import { getCategory, getCategoryProducts } from "@/lib/data/categories";
import { resolveCurrency } from "@/lib/data/markets";
import { getCategoryPageData } from "@/lib/puck/get-category-data";
import { getCategoryCatalogParams } from "@/lib/puck/category-catalog";
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
  if (!tcgGameForPath(permalink.join("/"))) return { robots: { index: false } };
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

  if (fullPermalink === "tcg") permanentRedirect(`${basePath}#juegos`);
  const game = tcgGameForPath(fullPermalink);
  if (!game) notFound();

  const rawFormat = rawSearchParams.format;
  const format = readTcgFormat(Array.isArray(rawFormat) ? rawFormat[0] : rawFormat);
  const formatTag = format ? TCG_FORMAT_TAG_PREFIX + format : TCG_CATALOG_TAG;
  const t = await getTranslations({ locale: locale as Locale, namespace: "tcgShop" });

  let category;
  try {
    category = await getCategory(fullPermalink, {
      expand: ["ancestors", "children"],
    });
  } catch (error) {
    if (
      typeof error !== "object" ||
      error === null ||
      !("status" in error) ||
      error.status !== 404
    ) {
      throw error;
    }
    notFound();
  }

  if (!category) {
    notFound();
  }

  category = {
    ...category,
    name: game[1],
    ancestors: category.ancestors?.filter((ancestor) => ancestor.permalink !== "tcg"),
  };
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
  const fallbackData = {
    content: [
      {
        type: "CategoryHero" as const,
        props: {
          id: "category-hero",
          title: game[1],
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
  const categoryCatalogParams = getCategoryCatalogParams(data);
  const categoryProducts =
    categoryCatalogParams.limit === 0
      ? { data: [] }
      : await getCategoryProducts(category.id, { ...categoryCatalogParams, tags_name_in: [formatTag] });

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
        <nav aria-label={t("allFormats")} className="mb-5 flex flex-wrap gap-2">
          {[undefined, ...TCG_FORMATS].map((option) => (
            <Link
              key={option ?? "all"}
              href={`${basePath}/c/${category.permalink}${option ? `?format=${option}` : ""}`}
              prefetch={false}
              aria-current={option === format ? "page" : undefined}
              className={option === format ? "rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground" : "rounded-full border bg-card px-4 py-2 text-sm hover:bg-secondary"}
            >
              {option ? t(option) : t("allFormats")}
            </Link>
          ))}
        </nav>
        <ProductListing
          key={format ?? "all"}
          state={listingState}
          basePath={basePath}
          currency={currency}
          locale={locale as Locale}
          listId={`category-${category.id}`}
          listName={`Category: ${category.name}`}
          categoryId={category.id}
          baseParams={{ in_category: category.id, tags_name_in: [formatTag] }}
          fetchProducts={fetchCategoryProducts}
          fetchFilters={getProductFilters}
        />
      </div>
    </div>
  );
}
