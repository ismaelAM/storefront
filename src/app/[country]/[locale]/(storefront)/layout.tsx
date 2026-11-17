import type { CSSProperties } from "react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { Footer, FooterCategoryLinks } from "@/components/layout/Footer";
import { Header, HeaderMobileMenu } from "@/components/layout/Header";
import { getStorefrontGames } from "@/lib/data/storefront-games";
import { getSiteAppearance } from "@/lib/puck/get-site-appearance";

interface StorefrontLayoutProps { children: React.ReactNode; params: Promise<{ country: string; locale: string }> }
interface StorefrontNavigationProps { basePath: string; country: string; locale: string }
function MobileNavigationFallback() { return <div aria-hidden="true" className="size-10 animate-pulse rounded-md bg-gray-100 motion-reduce:animate-none" />; }
function FooterCategoryLinksFallback() { return <li aria-hidden="true"><span className="block h-4 w-24 animate-pulse rounded bg-white/10 motion-reduce:animate-none" /></li>; }

async function StorefrontMobileNavigation({ basePath, country, locale }: StorefrontNavigationProps) {
  const rootCategories = await getStorefrontGames(country, locale);
  return <HeaderMobileMenu rootCategories={rootCategories} basePath={basePath} />;
}

async function StorefrontCategoryNavigation({ basePath, country, locale }: StorefrontNavigationProps) {
  const rootCategories = await getStorefrontGames(country, locale);
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
  const rootCategories = await getStorefrontGames(country, locale);
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
