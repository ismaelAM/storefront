"use client";

import Link from "next/link";
import { useState } from "react";
import { useCart } from "@/contexts/CartContext";

export interface PuckProductCardProps {
  name: string;
  description?: string;
  image: string;
  price: string;
  comparePrice?: string;
  url?: string;
  variantId?: string;
  badge?: string;
  cardBackgroundColor?: string;
  titleColor?: string;
  textColor?: string;
  priceColor?: string;
  buttonText?: string;
  buttonColor?: string;
  buttonTextColor?: string;
  radiusClass?: string;
  aspectClass?: string;
}

export function ProductCard({
  name,
  description,
  image,
  price,
  comparePrice,
  url,
  variantId,
  badge,
  cardBackgroundColor = "#ffffff",
  titleColor = "#111827",
  textColor = "#6b7280",
  priceColor = "#111827",
  buttonText = "Añadir al carrito",
  buttonColor = "#111827",
  buttonTextColor = "#ffffff",
  radiusClass = "rounded-lg",
  aspectClass = "aspect-square",
}: PuckProductCardProps) {
  const { addItem } = useCart();
  const [adding, setAdding] = useState(false);

  async function handleAddToCart() {
    if (!variantId || adding) {
      return;
    }

    try {
      setAdding(true);
      await addItem(variantId, 1);
    } finally {
      setAdding(false);
    }
  }

  return (
    <article
      className={`overflow-hidden shadow-sm ring-1 ring-black/5 ${radiusClass}`}
      style={{
        backgroundColor: cardBackgroundColor,
      }}
    >
      <div className={`relative w-full ${aspectClass}`}>
        <img src={image} alt={name} className="h-full w-full object-cover" />

        {badge && (
          <div className="absolute left-3 top-3 rounded-full bg-black px-3 py-1 text-xs font-semibold text-white">
            {badge}
          </div>
        )}
      </div>

      <div className="p-5">
        <h3
          className="text-lg font-semibold"
          style={{
            color: titleColor,
          }}
        >
          {name}
        </h3>

        {description && (
          <p
            className="mt-2 line-clamp-2 text-sm"
            style={{
              color: textColor,
            }}
          >
            {description}
          </p>
        )}

        <div className="mt-4 flex items-center gap-3">
          <span
            className="text-lg font-bold"
            style={{
              color: priceColor,
            }}
          >
            {price}
          </span>

          {comparePrice && (
            <span className="text-sm text-gray-400 line-through">
              {comparePrice}
            </span>
          )}
        </div>

        <div className="mt-5 flex gap-2">
          {url && (
            <Link
              href={url}
              className="inline-flex flex-1 items-center justify-center rounded-md border px-4 py-3 text-sm font-semibold transition-opacity hover:opacity-80"
            >
              Ver producto
            </Link>
          )}

          <button
            type="button"
            onClick={() => void handleAddToCart()}
            disabled={!variantId || adding}
            className="inline-flex flex-1 items-center justify-center rounded-md px-4 py-3 text-sm font-semibold transition-opacity hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-50"
            style={{
              backgroundColor: buttonColor,
              color: buttonTextColor,
            }}
          >
            {adding ? "Añadiendo..." : buttonText}
          </button>
        </div>
      </div>
    </article>
  );
}
