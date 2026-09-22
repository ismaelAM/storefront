import type { Category } from "@spree/sdk";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { POLICY_LINKS } from "@/lib/constants/policies";
import {
  getSiteAppearance,
  type SiteAppearance,
} from "@/lib/puck/get-site-appearance";
import { isWholesaleEnabled } from "@/lib/spree";
import { getStoreName } from "@/lib/store";
import { CurrentYear } from "./CurrentYear";

const storeName = getStoreName();

interface FooterProps {
  basePath: string;
  locale: Locale;
  categoryLinks: ReactNode;
  appearance?: SiteAppearance;
}

interface FooterCategoryLinksProps {
  rootCategories: Category[];
  basePath: string;
}

export function FooterCategoryLinks({
  rootCategories,
  basePath,
}: FooterCategoryLinksProps) {
  return rootCategories.map((category) => (
    <li key={category.id}>
      <Link
        href={`${basePath}/c/${category.permalink}`}
        className="text-sm transition-colors"
        style={{ color: "inherit" }}
      >
        {category.name}
      </Link>
    </li>
  ));
}

export async function Footer({
  basePath,
  locale,
  categoryLinks,
  appearance,
}: FooterProps) {
  const t = await getTranslations({ locale, namespace: "footer" });
  const tp = await getTranslations({ locale, namespace: "policies" });
  const wholesaleEnabled = isWholesaleEnabled();
  const colors = appearance ?? (await getSiteAppearance());

  const linkStyle = { color: colors.footerText };
  const headingStyle = { color: colors.footerHeading };

  return (
    <footer
      style={{
        backgroundColor: colors.footerBackground,
        color: colors.footerText,
      }}
    >
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 gap-8 md:grid-cols-5">
          <div className="col-span-1 md:col-span-2">
            <span className="text-xl font-bold" style={headingStyle}>
              {storeName}
            </span>
            <p className="mt-4 max-w-md text-sm leading-6" style={linkStyle}>
              {t("description")}
            </p>
          </div>

          <div>
            <h3 className="text-sm font-medium" style={headingStyle}>
              {t("shop")}
            </h3>
            <ul className="mt-4 space-y-3">{categoryLinks}</ul>
          </div>

          <div>
            <h3 className="text-sm font-medium" style={headingStyle}>
              {t("account")}
            </h3>
            <ul className="mt-4 space-y-3">
              <li>
                <Link
                  href={`${basePath}/account`}
                  className="text-sm transition-colors"
                  style={linkStyle}
                >
                  {t("myAccount")}
                </Link>
              </li>
              <li>
                <Link
                  href={`${basePath}/account/orders`}
                  className="text-sm transition-colors"
                  style={linkStyle}
                >
                  {t("orderHistory")}
                </Link>
              </li>
              <li>
                <Link
                  href={`${basePath}/cart`}
                  className="text-sm transition-colors"
                  style={linkStyle}
                >
                  {t("cart")}
                </Link>
              </li>
              {wholesaleEnabled && (
                <li>
                  <Link
                    href={`${basePath}/wholesale`}
                    className="text-sm transition-colors"
                    style={linkStyle}
                  >
                    {t("wholesale")}
                  </Link>
                </li>
              )}
            </ul>
          </div>

          <div>
            <h3 className="text-sm font-medium" style={headingStyle}>
              {t("policies")}
            </h3>
            <ul className="mt-4 space-y-3">
              {POLICY_LINKS.map((policy) => (
                <li key={policy.slug}>
                  <Link
                    href={`${basePath}/policies/${policy.slug}`}
                    className="text-sm transition-colors"
                    style={linkStyle}
                  >
                    {tp(policy.nameKey)}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div
          className="mt-8 border-t pt-6 text-center text-xs"
          style={{ borderColor: colors.footerText, color: colors.footerText }}
        >
          <p>
            &copy; <CurrentYear /> {storeName}. {t("rightsReserved")}
          </p>
        </div>
      </div>
    </footer>
  );
}
