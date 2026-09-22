import type { Data } from "@puckeditor/core";
import { connection } from "next/server";
import { getSitePageData } from "@/lib/puck/get-site-page-data";
import CartClient, { type CartVisualConfig } from "./CartClient";

const fallbackData: Data = {
  content: [{ type: "CartChrome", props: { id: "cart-chrome" } }],
  root: {},
};

export default async function CartPage() {
  await connection();
  const data = await getSitePageData("cart", fallbackData);
  const props = data.content.find((item) => item.type === "CartChrome")
    ?.props as Partial<CartVisualConfig> | undefined;

  const config: CartVisualConfig = {
    title: props?.title ?? "Carrito",
    emptyTitle: props?.emptyTitle ?? "Tu carrito está vacío",
    emptyDescription:
      props?.emptyDescription ?? "Añade productos para verlos aquí.",
    backgroundColor: props?.backgroundColor ?? "#ffffff",
    cardBackgroundColor: props?.cardBackgroundColor ?? "#ffffff",
    textColor: props?.textColor ?? "#111827",
    mutedTextColor: props?.mutedTextColor ?? "#6b7280",
    accentColor: props?.accentColor ?? "#111827",
    maxWidth: props?.maxWidth ?? "large",
    radius: props?.radius ?? "large",
    alignment: props?.alignment ?? "left",
  };

  return <CartClient config={config} />;
}
