"use client";

import Link from "next/link";
import { usePuckProducts } from "@/components/puck/PuckProductsContext";

function getProduct(products: ReturnType<typeof usePuckProducts>["products"], position: number) {
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

export function RealProductShowcase({
  productPosition,
  description,
  badge,
  buttonText,
  backgroundColor,
  titleColor,
  textColor,
  priceColor,
  buttonColor,
  buttonTextColor,
  alignment,
  imagePosition,
  imageAspect,
  padding,
}: RealProductShowcaseProps) {
  const { products, basePath } = usePuckProducts();
  const product = getProduct(products, productPosition);

  if (!product) {
    return null;
  }

  const imageFirst = imagePosition === "left";
  const paddingClass =
    padding === "small" ? "py-8" : padding === "large" ? "py-20" : "py-14";
  const aspectClass =
    imageAspect === "4/3"
      ? "aspect-[4/3]"
      : imageAspect === "16/9"
        ? "aspect-video"
        : "aspect-square";
  const alignmentClass =
    alignment === "left"
      ? "text-left"
      : alignment === "right"
        ? "text-right"
        : "text-center";
  const productUrl = `${basePath}/products/${product.slug}`;

  return (
    <section className={`w-full ${paddingClass}`} style={{ backgroundColor }}>
      <div className="container mx-auto grid items-center gap-10 px-4 sm:px-6 lg:grid-cols-2 lg:px-8">
        <div className={imageFirst ? "" : "lg:order-2"}>
          <div className="relative overflow-hidden rounded-2xl bg-gray-100">
            <img
              src={product.thumbnail_url || "https://placehold.co/1200x1000"}
              alt={product.name}
              className={`w-full object-cover ${aspectClass}`}
            />
            {badge && (
              <span className="absolute left-5 top-5 rounded-full bg-black px-4 py-2 text-sm font-semibold text-white">
                {badge}
              </span>
            )}
          </div>
        </div>

        <div className={`${alignmentClass} max-w-xl ${alignment === "center" ? "mx-auto" : ""}`}>
          <h2 className="text-4xl font-bold tracking-tight md:text-5xl" style={{ color: titleColor }}>
            {product.name}
          </h2>
          {description && (
            <p className="mt-5 text-lg leading-8" style={{ color: textColor }}>
              {description}
            </p>
          )}
          <div className={`mt-7 flex items-center gap-4 ${alignment === "center" ? "justify-center" : alignment === "right" ? "justify-end" : "justify-start"}`}>
            <span className="text-3xl font-bold" style={{ color: priceColor }}>
              {product.price?.display_amount ?? ""}
            </span>
            {product.original_price?.display_amount && product.original_price.display_amount !== product.price?.display_amount && (
              <span className="text-lg text-gray-400 line-through">
                {product.original_price.display_amount}
              </span>
            )}
          </div>
          {buttonText && (
            <Link
              href={productUrl}
              className="mt-8 inline-flex rounded-md px-7 py-4 font-semibold transition-opacity hover:opacity-80"
              style={{ backgroundColor: buttonColor, color: buttonTextColor }}
            >
              {buttonText}
            </Link>
          )}
        </div>
      </div>
    </section>
  );
}

export interface RealProductCarouselProps {
  productCount: number;
  columns: "1" | "2" | "3" | "4";
  title: string;
  subtitle: string;
  backgroundColor: string;
  titleColor: string;
  textColor: string;
  priceColor: string;
  cardBackgroundColor: string;
  alignment: "left" | "center" | "right";
}

export function RealProductCarousel({
  productCount,
  columns,
  title,
  subtitle,
  backgroundColor,
  titleColor,
  textColor,
  priceColor,
  cardBackgroundColor,
  alignment,
}: RealProductCarouselProps) {
  const { products, basePath } = usePuckProducts();
  const visibleProducts = products.slice(0, Math.max(1, Math.min(productCount, products.length)));
  const gridClass =
    columns === "1"
      ? "grid-cols-1"
      : columns === "2"
        ? "grid-cols-1 sm:grid-cols-2"
        : columns === "3"
          ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"
          : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4";
  const alignmentClass =
    alignment === "left" ? "text-left" : alignment === "right" ? "text-right" : "text-center";

  return (
    <section className="w-full py-14" style={{ backgroundColor }}>
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        {(title || subtitle) && (
          <div className={`mb-8 ${alignmentClass}`}>
            {title && <h2 className="text-3xl font-bold" style={{ color: titleColor }}>{title}</h2>}
            {subtitle && <p className="mt-3 text-lg" style={{ color: textColor }}>{subtitle}</p>}
          </div>
        )}
        <div className={`grid gap-6 ${gridClass}`}>
          {visibleProducts.map((product) => (
            <Link
              key={product.id}
              href={`${basePath}/products/${product.slug}`}
              className="overflow-hidden rounded-xl border border-black/5 transition-transform hover:-translate-y-1"
              style={{ backgroundColor: cardBackgroundColor }}
            >
              <img
                src={product.thumbnail_url || "https://placehold.co/800x800"}
                alt={product.name}
                className="aspect-square w-full object-cover"
              />
              <div className="p-5">
                <h3 className="font-semibold" style={{ color: titleColor }}>{product.name}</h3>
                <span className="mt-2 block font-semibold" style={{ color: priceColor }}>
                  {product.price?.display_amount ?? ""}
                </span>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
