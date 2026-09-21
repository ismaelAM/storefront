"use client";

import type { Media, Product, Variant } from "@spree/sdk";
import {
  CalendarClock,
  CircleCheckBig,
  CircleX,
  Loader2,
  ShoppingBag,
} from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import { QuantityPickerField } from "@/components/cart/QuantityPickerField";
import { HiddenPricePrompt } from "@/components/products/HiddenPricePrompt";
import { MediaGallery } from "@/components/products/MediaGallery";
import { ProductCustomFields } from "@/components/products/ProductCustomFields";
import { VariantPicker } from "@/components/products/VariantPicker";
import { Button } from "@/components/ui/button";
import { useCart } from "@/contexts/CartContext";
import { useHiddenPricing } from "@/contexts/HiddenPricingContext";
import { useStore } from "@/contexts/StoreContext";
import { trackAddToCart, trackViewItem } from "@/lib/analytics/gtm";

interface ProductDetailsProps {
  product: Product;
  basePath: string;
  shortDescription: string;
}

function isIsbnLike(value: string | null | undefined): boolean {
  if (!value) return false;
  const compact = value.replace(/[\s-]/g, "");
  return /^(?:97[89]\d{10}|\d{9}[\dX])$/i.test(compact);
}

function cleanOptionsText(value: string | null | undefined): string | null {
  if (!value) return null;
  const cleaned = value
    .split(/\s*[,·]\s*/)
    .filter((part) => !/\bISBN\s*(?:97[89]\d{10}|\d{9}[\dX])\b/i.test(part))
    .join(" · ")
    .trim();
  return cleaned || null;
}

export function ProductDetails({
  product,
  basePath,
  shortDescription,
}: ProductDetailsProps) {
  const { addItem } = useCart();
  const { currency } = useStore();
  const t = useTranslations("products");
  const tw = useTranslations("wholesale");
  // Non-null inside a HiddenPricingProvider (wholesale `prices_hidden`, guest
  // view): prices are null on purpose, and ordering is gated behind sign-in.
  const hiddenPricing = useHiddenPricing();
  const pricesHidden = hiddenPricing !== null;

  // Filter variants list
  const variants = useMemo(() => {
    return (product.variants || []).filter(Boolean);
  }, [product.variants]);

  const hasVariants = variants.length > 0;
  const optionTypes = product.option_types || [];

  // Initialize with default variant or first available variant
  const [selectedVariant, setSelectedVariant] = useState<Variant | null>(() => {
    if (product.default_variant) {
      return product.default_variant;
    }
    if (hasVariants) {
      return variants.find((v) => v.purchasable) || variants[0];
    }
    // For products without variants, use default variant
    return product.default_variant || null;
  });

  const [quantity, setQuantity] = useState(1);
  const [loading, setLoading] = useState(false);

  // Track product view (analytics - client-only side effect)
  useEffect(() => {
    trackViewItem(product, currency);
  }, [product, currency]);

  const galleryImages = useMemo((): Media[] => {
    return product.media || [];
  }, [product.media]);

  const variantImageIndex = useMemo((): number | null => {
    if (!selectedVariant) return null;
    const index = galleryImages.findIndex((m) =>
      m.variant_ids.includes(selectedVariant.id),
    );
    return index >= 0 ? index : null;
  }, [selectedVariant, galleryImages]);

  const price = selectedVariant?.price ?? product.price;
  const originalPrice =
    selectedVariant?.original_price ?? product.original_price;
  const displayPrice = price?.display_amount;

  const currentAmountCents = price?.amount_in_cents;
  const originalAmountCents = originalPrice?.amount_in_cents;
  const compareAtAmountCents = price?.compare_at_amount_in_cents;
  const onSale =
    (currentAmountCents != null &&
      originalAmountCents != null &&
      currentAmountCents < originalAmountCents) ||
    (compareAtAmountCents != null &&
      currentAmountCents != null &&
      currentAmountCents < compareAtAmountCents);

  const strikethroughPrice = onSale
    ? ((originalPrice?.display_amount &&
      originalPrice.display_amount !== displayPrice
        ? originalPrice.display_amount
        : price?.display_compare_at_amount) ?? null)
    : null;

  const sku = selectedVariant?.sku ?? product.default_variant?.sku;
  const displaySku = isIsbnLike(sku) ? null : sku;
  const displayOptionsText = cleanOptionsText(selectedVariant?.options_text);

  // Purchasability
  const isPurchasable = hasVariants
    ? (selectedVariant?.purchasable ?? false)
    : (product.purchasable ?? false);

  const isPreorder = hasVariants
    ? (selectedVariant?.preorder ?? false)
    : (product.preorder ?? false);

  const preorderShipsAt = hasVariants
    ? selectedVariant?.preorder_ships_at
    : product.preorder_ships_at;

  const handleAddToCart = async () => {
    const variantId =
      selectedVariant?.id ||
      product.default_variant?.id ||
      product.default_variant_id;
    if (!variantId) {
      throw new Error("No variant selected");
    }

    setLoading(true);
    await addItem(variantId, quantity);
    setLoading(false);
    trackAddToCart(product, selectedVariant, quantity, currency);
  };

  return (
    <div className="container mx-auto px-4 sm:px-6 lg:px-8  py-8">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
        {/* Media Gallery */}
        <div>
          <MediaGallery
            images={galleryImages}
            productName={product.name}
            activeIndex={variantImageIndex}
          />
        </div>

        {/* Product Info */}
        <div>
          <h1 className="text-3xl font-bold text-gray-900">{product.name}</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-gray-600 sm:text-base">
            {shortDescription}
          </p>

          {/* Price */}
          <div className="mt-4 flex items-center gap-4">
            {displayPrice ? (
              <span className="text-3xl font-bold text-gray-900">
                {displayPrice}
              </span>
            ) : (
              <HiddenPricePrompt className="inline-flex items-center gap-1.5 text-base font-medium text-slate-600 underline underline-offset-4 hover:text-slate-900" />
            )}
            {onSale && strikethroughPrice && (
              <>
                <span className="text-xl text-gray-500 line-through">
                  {strikethroughPrice}
                </span>
                <span className="bg-red-100 text-red-800 text-sm font-medium px-2.5 py-0.5 rounded">
                  {t("sale")}
                </span>
              </>
            )}
          </div>

          {/* Stock Status */}
          <div className="mt-4">
            {isPreorder ? (
              <div className="space-y-1">
                <span className="inline-flex items-center gap-1.5 text-amber-700">
                  <CalendarClock className="w-5 h-5" />
                  {t("preorder")}
                </span>
                {preorderShipsAt && (
                  <p className="text-sm text-gray-500">
                    {t("preorderShipsAt", {
                      date: new Intl.DateTimeFormat(undefined, {
                        dateStyle: "medium",
                      }).format(new Date(preorderShipsAt)),
                    })}
                  </p>
                )}
              </div>
            ) : isPurchasable ? (
              <span className="inline-flex items-center gap-1.5 text-green-600">
                <CircleCheckBig className="w-5 h-5" />
                {t("availableToOrder")}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-red-600">
                <CircleX className="w-5 h-5" />
                {t("outOfStock")}
              </span>
            )}
          </div>

          {/* Variant Picker */}
          {hasVariants && (
            <div className="mt-8">
              <VariantPicker
                variants={variants}
                optionTypes={optionTypes}
                selectedVariant={selectedVariant}
                onVariantChange={setSelectedVariant}
              />
            </div>
          )}

          {/* Quantity & Add to Cart */}
          <div className="mt-8">
            {pricesHidden ? (
              // Guest on a prices-hidden channel: no pricing, no ordering —
              // route them through the wholesale sign-in first.
              <Button asChild size="lg">
                <Link href={hiddenPricing.signInHref}>
                  {tw("hiddenPrice.signInToOrder")}
                </Link>
              </Button>
            ) : (
              <div className="flex gap-4">
                <QuantityPickerField
                  quantity={quantity}
                  onQuantityChange={setQuantity}
                  size="lg"
                />

                {/* Add to Cart Button */}
                <Button
                  size="lg"
                  onClick={handleAddToCart}
                  disabled={loading || !isPurchasable}
                >
                  {loading ? (
                    <>
                      <Loader2 className="animate-spin h-5 w-5" />
                      {t("adding")}
                    </>
                  ) : isPurchasable ? (
                    <>
                      <ShoppingBag className="w-5 h-5" />
                      {isPreorder ? t("preorderAction") : t("addToCart")}
                    </>
                  ) : (
                    t("outOfStock")
                  )}
                </Button>
              </div>
            )}
          </div>

          {/* Description */}
          {product.description_html && (
            <div className="mt-10 border-t pt-8">
              <h2 className="text-lg font-medium text-gray-900 mb-4">
                {t("description")}
              </h2>
              {/* Description is admin-authored HTML from the Spree CMS backend (trusted source) */}
              <div
                className="text-gray-600 prose prose-sm max-w-none"
                dangerouslySetInnerHTML={{
                  __html: product.description_html,
                }}
              />
            </div>
          )}

          {/* Custom Fields */}
          <ProductCustomFields customFields={product.custom_fields} />

          {/* Product Details */}
          <div className="mt-8 border-t pt-8">
            <h2 className="text-lg font-medium text-gray-900 mb-4">
              {t("details")}
            </h2>
            <dl className="space-y-3">
              {displaySku && (
                <div className="flex">
                  <dt className="w-32 text-gray-500 text-sm">{t("sku")}</dt>
                  <dd className="text-gray-900 text-sm">{displaySku}</dd>
                </div>
              )}
              {displayOptionsText && (
                <div className="flex">
                  <dt className="w-32 text-gray-500 text-sm">{t("options")}</dt>
                  <dd className="text-gray-900 text-sm">
                    {displayOptionsText}
                  </dd>
                </div>
              )}
            </dl>
          </div>
        </div>
      </div>
    </div>
  );
}
