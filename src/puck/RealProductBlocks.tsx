"use client";

import Image from "next/image";
import Link from "next/link";
import { usePuckProducts } from "@/components/puck/PuckProductsContext";
import {
  getPuckAspectClass,
  getPuckRadiusClass,
  getPuckSectionPaddingClass,
} from "@/puck/utils";

function getProduct(products: ReturnType<typeof usePuckProducts>["products"], position: number) {
  if (products.length === 0) return undefined;
  return products[Math.max(0, Math.min(products.length - 1, position - 1))];
}

export interface RealProductShowcaseProps {
  productPosition: number;
  description: string;
  badge: string;
  buttonText: string;
  backgroundColor: string;
  titleColor: string;
  textColor: string;
  priceColor: string;
  buttonColor: string;
  buttonTextColor: string;
  alignment: "left" | "center" | "right";
  imagePosition: "left" | "right";
  imageAspect: "square" | "4/3" | "16/9";
  padding: "small" | "medium" | "large";
}

export function RealProductShowcase({ productPosition, description, badge, buttonText, backgroundColor, titleColor, textColor, priceColor, buttonColor, buttonTextColor, alignment, imagePosition, imageAspect, padding }: RealProductShowcaseProps) {
  const { products, basePath } = usePuckProducts();
  const product = getProduct(products, productPosition);
  if (!product) return null;
  const imageFirst = imagePosition === "left";
  const paddingClass = getPuckSectionPaddingClass(
    padding === "small" ? "compact" : padding === "large" ? "airy" : "normal",
  );
  const aspectClass = getPuckAspectClass(imageAspect);
  const alignmentClass =
    alignment === "left"
      ? "text-center sm:text-left"
      : alignment === "right"
        ? "text-center sm:text-right"
        : "text-center";
  const priceAlignmentClass =
    alignment === "left"
      ? "justify-center sm:justify-start"
      : alignment === "right"
        ? "justify-center sm:justify-end"
        : "justify-center";
  const productUrl = `${basePath}/products/${product.slug}`;
  const comparePrice =
    product.price?.display_compare_at_amount ||
    (product.original_price?.display_amount !== product.price?.display_amount
      ? product.original_price?.display_amount
      : "");
  const resolvedBadge = product.preorder
    ? "Prereserva"
    : product.in_stock && comparePrice
      ? "En stock · Oferta"
      : product.in_stock
        ? "En stock"
        : comparePrice
          ? "Oferta"
          : badge;
  return (
    <section className={`w-full ${paddingClass}`} style={{ backgroundColor }}>
      <div className="container mx-auto grid items-center gap-6 px-4 sm:px-6 sm:gap-8 lg:grid-cols-2 lg:gap-10 lg:px-8">
        <div className={imageFirst ? "" : "lg:order-2"}>
          <div className={`relative w-full overflow-hidden bg-muted ring-1 ring-black/5 ${getPuckRadiusClass("large")} ${aspectClass}`}>
            {product.thumbnail_url ? (
              <Image src={product.thumbnail_url} alt={product.name} fill sizes="(max-width: 1023px) 100vw, 50vw" className="object-cover" unoptimized />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-muted text-muted-foreground"><span className="px-6 text-center text-sm">Imagen no disponible</span></div>
            )}
            {resolvedBadge && <span className="absolute left-3 top-3 rounded-full px-3 py-1.5 text-xs font-semibold shadow-sm sm:left-5 sm:top-5" style={{ backgroundColor: "var(--highlight)", color: "var(--highlight-foreground)" }}>{resolvedBadge}</span>}
          </div>
        </div>
        <div className={`${alignmentClass} max-w-xl ${alignment === "center" ? "mx-auto" : ""}`}>
          <h2 className="text-2xl font-bold leading-tight tracking-[-0.025em] sm:text-3xl md:text-4xl" style={{ color: titleColor }}>{product.name}</h2>
          {description && <p className="mt-3 text-sm leading-6 sm:mt-4 sm:text-base sm:leading-7" style={{ color: textColor }}>{description}</p>}
          <div className={`mt-5 flex flex-wrap items-baseline gap-x-3 gap-y-1 sm:mt-6 sm:gap-4 ${priceAlignmentClass}`}>
            <span className="text-xl font-bold sm:text-2xl" style={{ color: priceColor }}>{product.price?.display_amount ?? ""}</span>
            {comparePrice && <span className="text-base text-gray-400 line-through sm:text-lg">{comparePrice}</span>}
          </div>
          {buttonText && <Link href={productUrl} className="mt-6 inline-flex w-full items-center justify-center rounded-lg px-5 py-3 text-sm font-semibold shadow-sm transition-[opacity,transform] hover:-translate-y-0.5 hover:opacity-90 sm:mt-7 sm:w-auto sm:px-6" style={{ backgroundColor: buttonColor, color: buttonTextColor }}>{product.preorder ? "Reservar" : buttonText}</Link>}
        </div>
      </div>
    </section>
  );
}
