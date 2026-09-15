"use client";

import { ProductCard } from "@/components/puck/ProductCard";
import { usePuckProducts } from "@/components/puck/PuckProductsContext";

export type ProductGridFilter = "all" | "available" | "sale";
export type ProductGridSort = "default" | "name-asc" | "price-asc" | "price-desc";

export interface PuckProductGridProps {
  title?: string;
  subtitle?: string;
  productCount?: "4" | "6" | "8";
  productFilter?: ProductGridFilter;
  productSort?: ProductGridSort;
  columns?: "2" | "3" | "4";
  imageAspect?: "square" | "4/3" | "16/9";
  cardRadius?: "none" | "small" | "medium" | "large";
  backgroundColor?: string;
  cardBackgroundColor?: string;
  titleColor?: string;
  textColor?: string;
  priceColor?: string;
  basePath?: string;
}

function parseDisplayPrice(value: string | null | undefined): number {
  if (!value) return Number.POSITIVE_INFINITY;

  const cleaned = value.replace(/[^\d,.-]/g, "");
  const lastComma = cleaned.lastIndexOf(",");
  const lastDot = cleaned.lastIndexOf(".");

  if (lastComma >= 0 && lastDot >= 0) {
    if (lastComma > lastDot) {
      return Number(cleaned.replace(/\./g, "").replace(",", "."));
    }
    return Number(cleaned.replace(/,/g, ""));
  }

  if (lastComma >= 0) {
    return Number(cleaned.replace(/\./g, "").replace(",", "."));
  }

  return Number(cleaned);
}

function isSaleProduct(product: ReturnType<typeof usePuckProducts>["products"][number]) {
  const price = parseDisplayPrice(product.price?.display_amount);
  const originalPrice = parseDisplayPrice(product.original_price?.display_amount);
  return Number.isFinite(price) && Number.isFinite(originalPrice) && originalPrice > price;
}

export function PuckProductGrid({
  title = "Nuestros productos",
  subtitle = "Descubre nuestra selección.",
  productCount = "8",
  productFilter = "all",
  productSort = "default",
  columns = "4",
  imageAspect = "square",
  cardRadius = "medium",
  backgroundColor = "#ffffff",
  cardBackgroundColor = "#ffffff",
  titleColor = "#111827",
  textColor = "#6b7280",
  priceColor = "#111827",
  basePath: basePathProp,
}: PuckProductGridProps) {
  const { products, basePath: contextBasePath } = usePuckProducts();
  const basePath = basePathProp ?? contextBasePath;

  const filteredProducts = products.filter((product) => {
    if (productFilter === "available") return product.purchasable !== false;
    if (productFilter === "sale") return isSaleProduct(product);
    return true;
  });

  const sortedProducts = [...filteredProducts].sort((a, b) => {
    if (productSort === "name-asc") {
      return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
    }
    if (productSort === "price-asc") {
      return parseDisplayPrice(a.price?.display_amount) - parseDisplayPrice(b.price?.display_amount);
    }
    if (productSort === "price-desc") {
      return parseDisplayPrice(b.price?.display_amount) - parseDisplayPrice(a.price?.display_amount);
    }
    return 0;
  });

  const visibleProducts = sortedProducts.slice(0, Number(productCount));

  const gridClass =
    columns === "2"
      ? "grid-cols-1 sm:grid-cols-2"
      : columns === "3"
        ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"
        : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4";

  const aspectClass =
    imageAspect === "4/3"
      ? "aspect-[4/3]"
      : imageAspect === "16/9"
        ? "aspect-video"
        : "aspect-square";

  const radiusClass =
    cardRadius === "none"
      ? "rounded-none"
      : cardRadius === "small"
        ? "rounded-sm"
        : cardRadius === "large"
          ? "rounded-2xl"
          : "rounded-lg";

  return (
    <section className="py-16" style={{ backgroundColor }}>
      <div className="container mx-auto px-4">
        {(title || subtitle) && (
          <div className="mb-10 text-center">
            {title && (
              <h2
                className="text-3xl font-bold md:text-4xl"
                style={{ color: titleColor }}
              >
                {title}
              </h2>
            )}
            {subtitle && (
              <p
                className="mx-auto mt-4 max-w-2xl text-lg"
                style={{ color: textColor }}
              >
                {subtitle}
              </p>
            )}
          </div>
        )}

        {visibleProducts.length === 0 ? (
          <div className="py-12 text-center">
            <p style={{ color: textColor }}>No hay productos para esta selección.</p>
          </div>
        ) : (
          <div className={`grid gap-6 ${gridClass}`}>
            {visibleProducts.map((product) => {
              const price = product.price?.display_amount ?? "";
              const comparePrice =
                product.original_price?.display_amount &&
                product.original_price.display_amount !== price
                  ? product.original_price.display_amount
                  : "";
              const productUrl = product.slug
                ? `${basePath}/products/${product.slug}`
                : `${basePath}/products`;

              return (
                <ProductCard
                  key={product.id}
                  name={product.name}
                  description=""
                  image={product.thumbnail_url || "https://placehold.co/800x800"}
                  price={price}
                  comparePrice={comparePrice}
                  url={productUrl}
                  badge=""
                  cardBackgroundColor={cardBackgroundColor}
                  titleColor={titleColor}
                  textColor={textColor}
                  priceColor={priceColor}
                  radiusClass={radiusClass}
                  aspectClass={aspectClass}
                />
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
