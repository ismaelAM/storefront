import type { Data } from "@puckeditor/core";
import { connection } from "next/server";
import { getSitePageData } from "@/lib/puck/get-site-page-data";
import { CartEditorClient } from "./CartEditorClient";

const fallbackData: Data = {
  content: [{ type: "CartChrome", props: { id: "cart-chrome" } }],
  root: {},
};

export default async function CartEditorPage() {
  await connection();
  const initialData = await getSitePageData("cart", fallbackData);
  return <CartEditorClient initialData={initialData} />;
}
