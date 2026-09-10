"use client";

import Link from "next/link";

export interface PuckProductCardProps {
  name: string;
  description?: string;
  image: string;
  price: string;
  comparePrice?: string;
  url: string;
  badge?: string;

  cardBackgroundColor?: string;
  titleColor?: string;
  textColor?: string;
  priceColor?: string;

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
  badge,
  cardBackgroundColor = "#ffffff",
  titleColor = "#111827",
  textColor = "#6b7280",
  priceColor = "#111827",
  radiusClass = "rounded-lg",
  aspectClass = "aspect-square",
}: PuckProductCardProps) {
  return (
    <Link
      href={url}
      className={`group block overflow-hidden shadow-sm ring-1 ring-black/5 transition-shadow hover:shadow-md ${radiusClass}`}
      style={{
        backgroundColor: cardBackgroundColor,
      }}
    >
      <article>
        <div className={`relative w-full overflow-hidden ${aspectClass}`}>
          <img
            src={image}
            alt={name}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />

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
        </div>
      </article>
    </Link>
  );
}
