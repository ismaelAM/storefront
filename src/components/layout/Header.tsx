import type { Category } from "@spree/sdk";
import { User } from "lucide-react";
import dynamic from "next/dynamic";
import Image from "next/image";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { CSSProperties, ReactNode } from "react";
import { CartButton } from "@/components/layout/CartButton";
import { SearchToggle } from "@/components/layout/SearchToggle";
import { Button } from "@/components/ui/button";
import {
  getSiteAppearance,
  type SiteAppearance,
} from "@/lib/puck/get-site-appearance";
import { isWholesaleEnabled } from "@/lib/spree";
import { getStoreName } from "@/lib/store";

const LazyMobileMenu = dynamic(
  () =>
    import("@/components/layout/MobileMenu").then((mod) => ({
      default: mod.MobileMenu,
    })),
  {
    loading: () => (
      <div className="inline-flex items-center justify-center h-10 w-10" />
    ),
  },
);

const LazyRegionPreferences = dynamic(
  () =>
    import("@/components/layout/RegionPreferences").then((mod) => ({
      default: mod.RegionPreferences,
    })),
  {
    loading: () => <div className="size-11" aria-hidden="true" />,
  },
);

const storeName = getStoreName();

interface HeaderProps {
  basePath: string;
  locale: Locale;
  mobileNavigation: ReactNode;
  appearance?: SiteAppearance;
}

interface HeaderMobileMenuProps {
  rootCategories: Category[];
  basePath: string;
}

export function HeaderMobileMenu({
  rootCategories,
  basePath,
}: HeaderMobileMenuProps) {
  return (
    <LazyMobileMenu
      rootCategories={rootCategories}
      basePath={basePath}
      wholesaleEnabled={isWholesaleEnabled()}
    />
  );
}

export async function Header({
  basePath,
  locale,
  mobileNavigation,
  appearance,
}: HeaderProps) {
  const t = await getTranslations({ locale, namespace: "header" });
  const wholesaleEnabled = isWholesaleEnabled();
  const colors = appearance ?? (await getSiteAppearance());

  return (
    <div
      style={
        {
          backgroundColor: colors.headerBackground,
          color: colors.headerText,
          borderBottom: `1px solid ${colors.headerBorder}`,
          "--header-background": colors.headerBackground,
        } as CSSProperties
      }
    >
      <SearchToggle
        basePath={basePath}
        left={mobileNavigation}
        center={
          <Link
            href={basePath || "/"}
            className="flex items-center min-w-0"
            style={{ color: colors.headerText }}
          >
            <Image
              src="/spree.png"
              alt={storeName}
              width={90}
              height={32}
              className="max-w-full object-contain"
              style={{ width: "auto", height: "auto" }}
              fetchPriority="high"
              loading="eager"
            />
          </Link>
        }
        rightStart={
          <div className="hidden lg:flex lg:items-center lg:gap-1">
            {wholesaleEnabled && (
              <Link
                href={`${basePath}/wholesale`}
                className="px-2 py-1.5 text-sm transition-colors whitespace-nowrap"
                style={{ color: colors.headerText }}
              >
                {t("wholesale")}
              </Link>
            )}
            <LazyRegionPreferences variant="header" />
          </div>
        }
        rightEnd={
          <>
            <div className="hidden md:block">
              <Button
                variant="ghost"
                size="icon-lg"
                asChild
                style={{ color: colors.headerText }}
              >
                <Link href={`${basePath}/account`} aria-label={t("account")}>
                  <User className="size-5" />
                </Link>
              </Button>
            </div>
            <CartButton />
          </>
        }
      />
    </div>
  );
}
