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
};

const fallbackAppearance: SiteAppearance = {
  headerBackground: "#ffffff",
  headerText: "#111827",
  headerBorder: "#e5e7eb",
  footerBackground: "#111827",
  footerText: "#d1d5db",
  footerHeading: "#f3f4f6",
  pageBackground: "#ffffff",
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
  };
});
