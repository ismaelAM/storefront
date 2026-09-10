"use client";

import { ProductCard } from "@/components/puck/ProductCard";

interface PuckProduct {
  name: string;
  description: string;
  image: string;
  price: string;
  comparePrice: string;
  url: string;
  badge: string;
  variantId?: string;
}

interface PuckProductGridProps {
  basePath: string;
  title?: string;
  subtitle?: string;
  products?: PuckProduct[];

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
}

const DEFAULT_PRODUCTS: PuckProduct[] = [
  {
    name: "Producto uno",
    description: "Descripción del producto.",
    image: "https://placehold.co/800x800",
    price: "29,99 €",
    comparePrice: "",
    url: "/products",
    badge: "",
  },
  {
    name: "Producto dos",
    description: "Descripción del producto.",
    image: "https://placehold.co/800x800",
    price: "39,99 €",
    comparePrice: "",
    url: "/products",
    badge: "Nuevo",
  },
  {
    name: "Producto tres",
    description: "Descripción del producto.",
    image: "https://placehold.co/800x800",
    price: "49,99 €",
    comparePrice: "59,99 €",
    url: "/products",
    badge: "Oferta",
  },
  {
    name: "Producto cuatro",
    description: "Descripción del producto.",
    image: "https://placehold.co/800x800",
    price: "24,99 €",
    comparePrice: "",
    url: "/products",
    badge: "",
  },
];

export function PuckProductGrid({
  title = "Nuestros productos",
  subtitle = "Descubre nuestra selección.",
  products = DEFAULT_PRODUCTS,
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
    <section
      className="py-16"
      style={{
        backgroundColor,
      }}
    >
      <div className="container mx-auto px-4">
        {(title || subtitle) && (
          <div className="mb-10 text-center">
            {title && (
              <h2
                className="text-3xl font-bold md:text-4xl"
                style={{
                  color: titleColor,
                }}
              >
                {title}
              </h2>
            )}

            {subtitle && (
              <p
                className="mx-auto mt-4 max-w-2xl text-lg"
                style={{
                  color: textColor,
                }}
              >
                {subtitle}
              </p>
            )}
          </div>
        )}

        <div className={`grid gap-6 ${gridClass}`}>
          {products.map((product, index) => (
            <ProductCard
              key={`${product.name}-${index}`}
              name={product.name}
              description={product.description}
              image={product.image}
              price={product.price}
              comparePrice={product.comparePrice}
              url={product.url}
              variantId={product.variantId}
              badge={product.badge}
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
          ))}
        </div>
      </div>
    </section>
  );
}
