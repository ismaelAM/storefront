"use client";

import type { Product } from "@spree/sdk";
import { ProductCard } from "@/components/puck/ProductCard";
import { usePuckProducts } from "@/components/puck/PuckProductsContext";
import { getPuckAspectClass, getPuckGridColumnsClass, getPuckRadiusClass } from "@/puck/utils";

export type ProductGridFilter = "all" | "available" | "sale";
export interface PuckProductGridProps {
  title?: string;
  subtitle?: string;
  productCount?: "4" | "6" | "8" | "12" | "16" | "20";
  productFilter?: ProductGridFilter;
  selectedProductIds?: string[];
  selectedCategoryIds?: string[];
  selectedVariantIds?: string[];
  variantFilter?: string;
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

type CategoryRef = { id?: string; permalink?: string };
type VariantRef = { id?: string; sku?: string; options_text?: string };
type ProductWithRelations = Product & { categories?: CategoryRef[]; variants?: VariantRef[]; };

function parseDisplayPrice(value: string | null | undefined): number {
  if (!value) return Number.POSITIVE_INFINITY;
  const cleaned = value.replace(/[^\d,.-]/g, "");
  const lastComma = cleaned.lastIndexOf(",");
  const lastDot = cleaned.lastIndexOf(".");
  if (lastComma >= 0 && lastDot >= 0) return lastComma > lastDot ? Number(cleaned.replace(/\./g, "").replace(",", ".")) : Number(cleaned.replace(/,/g, ""));
  if (lastComma >= 0) return Number(cleaned.replace(/\./g, "").replace(",", "."));
  return Number(cleaned);
}
function isSaleProduct(product: ProductWithRelations): boolean {
  const price = parseDisplayPrice(product.price?.display_amount);
  const originalPrice = parseDisplayPrice(product.original_price?.display_amount);
  return Number.isFinite(price) && Number.isFinite(originalPrice) && originalPrice > price;
}
function matchesVariantIds(product: ProductWithRelations, ids: string[]): boolean {
  if (ids.length === 0) return true;
  return (product.variants ?? []).some((variant) => Boolean(variant.id && ids.includes(variant.id)));
}
function matchesCategoryIds(product: ProductWithRelations, ids: string[]): boolean {
  if (ids.length === 0) return true;
  return (product.categories ?? []).some((category) => ids.includes(category.id ?? "") || ids.includes(category.permalink ?? ""));
}
function matchesVariantText(product: ProductWithRelations, query: string): boolean {
  const normalized = query.trim().toLocaleLowerCase();
  if (!normalized) return true;
  return (product.variants ?? []).some((variant) => `${variant.sku ?? ""} ${variant.options_text ?? ""}`.toLocaleLowerCase().includes(normalized));
}

export function PuckProductGrid({ title = "Nuestros productos", subtitle = "Descubre nuestra selección.", productCount = "8", productFilter = "all", selectedProductIds = [], selectedCategoryIds = [], selectedVariantIds = [], variantFilter = "", columns = "4", imageAspect = "square", cardRadius = "medium", backgroundColor = "#ffffff", cardBackgroundColor = "#ffffff", titleColor = "#111827", textColor = "#6b7280", priceColor = "#111827" }: PuckProductGridProps) {
  const { products, basePath } = usePuckProducts();
  const filteredProducts = (products as ProductWithRelations[]).filter((product) => {
    if (selectedProductIds.length > 0 && !selectedProductIds.includes(product.id)) return false;
    if (!matchesCategoryIds(product, selectedCategoryIds)) return false;
    if (!matchesVariantIds(product, selectedVariantIds)) return false;
    if (productFilter === "available" && product.purchasable === false) return false;
    if (productFilter === "sale" && !isSaleProduct(product)) return false;
    if (!matchesVariantText(product, variantFilter)) return false;
    return true;
  });
  const visibleProducts = filteredProducts.slice(0, Number(productCount));
  const gridClass = getPuckGridColumnsClass(columns);
  const aspectClass = getPuckAspectClass(imageAspect);
  const radiusClass = getPuckRadiusClass(cardRadius);

  return <section className="py-10 sm:py-14 lg:py-16" style={{ backgroundColor }}><div className="container mx-auto px-4 sm:px-6 lg:px-8">{(title || subtitle) && <div className="mx-auto mb-8 max-w-3xl text-center sm:mb-10">{title && <h2 className="text-2xl font-bold tracking-tight sm:text-3xl md:text-4xl" style={{ color: titleColor }}>{title}</h2>}{subtitle && <p className="mx-auto mt-3 max-w-2xl text-sm leading-6 sm:mt-4 sm:text-base md:text-lg" style={{ color: textColor }}>{subtitle}</p>}</div>}{visibleProducts.length === 0 ? <div className="py-10 text-center sm:py-12"><p className="text-sm sm:text-base" style={{ color: textColor }}>No hay productos para esta selección.</p></div> : <div className={`grid gap-3 sm:gap-5 lg:gap-6 ${gridClass}`}>{visibleProducts.map((product) => { const price = product.price?.display_amount ?? ""; const comparePrice = product.original_price?.display_amount && product.original_price.display_amount !== price ? product.original_price.display_amount : ""; const productUrl = product.slug ? `${basePath}/products/${product.slug}` : `${basePath}/products`; return <ProductCard key={product.id} name={product.name} image={product.thumbnail_url || ""} price={price} comparePrice={comparePrice} url={productUrl} badge={product.preorder ? "Prereserva" : ""} cardBackgroundColor={cardBackgroundColor} titleColor={titleColor} textColor={textColor} priceColor={priceColor} radiusClass={radiusClass} aspectClass={aspectClass} />; })}</div>}</div></section>;
}
