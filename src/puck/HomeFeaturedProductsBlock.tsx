"use client";

import Link from "next/link";
import { ProductCard } from "@/components/puck/ProductCard";
import { usePuckProducts } from "@/components/puck/PuckProductsContext";

interface HomeFeaturedProductsBlockProps {
  title: string;
  viewAllText: string;
  viewAllUrl: string;
  columns: "2" | "3" | "4";
}

export function HomeFeaturedProductsBlock({
  title,
  viewAllText,
  viewAllUrl,
  columns,
}: HomeFeaturedProductsBlockProps) {
  const { products, basePath } = usePuckProducts();

  const gridClass =
    columns === "2"
      ? "grid-cols-1 sm:grid-cols-2"
      : columns === "3"
        ? "grid-cols-1 sm:grid-cols-2 md:grid-cols-3"
        : "grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4";

  return (
    <section className="featured-products container mx-auto px-4 py-16 sm:px-6 lg:px-8">
      <div className="mb-8 flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900">{title}</h2>

        <Link
          href={
            viewAllUrl.startsWith("/") ? `${basePath}${viewAllUrl}` : viewAllUrl
          }
          className="font-medium text-gray-900 transition-opacity hover:opacity-70"
        >
          {viewAllText} →
        </Link>
      </div>

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
              image={product.thumbnail_url || "https://placehold.co/800x800"}
              price={price}
              comparePrice={comparePrice}
              url={productUrl}
              badge=""
              radiusClass="rounded-lg"
              aspectClass="aspect-square"
            />
          );
        })}
      </div>
    </section>
  );
}
