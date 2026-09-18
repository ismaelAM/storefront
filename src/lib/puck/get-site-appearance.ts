import { cache } from "react";
import { getSitePageData } from "@/lib/puck/get-site-page-data";

export type SiteAppearance = {
  headerBackground: string;
  headerText: string;
  headerBorder: string;
  footerBackground: string;
  footerText: string;
  footerHeading: string;
  pageBackground: string;
  accentColor: string;
  accentText: string;
  secondaryColor: string;
  secondaryText: string;
  surfaceColor: string;
  surfaceAltColor: string;
  textColor: string;
  mutedTextColor: string;
  borderColor: string;
};

const fallbackAppearance: SiteAppearance = {
  headerBackground: "#ffffff",
  headerText: "#111827",
  headerBorder: "#e5e7eb",
  footerBackground: "#111827",
  footerText: "#d1d5db",
  footerHeading: "#f3f4f6",
  pageBackground: "#ffffff",
  accentColor: "#111827",
  accentText: "#ffffff",
  secondaryColor: "#f3f4f6",
  secondaryText: "#111827",
  surfaceColor: "#ffffff",
  surfaceAltColor: "#f3f4f6",
  textColor: "#111827",
  mutedTextColor: "#6b7280",
  borderColor: "#e5e7eb",
};

export const getSiteAppearance = cache(async (): Promise<SiteAppearance> => {
  const data = await getSitePageData("appearance", {
    content: [{ type: "Appearance", props: { id: "appearance", ...fallbackAppearance } }],
    root: {},
  });
  const props = data.content.find((item) => item.type === "Appearance")?.props as
    | Partial<SiteAppearance>
    | undefined;

  return {
    headerBackground: props?.headerBackground ?? fallbackAppearance.headerBackground,
    headerText: props?.headerText ?? fallbackAppearance.headerText,
    headerBorder: props?.headerBorder ?? fallbackAppearance.headerBorder,
    footerBackground: props?.footerBackground ?? fallbackAppearance.footerBackground,
    footerText: props?.footerText ?? fallbackAppearance.footerText,
    footerHeading: props?.footerHeading ?? fallbackAppearance.footerHeading,
    pageBackground: props?.pageBackground ?? fallbackAppearance.pageBackground,
    accentColor: props?.accentColor ?? fallbackAppearance.accentColor,
    accentText: props?.accentText ?? fallbackAppearance.accentText,
    secondaryColor: props?.secondaryColor ?? fallbackAppearance.secondaryColor,
    secondaryText: props?.secondaryText ?? fallbackAppearance.secondaryText,
    surfaceColor: props?.surfaceColor ?? fallbackAppearance.surfaceColor,
    surfaceAltColor: props?.surfaceAltColor ?? fallbackAppearance.surfaceAltColor,
    textColor: props?.textColor ?? fallbackAppearance.textColor,
    mutedTextColor: props?.mutedTextColor ?? fallbackAppearance.mutedTextColor,
    borderColor: props?.borderColor ?? fallbackAppearance.borderColor,
  };
});
