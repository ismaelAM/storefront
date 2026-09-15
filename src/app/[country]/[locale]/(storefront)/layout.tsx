import type { CSSProperties } from "react";
import type { Category } from "@spree/sdk";
import Link from "next/link";
import { connection } from "next/server";
import { cache, Suspense } from "react";
import { Footer, FooterCategoryLinks } from "@/components/layout/Footer";
import { Header, HeaderMobileMenu } from "@/components/layout/Header";
import { getCategories } from "@/lib/data/categories";
import { getSiteAppearance } from "@/lib/puck/get-site-appearance";
import { getSitePageData } from "@/lib/puck/get-site-page-data";

interface StorefrontLayoutProps { children: React.ReactNode; params: Promise<{ country: string; locale: string }> }
interface StorefrontNavigationProps { basePath: string; country: string; locale: string }
interface NavigationItem { categoryPermalink: string; labelOverride: string; visible: boolean }

const EMPTY_CATEGORIES: Category[] = [];

function MobileNavigationFallback() { return <div aria-hidden="true" className="size-10 animate-pulse rounded-md bg-gray-100 motion-reduce:animate-none" />; }
function FooterCategoryLinksFallback() { return <li aria-hidden="true"><span className="block h-4 w-24 animate-pulse rounded bg-white/10 motion-reduce:animate-none" /></li>; }

const getRootCategories = cache(async (country: string, locale: string) => {
  await connection();
  return getCategories({ depth_eq: 0, expand: ["children.children"] }, { country, locale })
    .then((res) => res.data).catch((error) => { console.error("StorefrontLayout: failed to load categories", error); return EMPTY_CATEGORIES; });
});

function flattenCategories(categories: Category[], output: Category[] = []) {
  for (const category of categories) {
    output.push(category);
    if (category.children?.length) flattenCategories(category.children, output);
  }
  return output;
}

const getNavigationCategories = cache(async (country: string, locale: string) => {
  const categories = await getRootCategories(country, locale);
  const fallback: NavigationItem[] = categories.map((category) => ({ categoryPermalink: category.permalink, labelOverride: "", visible: true }));
  const data = await getSitePageData("navigation", { content: [{ type: "Navigation", props: { id: "navigation", items: fallback } }], root: {} });
  const props = data.content.find((item) => item.type === "Navigation")?.props as { items?: NavigationItem[] } | undefined;
  const items = props?.items?.filter((item) => item.visible && item.categoryPermalink) ?? fallback;
  const byPermalink = new Map(flattenCategories(categories).map((category) => [category.permalink, category]));
  const configuredCategories = items.flatMap((item) => {
    const category = byPermalink.get(item.categoryPermalink);
    if (!category) return [];
    return [{ ...category, ...(item.labelOverride ? { name: item.labelOverride } : {}) }];
  });

  return configuredCategories.length > 0 ? configuredCategories : categories;
});

function CategoryLinks({ categories, basePath }: { categories: Category[]; basePath: string }) {
  return <ul>{categories.map((category) => <li key={category.id}><Link href={`${basePath}/c/${category.permalink}`}>{category.name}</Link>{category.children && category.children.length > 0 && <CategoryLinks categories={category.children} basePath={basePath} />}</li>)}</ul>;
}

async function StorefrontMobileNavigation({ basePath, country, locale }: StorefrontNavigationProps) {
  const rootCategories = await getNavigationCategories(country, locale);
  return <HeaderMobileMenu rootCategories={rootCategories} basePath={basePath} />;
}

async function StorefrontCategoryNavigation({ basePath, country, locale }: StorefrontNavigationProps) {
  const rootCategories = await getNavigationCategories(country, locale);
  if (rootCategories.length === 0) return null;
  return <nav aria-label="Category navigation" className="sr-only"><CategoryLinks categories={rootCategories} basePath={basePath} /></nav>;
}

async function StorefrontFooterCategoryLinks({ basePath, country, locale }: StorefrontNavigationProps) {
  const rootCategories = await getRootCategories(country, locale);
  return <FooterCategoryLinks rootCategories={rootCategories} basePath={basePath} />;
}

export default async function StorefrontLayout({ children, params }: StorefrontLayoutProps) {
  const { country, locale } = await params;
  const basePath = `/${country}/${locale}`;
  const appearance = await getSiteAppearance();
  const themeStyle = {
    backgroundColor: appearance.pageBackground,
    "--primary": appearance.accentColor,
  } as CSSProperties;

  return (
    <div style={themeStyle}>
      <Header appearance={appearance} basePath={basePath} locale={locale as Locale} mobileNavigation={<Suspense fallback={<MobileNavigationFallback />}><StorefrontMobileNavigation basePath={basePath} country={country} locale={locale} /></Suspense>} />
      <Suspense fallback={null}><StorefrontCategoryNavigation basePath={basePath} country={country} locale={locale} /></Suspense>
      <main className="flex-1">{children}</main>
      <Footer appearance={appearance} basePath={basePath} locale={locale as Locale} categoryLinks={<Suspense fallback={<FooterCategoryLinksFallback />}><StorefrontFooterCategoryLinks basePath={basePath} country={country} locale={locale} /></Suspense>} />
    </div>
  );
}
