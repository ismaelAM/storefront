"use client";

import Image from "next/image";
import Link from "next/link";
import { usePuckProducts } from "@/components/puck/PuckProductsContext";
import { getPuckAspectClass, getPuckRadiusClass } from "@/puck/utils";

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
  const paddingClass = padding === "small" ? "py-8 sm:py-10" : padding === "large" ? "py-12 sm:py-16 lg:py-20" : "py-10 sm:py-14";
  const aspectClass = getPuckAspectClass(imageAspect);
  const alignmentClass = alignment === "left" ? "text-left" : alignment === "right" ? "text-right" : "text-center";
  const productUrl = `${basePath}/products/${product.slug}`;
  return (
    <section className={`w-full ${paddingClass}`} style={{ backgroundColor }}>
      <div className="container mx-auto grid items-center gap-8 px-4 sm:px-6 md:gap-10 lg:grid-cols-2 lg:px-8">
        <div className={imageFirst ? "" : "lg:order-2"}>
          <div className={`relative w-full overflow-hidden bg-gray-100 ${getPuckRadiusClass("large")} ${aspectClass}`}>
            {product.thumbnail_url ? (
              <Image src={product.thumbnail_url} alt={product.name} fill sizes="(max-width: 1023px) 100vw, 50vw" className="object-cover" unoptimized />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-muted text-muted-foreground"><span className="px-6 text-center text-sm">Imagen no disponible</span></div>
            )}
            {badge && <span className="absolute left-3 top-3 rounded-full bg-black px-3 py-1.5 text-xs font-semibold text-white sm:left-5 sm:top-5 sm:px-4 sm:py-2 sm:text-sm">{badge}</span>}
          </div>
        </div>
        <div className={`${alignmentClass} max-w-xl ${alignment === "center" ? "mx-auto" : ""}`}>
          <h2 className="text-3xl font-bold leading-tight tracking-tight sm:text-4xl md:text-5xl" style={{ color: titleColor }}>{product.name}</h2>
          {description && <p className="mt-4 text-base leading-7 sm:mt-5 sm:text-lg sm:leading-8" style={{ color: textColor }}>{description}</p>}
          <div className={`mt-6 flex flex-wrap items-baseline gap-x-3 gap-y-1 sm:mt-7 sm:gap-4 ${alignment === "center" ? "justify-center" : alignment === "right" ? "justify-end" : "justify-start"}`}>
            <span className="text-2xl font-bold sm:text-3xl" style={{ color: priceColor }}>{product.price?.display_amount ?? ""}</span>
            {product.original_price?.display_amount && product.original_price.display_amount !== product.price?.display_amount && <span className="text-base text-gray-400 line-through sm:text-lg">{product.original_price.display_amount}</span>}
          </div>
          {buttonText && <Link href={productUrl} className="mt-7 inline-flex w-full items-center justify-center rounded-md px-6 py-3.5 font-semibold transition-opacity hover:opacity-80 sm:mt-8 sm:w-auto sm:px-7 sm:py-4" style={{ backgroundColor: buttonColor, color: buttonTextColor }}>{buttonText}</Link>}
        </div>
      </div>
    </section>
  );
}
