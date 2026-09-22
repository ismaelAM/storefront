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
  highlightColor: string;
  highlightText: string;
  secondaryColor: string;
  secondaryText: string;
  surfaceColor: string;
  surfaceAltColor: string;
  textColor: string;
  mutedTextColor: string;
  borderColor: string;
};

const fallbackAppearance: SiteAppearance = {
  headerBackground: "#f6f0e3",
  headerText: "#4a3422",
  headerBorder: "#d8c8ae",
  footerBackground: "#5a3822",
  footerText: "#eadfcb",
  footerHeading: "#fff8ea",
  pageBackground: "#f6f0e3",
  accentColor: "#6b4423",
  accentText: "#fff8ea",
  highlightColor: "#6f8c95",
  highlightText: "#fffdf8",
  secondaryColor: "#eadfc9",
  secondaryText: "#4a3422",
  surfaceColor: "#fffdf8",
  surfaceAltColor: "#efe2cb",
  textColor: "#3b2a1e",
  mutedTextColor: "#6f6258",
  borderColor: "#d8c8ae",
};

export const getSiteAppearance = cache(async (): Promise<SiteAppearance> => {
  const data = await getSitePageData("appearance", {
    content: [
      {
        type: "Appearance",
        props: { id: "appearance", ...fallbackAppearance },
      },
    ],
    root: {},
  });
  const props = data.content.find((item) => item.type === "Appearance")
    ?.props as Partial<SiteAppearance> | undefined;

  return {
    headerBackground:
      props?.headerBackground ?? fallbackAppearance.headerBackground,
    headerText: props?.headerText ?? fallbackAppearance.headerText,
    headerBorder: props?.headerBorder ?? fallbackAppearance.headerBorder,
    footerBackground:
      props?.footerBackground ?? fallbackAppearance.footerBackground,
    footerText: props?.footerText ?? fallbackAppearance.footerText,
    footerHeading: props?.footerHeading ?? fallbackAppearance.footerHeading,
    pageBackground: props?.pageBackground ?? fallbackAppearance.pageBackground,
    accentColor: props?.accentColor ?? fallbackAppearance.accentColor,
    accentText: props?.accentText ?? fallbackAppearance.accentText,
    highlightColor: props?.highlightColor ?? fallbackAppearance.highlightColor,
    highlightText: props?.highlightText ?? fallbackAppearance.highlightText,
    secondaryColor: props?.secondaryColor ?? fallbackAppearance.secondaryColor,
    secondaryText: props?.secondaryText ?? fallbackAppearance.secondaryText,
    surfaceColor: props?.surfaceColor ?? fallbackAppearance.surfaceColor,
    surfaceAltColor:
      props?.surfaceAltColor ?? fallbackAppearance.surfaceAltColor,
    textColor: props?.textColor ?? fallbackAppearance.textColor,
    mutedTextColor: props?.mutedTextColor ?? fallbackAppearance.mutedTextColor,
    borderColor: props?.borderColor ?? fallbackAppearance.borderColor,
  };
});
