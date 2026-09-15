"use client";

import { ProductCard } from "@/components/puck/ProductCard";
import { usePuckProducts } from "@/components/puck/PuckProductsContext";
import {
  getPuckAspectClass,
  getPuckGridColumnsClass,
  getPuckRadiusClass,
} from "@/puck/utils";

export type ProductGridFilter = "all" | "available" | "sale";

export interface PuckProductGridProps {
  title?: string;
  subtitle?: string;
  productCount?: "4" | "6" | "8";
  productFilter?: ProductGridFilter;
  variantFilter?: string;
  columns?: "2" | "3" | "4";
  imageAspect?: "square" | "4/3" | "16/9";
  cardRadius?: "none" | "small" | "medium" | "large";
  backgroundColor?: string;
  cardBackgroundColor?: string;
  titleColor?: string;
  textColor?: string;
  priceColor?: string;
  /** Kept for backwards-compatible saved Puck data; the provider is authoritative. */
  basePath?: string;
}

type VariantOptionValue = {
  name?: string;
  option_type?: { name?: string };
};

type ProductWithVariantOptions = Omit<ReturnType<typeof usePuckProducts>["products"][number], "option_values"> & {
  option_values?: VariantOptionValue[];
};

function parseDisplayPrice(value: string | null | undefined): number {
  if (!value) return Number.POSITIVE_INFINITY;

  const cleaned = value.replace(/[^\d,.-]/g, "");
  const lastComma = cleaned.lastIndexOf(",");
  const lastDot = cleaned.lastIndexOf(".");

  if (lastComma >= 0 && lastDot >= 0) {
    return lastComma > lastDot
      ? Number(cleaned.replace(/\./g, "").replace(",", "."))
      : Number(cleaned.replace(/,/g, ""));
  }

  if (lastComma >= 0) {
    return Number(cleaned.replace(/\./g, "").replace(",", "."));
  }

  return Number(cleaned);
}

function isSaleProduct(product: ProductWithVariantOptions): boolean {
  const price = parseDisplayPrice(product.price?.display_amount);
  const originalPrice = parseDisplayPrice(product.original_price?.display_amount);
  return Number.isFinite(price) && Number.isFinite(originalPrice) && originalPrice > price;
}

function matchesVariant(product: ProductWithVariantOptions, query: string): boolean {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  if (!normalizedQuery) return true;

  return (product.option_values ?? []).some((option) =>
    [option.name, option.option_type?.name]
      .filter((value): value is string => Boolean(value))
      .some((value) => value.toLocaleLowerCase().includes(normalizedQuery)),
  );
}

export function PuckProductGrid({
  title = "Nuestros productos",
  subtitle = "Descubre nuestra selección.",
  productCount = "8",
  productFilter = "all",
  variantFilter = "",
  columns = "4",
  imageAspect = "square",
  cardRadius = "medium",
  backgroundColor = "#ffffff",
  cardBackgroundColor = "#ffffff",
  titleColor = "#111827",
  textColor = "#6b7280",
  priceColor = "#111827",
}: PuckProductGridProps) {
  const { products, basePath } = usePuckProducts();

  const filteredProducts = (products as ProductWithVariantOptions[]).filter((product) => {
    if (productFilter === "available" && product.purchasable === false) return false;
    if (productFilter === "sale" && !isSaleProduct(product)) return false;
    return matchesVariant(product, variantFilter);
  });

  const visibleProducts = filteredProducts.slice(0, Number(productCount));
  const gridClass = getPuckGridColumnsClass(columns);
  const aspectClass = getPuckAspectClass(imageAspect);
  const radiusClass = getPuckRadiusClass(cardRadius);

  return (
    <section className="py-10 sm:py-14 lg:py-16" style={{ backgroundColor }}>
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        {(title || subtitle) && (
          <div className="mx-auto mb-8 max-w-3xl text-center sm:mb-10">
            {title && (
              <h2
                className="text-2xl font-bold tracking-tight sm:text-3xl md:text-4xl"
                style={{ color: titleColor }}
              >
                {title}
              </h2>
            )}
            {subtitle && (
              <p
                className="mx-auto mt-3 max-w-2xl text-sm leading-6 sm:mt-4 sm:text-base md:text-lg"
                style={{ color: textColor }}
              >
                {subtitle}
              </p>
            )}
          </div>
        )}

        {visibleProducts.length === 0 ? (
          <div className="py-10 text-center sm:py-12">
            <p className="text-sm sm:text-base" style={{ color: textColor }}>
              No hay productos para esta selección.
            </p>
          </div>
        ) : (
          <div className={`grid gap-3 sm:gap-5 lg:gap-6 ${gridClass}`}>
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
                  image={product.thumbnail_url || ""}
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
