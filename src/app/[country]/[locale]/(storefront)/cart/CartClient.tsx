"use client";

import type { LineItem } from "@spree/sdk";
import { ShoppingBag } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { QuantityPickerField } from "@/components/cart/QuantityPickerField";
import { Button } from "@/components/ui/button";
import { ProductImage } from "@/components/ui/product-image";
import { useCart } from "@/contexts/CartContext";
import { trackRemoveFromCart, trackViewCart } from "@/lib/analytics/gtm";
import { extractBasePath } from "@/lib/utils/path";

const ExpressCheckoutButton = dynamic(
  () =>
    import("@/components/checkout/ExpressCheckoutButton").then((m) => ({
      default: m.ExpressCheckoutButton,
    })),
  { ssr: false },
);

export interface CartVisualConfig {
  title: string;
  emptyTitle: string;
  emptyDescription: string;
  backgroundColor: string;
  cardBackgroundColor: string;
  textColor: string;
  mutedTextColor: string;
  accentColor: string;
  maxWidth: "medium" | "large" | "full";
  radius: "none" | "medium" | "large";
  alignment: "left" | "center";
}

export default function CartClient({ config }: { config: CartVisualConfig }) {
  const { cart, loading, updating, updateItem, removeItem } = useCart();
  const [expressProcessing, setExpressProcessing] = useState(false);
  const pathname = usePathname();
  const basePath = extractBasePath(pathname);
  const viewCartFiredRef = useRef(false);
  const t = useTranslations("cart");
  const tc = useTranslations("common");

  useEffect(() => {
    if (!loading && cart && cart.total_quantity > 0 && !viewCartFiredRef.current) {
      trackViewCart(cart);
      viewCartFiredRef.current = true;
    }
  }, [cart, loading]);

  const handleRemove = async (item: LineItem) => {
    await removeItem(item.id);
    if (cart) trackRemoveFromCart(item, cart.currency);
  };

  const widthClass = config.maxWidth === "medium" ? "max-w-5xl" : config.maxWidth === "full" ? "max-w-none" : "max-w-7xl";
  const radiusClass = config.radius === "none" ? "rounded-none" : config.radius === "medium" ? "rounded-md" : "rounded-xl";

  if (loading) {
    return (
      <div className="mx-auto w-full px-4 py-8 sm:px-6 lg:px-8" style={{ backgroundColor: config.backgroundColor }}>
        <div className={`${widthClass} mx-auto animate-pulse`}>
          <div className="mb-8 h-8 w-32 rounded bg-gray-200" />
          <div className="space-y-4">{[1, 2, 3].map((i) => <div key={i} className="h-24 rounded bg-gray-200" />)}</div>
        </div>
      </div>
    );
  }

  if (!cart?.items || cart.items.length === 0) {
    return (
      <div className="w-full px-4 py-16 sm:px-6 lg:px-8" style={{ backgroundColor: config.backgroundColor, color: config.textColor }}>
        <div className={`${widthClass} mx-auto`} style={{ textAlign: config.alignment }}>
          <ShoppingBag className="mx-auto h-24 w-24 text-gray-300" strokeWidth={1} />
          <h1 className="mt-4 text-2xl font-bold">{config.emptyTitle || t("emptyCart")}</h1>
          <p className="mt-2" style={{ color: config.mutedTextColor }}>{config.emptyDescription || t("emptyCartDescription")}</p>
          <div className="mt-6"><Button size="lg" asChild style={{ backgroundColor: config.accentColor }}><Link href={`${basePath}/products`}>{tc("continueShopping")}</Link></Button></div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full px-4 py-8 sm:px-6 lg:px-8" style={{ backgroundColor: config.backgroundColor, color: config.textColor }}>
      <div className={`${widthClass} mx-auto`}>
        <h1 className="mb-8 text-3xl font-bold" style={{ textAlign: config.alignment }}>{config.title || t("shoppingCart")}</h1>
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <div className={`${radiusClass} divide-y border`} style={{ backgroundColor: config.cardBackgroundColor }}>
              {cart.items.map((item) => (
                <div key={item.id} className="flex gap-6 p-6">
                  <div className="relative h-24 w-24 flex-shrink-0 overflow-hidden rounded-xl bg-gray-100">
                    <ProductImage src={item.thumbnail_url} alt={item.name} fill className="object-cover" sizes="96px" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate text-lg font-medium">{item.name}</h3>
                    {item.options_text && <p className="mt-1 text-sm" style={{ color: config.mutedTextColor }}>{item.options_text}</p>}
                    <p className="mt-2 text-lg font-semibold">{item.display_price}</p>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <QuantityPickerField quantity={item.quantity} onQuantityChange={(quantity) => updateItem(item.id, quantity)} disabled={updating} />
                    <Button variant="destructive" size="sm" aria-label={t("removeItemLabel", { name: item.name })} onClick={() => handleRemove(item)} disabled={updating}>{tc("remove")}</Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="lg:col-span-1">
            <div className={`${radiusClass} sticky top-24 border p-6`} style={{ backgroundColor: config.cardBackgroundColor }}>
              <h2 className="text-lg font-medium">{tc("orderSummary")}</h2>
              <dl className="mt-6 space-y-4">
                <div className="flex justify-between"><dt style={{ color: config.mutedTextColor }}>{tc("subtotal")}</dt><dd>{cart.display_item_total}</dd></div>
                {cart.discount_total && parseFloat(cart.discount_total) < 0 && <div className="flex justify-between text-green-600"><dt>{tc("discount")}</dt><dd>{cart.display_discount_total}</dd></div>}
                {cart.delivery_total && parseFloat(cart.delivery_total) > 0 && <div className="flex justify-between"><dt style={{ color: config.mutedTextColor }}>{tc("shipping")}</dt><dd>{cart.display_delivery_total}</dd></div>}
                {cart.tax_total && parseFloat(cart.tax_total) > 0 && <div className="flex justify-between"><dt style={{ color: config.mutedTextColor }}>{tc("tax")}</dt><dd>{cart.display_tax_total}</dd></div>}
                <div className="flex justify-between border-t pt-4"><dt className="text-lg font-medium">{tc("total")}</dt><dd className="text-lg font-bold">{cart.display_total}</dd></div>
                {cart.gift_card && parseFloat(cart.gift_card_total ?? "0") > 0 ? <div className="flex justify-between text-green-600"><dt>{t("giftCard")}</dt><dd>-{cart.display_gift_card_total}</dd></div> : cart.store_credit_total && parseFloat(cart.store_credit_total) > 0 ? <div className="flex justify-between text-green-600"><dt>{t("storeCredit")}</dt><dd>-{cart.display_store_credit_total}</dd></div> : null}
                {cart.amount_due && cart.amount_due !== cart.total && parseFloat(cart.amount_due) > 0 && <div className="flex justify-between border-t pt-4"><dt className="text-lg font-medium">{t("amountDue")}</dt><dd className="text-lg font-bold">{cart.display_amount_due}</dd></div>}
              </dl>
              <div className="mt-6 space-y-3">
                {parseFloat(cart.total ?? "0") > 0 && <ExpressCheckoutButton cart={cart} basePath={basePath} onComplete={() => {}} onProcessingChange={setExpressProcessing} />}
                {!expressProcessing && <><Button size="lg" asChild className="w-full" style={{ backgroundColor: config.accentColor }}><Link href={`${basePath}/checkout/${cart.id}`}>{t("proceedToCheckout")}</Link></Button><Button variant="link" asChild className="w-full"><Link href={`${basePath}/products`}>{tc("continueShopping")}</Link></Button></>}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
