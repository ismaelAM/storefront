"use client";

import { ProductCard } from "@/components/puck/ProductCard";
import { usePuckProducts } from "@/components/puck/PuckProductsContext";

interface CategoryProductGridBlockProps {
  title: string;
  subtitle: string;
  columns: "2" | "3" | "4";
  imageAspect: "square" | "4/3" | "16/9";
  alignment: "left" | "center" | "right";
  backgroundColor: string;
  titleColor: string;
  textColor: string;
  priceColor: string;
  cardBackgroundColor: string;
}

export function CategoryProductGridBlock({
  title,
  subtitle,
  columns,
  imageAspect,
  alignment,
  backgroundColor,
  titleColor,
  textColor,
  priceColor,
  cardBackgroundColor,
}: CategoryProductGridBlockProps) {
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

  const alignmentClass =
    alignment === "left"
      ? "text-left"
      : alignment === "right"
        ? "text-right"
        : "text-center";

  return (
    <section className="w-full py-14" style={{ backgroundColor }}>
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        {(title || subtitle) && (
          <div className={`mb-8 ${alignmentClass}`}>
            {title && (
              <h2 className="text-3xl font-bold" style={{ color: titleColor }}>
                {title}
              </h2>
            )}
            {subtitle && (
              <p className="mt-3 text-lg" style={{ color: textColor }}>
                {subtitle}
              </p>
            )}
          </div>
        )}

        <div className={`grid gap-6 ${gridClass}`}>
          {products.map((product) => (
            <ProductCard
              key={product.id}
              name={product.name}
              description=""
              image={product.thumbnail_url || "https://placehold.co/800x800"}
              price={product.price?.display_amount ?? ""}
              comparePrice={product.original_price?.display_amount ?? ""}
              url={
                product.slug
                  ? `${basePath}/products/${product.slug}`
                  : `${basePath}/products`
              }
              badge=""
              cardBackgroundColor={cardBackgroundColor}
              titleColor={titleColor}
              textColor={textColor}
              priceColor={priceColor}
              radiusClass="rounded-lg"
              aspectClass={aspectClass}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
