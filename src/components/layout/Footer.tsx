import type { Category } from "@spree/sdk";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { POLICY_LINKS } from "@/lib/constants/policies";
import { isWholesaleEnabled } from "@/lib/spree";
import { getSiteAppearance, type SiteAppearance } from "@/lib/puck/get-site-appearance";
import { getStoreDescription, getStoreName } from "@/lib/store";
import { CurrentYear } from "./CurrentYear";

const storeName = getStoreName();
const storeDescription = getStoreDescription();
const githubUrl = "https://github.com/spree/storefront";
const quickstartUrl = "https://spreecommerce.org/docs/developer/getting-started/quickstart";
const learnMoreUrl = "https://spreecommerce.org";

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

export function FooterCategoryLinks({ rootCategories, basePath }: FooterCategoryLinksProps) {
  return rootCategories.map((category) => (
    <li key={category.id}>
      <Link href={`${basePath}/c/${category.permalink}`} className="text-sm transition-colors" style={{ color: "inherit" }}>
        {category.name}
      </Link>
    </li>
  ));
}

export async function Footer({ basePath, locale, categoryLinks, appearance }: FooterProps) {
  const t = await getTranslations({ locale, namespace: "footer" });
  const tp = await getTranslations({ locale, namespace: "policies" });
  const wholesaleEnabled = isWholesaleEnabled();
  const colors = appearance ?? (await getSiteAppearance());

  const linkStyle = { color: colors.footerText };
  const headingStyle = { color: colors.footerHeading };

  return (
    <footer style={{ backgroundColor: colors.footerBackground, color: colors.footerText }}>
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 gap-8 md:grid-cols-5">
          <div className="col-span-1 md:col-span-2">
            <span className="text-xl font-bold" style={headingStyle}>{storeName}</span>
            <p className="mt-4 text-sm" style={linkStyle}>{t("description") || storeDescription}</p>
            <div className="mt-4 flex flex-col gap-2">
              <Link href={githubUrl} target="_blank" rel="noopener noreferrer" className="text-sm font-medium transition-colors" style={headingStyle}>{t("forkOnGithub")} &rarr;</Link>
              <Link href={quickstartUrl} target="_blank" rel="noopener noreferrer" className="text-sm transition-colors" style={linkStyle}>{t("quickstartGuide")}</Link>
              <Link href={learnMoreUrl} target="_blank" rel="noopener noreferrer" className="text-sm transition-colors" style={linkStyle}>{t("learnMore")}</Link>
            </div>
          </div>

          <div>
            <h3 className="text-sm font-medium" style={headingStyle}>{t("shop")}</h3>
            <ul className="mt-4 space-y-3">
              {categoryLinks}
            </ul>
          </div>

          <div>
            <h3 className="text-sm font-medium" style={headingStyle}>{t("account")}</h3>
            <ul className="mt-4 space-y-3">
              <li><Link href={`${basePath}/account`} className="text-sm transition-colors" style={linkStyle}>{t("myAccount")}</Link></li>
              <li><Link href={`${basePath}/account/orders`} className="text-sm transition-colors" style={linkStyle}>{t("orderHistory")}</Link></li>
              <li><Link href={`${basePath}/cart`} className="text-sm transition-colors" style={linkStyle}>{t("cart")}</Link></li>
              {wholesaleEnabled && <li><Link href={`${basePath}/wholesale`} className="text-sm transition-colors" style={linkStyle}>{t("wholesale")}</Link></li>}
            </ul>
          </div>

          <div>
            <h3 className="text-sm font-medium" style={headingStyle}>{t("policies")}</h3>
            <ul className="mt-4 space-y-3">
              {POLICY_LINKS.map((policy) => (
                <li key={policy.slug}><Link href={`${basePath}/policies/${policy.slug}`} className="text-sm transition-colors" style={linkStyle}>{tp(policy.nameKey)}</Link></li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-8 pt-8 border-t text-xs text-center" style={{ borderColor: colors.footerText, color: colors.footerText }}>
          <p>&copy; <CurrentYear /> {storeName}. {t("poweredBy")} {" "}
            <Link href="https://spreecommerce.org" target="_blank" className="underline transition-colors" style={linkStyle}>Spree Commerce</Link>{" "}& Next.js.
          </p>
        </div>
      </div>
    </footer>
  );
}
