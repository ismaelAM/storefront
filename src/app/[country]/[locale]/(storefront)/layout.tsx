import type { Category } from "@spree/sdk";
import Link from "next/link";
import { connection } from "next/server";
import { cache, Suspense } from "react";
import { Footer, FooterCategoryLinks } from "@/components/layout/Footer";
import { Header, HeaderMobileMenu } from "@/components/layout/Header";
import { getCategories } from "@/lib/data/categories";
import { getSitePageData } from "@/lib/puck/get-site-page-data";

interface StorefrontLayoutProps { children: React.ReactNode; params: Promise<{ country: string; locale: string }> }
interface StorefrontNavigationProps { basePath: string; country: string; locale: string }
interface NavigationItem { categoryPermalink: string; labelOverride: string; visible: boolean }
interface NavigationAppearance { backgroundColor: string; textColor: string; hoverBackgroundColor: string; hoverTextColor: string; width: "small" | "medium" | "large"; itemRadius: "none" | "small" | "medium" | "large"; itemSpacing: "compact" | "normal" | "large" }

const EMPTY_CATEGORIES: Category[] = [];
const DEFAULT_APPEARANCE: NavigationAppearance = { backgroundColor: "#ffffff", textColor: "#374151", hoverBackgroundColor: "#f3f4f6", hoverTextColor: "#111827", width: "medium", itemRadius: "medium", itemSpacing: "normal" };

function MobileNavigationFallback() { return <div aria-hidden="true" className="size-10 animate-pulse rounded-md bg-gray-100 motion-reduce:animate-none" />; }
function FooterCategoryLinksFallback() { return <li aria-hidden="true"><span className="block h-4 w-24 animate-pulse rounded bg-white/10 motion-reduce:animate-none" /></li>; }

const getRootCategories = cache(async (country: string, locale: string) => {
  await connection();
  return getCategories({ depth_eq: 0, expand: ["children.children"] }, { country, locale }).then((res) => res.data).catch((error) => { console.error("StorefrontLayout: failed to load categories", error); return EMPTY_CATEGORIES; });
});

function flattenCategories(categories: Category[], output: Category[] = []) {
  for (const category of categories) { output.push(category); if (category.children?.length) flattenCategories(category.children, output); }
  return output;
}

const getNavigationData = cache(async (country: string, locale: string) => {
  const categories = await getRootCategories(country, locale);
  const fallback: NavigationItem[] = categories.map((category) => ({ categoryPermalink: category.permalink, labelOverride: "", visible: true }));
  const data = await getSitePageData("navigation", { content: [{ type: "Navigation", props: { id: "navigation", ...DEFAULT_APPEARANCE, items: fallback } }], root: {} });
  const props = data.content.find((item) => item.type === "Navigation")?.props as Partial<NavigationAppearance> & { items?: NavigationItem[] } | undefined;
  const items = props?.items?.filter((item) => item.visible && item.categoryPermalink) ?? fallback;
  const appearance: NavigationAppearance = { ...DEFAULT_APPEARANCE, ...Object.fromEntries(Object.entries(DEFAULT_APPEARANCE).map(([key, value]) => [key, props?.[key as keyof NavigationAppearance] ?? value])) } as NavigationAppearance;
  const byPermalink = new Map(flattenCategories(categories).map((category) => [category.permalink, category]));
  const rootCategories = items.flatMap((item) => { const category = byPermalink.get(item.categoryPermalink); if (!category) return []; return [{ ...category, ...(item.labelOverride ? { name: item.labelOverride } : {}) }]; });
  return { rootCategories, appearance };
});

async function StorefrontMobileNavigation({ basePath, country, locale }: StorefrontNavigationProps) {
  const { rootCategories, appearance } = await getNavigationData(country, locale);
  return <HeaderMobileMenu rootCategories={rootCategories} basePath={basePath} appearance={appearance} />;
}

async function StorefrontCategoryNavigation({ basePath, country, locale }: StorefrontNavigationProps) {
  const { rootCategories } = await getNavigationData(country, locale);
  if (rootCategories.length === 0) return null;
  return <nav aria-label="Category navigation" className="sr-only"><ul>{rootCategories.map((category) => <li key={category.id}><Link href={`${basePath}/c/${category.permalink}`}>{category.name}</Link></li>)}</ul></nav>;
}

async function StorefrontFooterCategoryLinks({ basePath, country, locale }: StorefrontNavigationProps) { const rootCategories = await getRootCategories(country, locale); return <FooterCategoryLinks rootCategories={rootCategories} basePath={basePath} />; }

export default async function StorefrontLayout({ children, params }: StorefrontLayoutProps) {
  const { country, locale } = await params;
  const basePath = `/${country}/${locale}`;
  return <>
    <Header basePath={basePath} locale={locale as Locale} mobileNavigation={<Suspense fallback={<MobileNavigationFallback />}><StorefrontMobileNavigation basePath={basePath} country={country} locale={locale} /></Suspense>} />
    <Suspense fallback={null}><StorefrontCategoryNavigation basePath={basePath} country={country} locale={locale} /></Suspense>
    <main className="flex-1">{children}</main>
    <Footer basePath={basePath} locale={locale as Locale} categoryLinks={<Suspense fallback={<FooterCategoryLinksFallback />}><StorefrontFooterCategoryLinks basePath={basePath} country={country} locale={locale} /></Suspense>} />
  </>;
}
