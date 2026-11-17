import type { CSSProperties } from "react";
import type { Category } from "@spree/sdk";
import Link from "next/link";
import { connection } from "next/server";
import { getTranslations } from "next-intl/server";
import { cache, Suspense } from "react";
import { Footer, FooterCategoryLinks } from "@/components/layout/Footer";
import { Header, HeaderMobileMenu } from "@/components/layout/Header";
import { tcgNavigation } from "@/lib/catalog/tcg-navigation";
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
  const filteredResponse = await getCategories(
    { depth_eq: 0, expand: ["children.children"] },
    { country, locale },
  ).catch((error) => {
    console.error("StorefrontLayout: failed to load root categories", error);
    return null;
  });

  // A failed backend read is not an empty catalogue. Retrying a wider query
  // during the same render only adds load to an unavailable service.
  if (!filteredResponse) return EMPTY_CATEGORIES;
  if (filteredResponse.data?.length) return tcgNavigation(filteredResponse.data);

  const fallbackResponse = await getCategories(
    { expand: ["children.children"] },
    { country, locale },
  ).catch((error) => {
    console.error("StorefrontLayout: failed to load categories fallback", error);
    return null;
  });

  if (!fallbackResponse?.data?.length) return EMPTY_CATEGORIES;

  const allCategories = fallbackResponse.data as Array<
    Category & { depth?: number; parent_id?: string | null }
  >;
  const rootCategories = allCategories.filter(
    (category) => category.depth === 0 || category.parent_id == null,
  );

  return tcgNavigation(rootCategories.length > 0 ? rootCategories : fallbackResponse.data);
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
  const savedGames = props?.items?.filter((item) => categories.some((category) => category.permalink === item.categoryPermalink)) ?? [];
  const configuredPaths = new Set(savedGames.map((item) => item.categoryPermalink));
  const items = [
    ...savedGames.filter((item) => item.visible),
    ...fallback.filter((item) => !configuredPaths.has(item.categoryPermalink)),
  ];
  const byPermalink = new Map(flattenCategories(categories).map((category) => [category.permalink, category]));
  const configuredCategories = items.flatMap((item) => {
    const category = byPermalink.get(item.categoryPermalink);
    if (!category) return [];
    return [{ ...category, ...(item.labelOverride ? { name: item.labelOverride } : {}) }];
  });

  return configuredCategories;
});

async function StorefrontMobileNavigation({ basePath, country, locale }: StorefrontNavigationProps) {
  const rootCategories = await getNavigationCategories(country, locale);
  return <HeaderMobileMenu rootCategories={rootCategories} basePath={basePath} />;
}

async function StorefrontCategoryNavigation({ basePath, country, locale }: StorefrontNavigationProps) {
  const rootCategories = await getNavigationCategories(country, locale);
  if (rootCategories.length === 0) return null;
  const t = await getTranslations({ locale: locale as Locale, namespace: "tcgShop" });
  return <nav aria-label={t("games")} className="border-b bg-card">
    <div className="container mx-auto flex gap-2 overflow-x-auto px-4 py-2 sm:px-6 lg:px-8">
      {rootCategories.slice(0, 4).map((game) => <Link key={game.id} href={`${basePath}/c/${game.permalink}`} prefetch={false} className="shrink-0 rounded-md px-3 py-1.5 text-sm font-medium hover:bg-secondary">{game.name}</Link>)}
      <Link href={`${basePath}#juegos`} prefetch={false} className="shrink-0 rounded-md px-3 py-1.5 text-sm font-bold text-primary hover:bg-secondary">{t("games")} ↗</Link>
    </div>
  </nav>;
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
    "--background": appearance.pageBackground,
    "--foreground": appearance.textColor,
    "--card": appearance.surfaceColor,
    "--card-foreground": appearance.textColor,
    "--popover": appearance.surfaceColor,
    "--popover-foreground": appearance.textColor,
    "--primary": appearance.accentColor,
    "--primary-foreground": appearance.accentText,
    "--highlight": appearance.highlightColor,
    "--highlight-foreground": appearance.highlightText,
    "--secondary": appearance.secondaryColor,
    "--secondary-foreground": appearance.secondaryText,
    "--muted": appearance.surfaceAltColor,
    "--muted-foreground": appearance.mutedTextColor,
    "--accent": appearance.secondaryColor,
    "--accent-foreground": appearance.secondaryText,
    "--border": appearance.borderColor,
    "--input": appearance.borderColor,
    "--surface": appearance.surfaceColor,
    "--surface-alt": appearance.surfaceAltColor,
    "--text": appearance.textColor,
    "--text-muted": appearance.mutedTextColor,
    "--border-color": appearance.borderColor,
  } as CSSProperties;

  return (
    <div className="flex min-h-screen min-h-dvh flex-1 flex-col" style={themeStyle}>
      <Header appearance={appearance} basePath={basePath} locale={locale as Locale} mobileNavigation={<Suspense fallback={<MobileNavigationFallback />}><StorefrontMobileNavigation basePath={basePath} country={country} locale={locale} /></Suspense>} />
      <Suspense fallback={null}><StorefrontCategoryNavigation basePath={basePath} country={country} locale={locale} /></Suspense>
      <main className="min-w-0 flex-1">{children}</main>
      <Footer appearance={appearance} basePath={basePath} locale={locale as Locale} categoryLinks={<Suspense fallback={<FooterCategoryLinksFallback />}><StorefrontFooterCategoryLinks basePath={basePath} country={country} locale={locale} /></Suspense>} />
    </div>
  );
}
