"use client";

import Link from "next/link";
import { ProductCard } from "@/components/puck/ProductCard";
import { usePuckProducts } from "@/components/puck/PuckProductsContext";
import { getPuckGridColumnsClass, getPuckRadiusClass, resolvePuckUrl } from "@/puck/utils";

interface HomeFeaturedProductsBlockProps {
  title: string;
  viewAllText: string;
  viewAllUrl: string;
  columns: "2" | "3" | "4";
}

export function HomeFeaturedProductsBlock({ title, viewAllText, viewAllUrl, columns }: HomeFeaturedProductsBlockProps) {
  const { products, basePath } = usePuckProducts();
  const gridClass = getPuckGridColumnsClass(columns);
  const viewAllHref = resolvePuckUrl(viewAllUrl, basePath);

  return (
    <section className="featured-products container mx-auto px-4 py-10 sm:px-6 sm:py-14 lg:px-8 lg:py-16">
      <div className="mb-6 flex items-end justify-between gap-4 sm:mb-8">
        <h2 className="text-xl font-bold tracking-tight text-gray-900 sm:text-2xl">{title}</h2>
        {viewAllText && (
          <Link href={viewAllHref} className="shrink-0 text-sm font-medium text-gray-900 transition-opacity hover:opacity-70 sm:text-base">
            {viewAllText} →
          </Link>
        )}
      </div>
      {products.length === 0 ? (
        <div className="py-10 text-center sm:py-12"><p className="text-sm text-gray-500">No hay productos disponibles.</p></div>
      ) : (
        <div className={`grid gap-3 sm:gap-5 lg:gap-6 ${gridClass}`}>
          {products.map((product) => {
            const price = product.price?.display_amount ?? "";
            const comparePrice = product.original_price?.display_amount && product.original_price.display_amount !== price ? product.original_price.display_amount : "";
            const productUrl = product.slug ? `${basePath}/products/${product.slug}` : `${basePath}/products`;
            return <ProductCard key={product.id} name={product.name} image={product.thumbnail_url || ""} price={price} comparePrice={comparePrice} url={productUrl} radiusClass={getPuckRadiusClass("medium")} aspectClass="aspect-square" />;
          })}
        </div>
      )}
    </section>
  );
}
