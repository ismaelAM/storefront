import type { Data } from "@puckeditor/core";
import { connection } from "next/server";
import { getSitePageData } from "@/lib/puck/get-site-page-data";
import { AppearanceEditorClient } from "./AppearanceEditorClient";

interface Props {
  params: Promise<{ country: string; locale: string }>;
}

const fallbackData: Data = {
  content: [
    {
      type: "Appearance",
      props: {
        id: "appearance",
        headerBackground: "#ffffff",
        headerText: "#111827",
        headerBorder: "#e5e7eb",
        footerBackground: "#111827",
        footerText: "#d1d5db",
        footerHeading: "#f3f4f6",
        pageBackground: "#ffffff",
      },
    },
  ],
  root: {},
};

export default async function AppearanceEditorPage({ params }: Props) {
  await connection();
  const { country, locale } = await params;
  const basePath = `/${country}/${locale}`;
  const initialData = await getSitePageData("appearance", fallbackData);
  return <AppearanceEditorClient initialData={initialData} basePath={basePath} />;
}
