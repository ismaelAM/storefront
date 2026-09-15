import type { Data } from "@puckeditor/core";
import { connection } from "next/server";
import { getSitePageData } from "@/lib/puck/get-site-page-data";
import { CartEditorClient } from "./CartEditorClient";

const fallbackData: Data = {
  content: [{ type: "CartChrome", props: { id: "cart-chrome" } }],
  root: {},
};

interface Props {
  params: Promise<{ country: string; locale: string }>;
}

export default async function CartEditorPage({ params }: Props) {
  await connection();
  const { country, locale } = await params;
  const basePath = `/${country}/${locale}`;
  const initialData = await getSitePageData("cart", fallbackData);
  return <CartEditorClient initialData={initialData} basePath={basePath} />;
}
