"use client";

import { ProductCard } from "@/components/puck/ProductCard";
import { usePuckProducts } from "@/components/puck/PuckProductsContext";

interface PuckProductGridProps {
  title?: string;
  subtitle?: string;
  columns?: "2" | "3" | "4";
  imageAspect?: "square" | "4/3" | "16/9";
  cardRadius?: "none" | "small" | "medium" | "large";
  backgroundColor?: string;
  cardBackgroundColor?: string;
  titleColor?: string;
  textColor?: string;
  priceColor?: string;
  buttonText?: string;
  buttonColor?: string;
  buttonTextColor?: string;
  basePath?: string;
}

export function PuckProductGrid({
  title = "Nuestros productos",
  subtitle = "Descubre nuestra selección.",
  columns = "4",
  imageAspect = "square",
  cardRadius = "medium",
  backgroundColor = "#ffffff",
  cardBackgroundColor = "#ffffff",
  titleColor = "#111827",
  textColor = "#6b7280",
  priceColor = "#111827",
  buttonText = "Añadir al carrito",
  buttonColor = "#111827",
  buttonTextColor = "#ffffff",
}: PuckProductGridProps) {
  const { products, basePath } = usePuckProducts();

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

        {products.length === 0 ? (
          <div className="py-12 text-center">
            <p style={{ color: textColor }}>No hay productos disponibles.</p>
          </div>
        ) : (
          <div className={`grid gap-6 ${gridClass}`}>
            {products.map((product) => {
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
                  image={
                    product.thumbnail_url || "https://placehold.co/800x800"
                  }
                  price={price}
                  comparePrice={comparePrice}
                  url={productUrl}
                  variantId={product.default_variant_id || undefined}
                  badge=""
                  cardBackgroundColor={cardBackgroundColor}
                  titleColor={titleColor}
                  textColor={textColor}
                  priceColor={priceColor}
                  buttonText={buttonText}
                  buttonColor={buttonColor}
                  buttonTextColor={buttonTextColor}
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
