"use client";

import Image from "next/image";
import Link from "next/link";

export interface PuckProductCardProps {
  name: string;
  description?: string;
  image?: string;
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
  image = "",
  price,
  comparePrice,
  url,
  badge,
  cardBackgroundColor = "var(--surface)",
  titleColor = "var(--text)",
  textColor = "var(--text-muted)",
  priceColor = "var(--text)",
  radiusClass = "rounded-lg",
  aspectClass = "aspect-square",
}: PuckProductCardProps) {
  return (
    <Link
      href={url}
      className={`group block overflow-hidden shadow-sm ring-1 ring-border/70 transition-[box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:shadow-md ${radiusClass}`}
      style={{ backgroundColor: cardBackgroundColor }}
    >
      <article>
        <div
          className={`relative w-full overflow-hidden bg-muted ${aspectClass}`}
        >
          {image ? (
            <Image
              src={image}
              alt={name}
              fill
              sizes="(max-width: 639px) 50vw, (max-width: 1023px) 33vw, 25vw"
              className="object-cover transition-transform duration-300 group-hover:scale-105"
              unoptimized
            />
          ) : (
            <div
              aria-hidden="true"
              className="flex h-full w-full items-center justify-center bg-muted text-muted-foreground"
            >
              <span className="px-4 text-center text-xs font-medium sm:text-sm">
                Imagen no disponible
              </span>
            </div>
          )}
          {badge && (
            <div
              className="absolute left-2 top-2 rounded-full px-2.5 py-1 text-[11px] font-semibold shadow-sm sm:left-3 sm:top-3 sm:px-3 sm:text-xs"
              style={{
                backgroundColor: "var(--primary)",
                color: "var(--primary-foreground)",
              }}
            >
              {badge}
            </div>
          )}
        </div>
        <div className="p-3 sm:p-4 lg:p-5">
          <h3
            className="text-sm font-semibold leading-5 sm:text-lg sm:leading-6"
            style={{ color: titleColor }}
          >
            {name}
          </h3>
          {description && (
            <p
              className="mt-1.5 line-clamp-2 text-xs leading-5 sm:mt-2 sm:text-sm"
              style={{ color: textColor }}
            >
              {description}
            </p>
          )}
          <div className="mt-2.5 flex flex-wrap items-baseline gap-x-2 gap-y-1 sm:mt-4 sm:gap-3">
            <span
              className="text-base font-bold sm:text-lg"
              style={{ color: priceColor }}
            >
              {price}
            </span>
            {comparePrice && (
              <span
                className="text-xs line-through sm:text-sm"
                style={{ color: "var(--text-muted)" }}
              >
                {comparePrice}
              </span>
            )}
          </div>
        </div>
      </article>
    </Link>
  );
}
