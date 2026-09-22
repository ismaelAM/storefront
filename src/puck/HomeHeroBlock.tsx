"use client";

import Link from "next/link";
import { usePuckProducts } from "@/components/puck/PuckProductsContext";
import {
  getPuckHeroHeightClass,
  getPuckSectionPaddingClass,
  isExternalPuckUrl,
  type PuckDensity,
  resolvePuckUrl,
} from "@/puck/utils";

interface HomeHeroBlockProps {
  title: string;
  text: string;
  primaryButtonText: string;
  primaryButtonUrl: string;
  secondaryButtonText: string;
  secondaryButtonUrl: string;
  tertiaryButtonText: string;
  tertiaryButtonUrl: string;
  titleColor: string;
  textColor: string;
  backgroundColor: string;
  density?: PuckDensity;
  basePath?: string;
}

export function HomeHeroBlock({
  title,
  text,
  primaryButtonText,
  primaryButtonUrl,
  secondaryButtonText,
  secondaryButtonUrl,
  tertiaryButtonText,
  tertiaryButtonUrl,
  titleColor,
  textColor,
  backgroundColor,
  density = "compact",
}: HomeHeroBlockProps) {
  const { basePath } = usePuckProducts();
  const primaryUrl = resolvePuckUrl(primaryButtonUrl, basePath);
  const secondaryUrl = resolvePuckUrl(secondaryButtonUrl, basePath);
  const tertiaryUrl = resolvePuckUrl(tertiaryButtonUrl, basePath);
  const heightClass = getPuckHeroHeightClass(density);
  const paddingClass = getPuckSectionPaddingClass(density);

  return (
    <section
      className={`flex items-center border-b border-border/70 ${heightClass}`}
      style={{ backgroundColor }}
    >
      <div className={`container mx-auto px-4 sm:px-6 lg:px-8 ${paddingClass}`}>
        <div className="mx-auto max-w-4xl text-center">
          {title && (
            <h1
              className="text-3xl font-bold leading-[1.05] tracking-[-0.035em] sm:text-4xl md:text-5xl lg:text-[3.5rem]"
              style={{ color: titleColor }}
            >
              {title}
            </h1>
          )}

          {text && (
            <p
              className="mx-auto mt-4 max-w-2xl whitespace-pre-line text-[15px] leading-7 sm:text-base md:text-lg md:leading-8"
              style={{ color: textColor }}
            >
              {text}
            </p>
          )}

          <div className="mt-6 flex flex-col items-stretch justify-center gap-2.5 sm:mt-7 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
            {primaryButtonText && (
              <Link
                href={primaryUrl}
                className="inline-flex w-full items-center justify-center rounded-md bg-primary px-6 py-3 text-base font-semibold text-primary-foreground shadow-sm transition-opacity hover:opacity-80 sm:w-auto sm:text-lg"
              >
                {primaryButtonText}
              </Link>
            )}

            {secondaryButtonText && (
              <Link
                href={secondaryUrl}
                target={
                  isExternalPuckUrl(secondaryButtonUrl) ? "_blank" : undefined
                }
                rel={
                  isExternalPuckUrl(secondaryButtonUrl)
                    ? "noopener noreferrer"
                    : undefined
                }
                className="inline-flex w-full items-center justify-center rounded-md border border-gray-300 bg-white px-6 py-3 text-base font-semibold text-gray-900 transition-opacity hover:opacity-80 sm:w-auto sm:text-lg"
              >
                {secondaryButtonText}
              </Link>
            )}

            {tertiaryButtonText && (
              <Link
                href={tertiaryUrl}
                target={
                  isExternalPuckUrl(tertiaryButtonUrl) ? "_blank" : undefined
                }
                rel={
                  isExternalPuckUrl(tertiaryButtonUrl)
                    ? "noopener noreferrer"
                    : undefined
                }
                className="inline-flex w-full items-center justify-center rounded-md border border-gray-300 bg-white px-6 py-3 text-base font-semibold text-gray-900 transition-opacity hover:opacity-80 sm:w-auto sm:text-lg"
              >
                {tertiaryButtonText} →
              </Link>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
