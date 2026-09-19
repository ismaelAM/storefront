"use client";

import { ProductCard } from "@/components/puck/ProductCard";
import { usePuckProducts } from "@/components/puck/PuckProductsContext";
import { getPuckGridColumnsClass, getPuckRadiusClass } from "@/puck/utils";

interface HomeFeaturedProductsBlockProps {
  title: string;
  columns: "2" | "3" | "4";
}

export function HomeFeaturedProductsBlock({ title, columns }: HomeFeaturedProductsBlockProps) {
  const { products, basePath } = usePuckProducts();
  const gridClass = getPuckGridColumnsClass(columns);

  return (
    <section className="featured-products container mx-auto px-4 py-10 sm:px-6 sm:py-14 lg:px-8 lg:py-16">
      <div className="mb-6 sm:mb-8">
        <h2 className="text-xl font-bold tracking-tight text-gray-900 sm:text-2xl">{title}</h2>
      </div>
      {products.length === 0 ? (
        <div className="py-10 text-center sm:py-12"><p className="text-sm text-gray-500">No hay productos disponibles.</p></div>
      ) : (
        <div className={`grid gap-3 sm:gap-5 lg:gap-6 ${gridClass}`}>
          {products.map((product) => {
            const price = product.price?.display_amount ?? "";
            const comparePrice = product.original_price?.display_amount && product.original_price.display_amount !== price ? product.original_price.display_amount : "";
            const productUrl = product.slug ? `${basePath}/products/${product.slug}` : `${basePath}/products`;
            return <ProductCard key={product.id} name={product.name} image={product.thumbnail_url || ""} price={price} comparePrice={comparePrice} url={productUrl} badge={product.preorder ? "Prereserva" : ""} radiusClass={getPuckRadiusClass("medium")} aspectClass="aspect-square" />;
          })}
        </div>
      )}
    </section>
  );
}
