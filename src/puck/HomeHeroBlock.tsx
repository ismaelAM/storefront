"use client";

import Link from "next/link";
import { usePuckProducts } from "@/components/puck/PuckProductsContext";
import { isExternalPuckUrl, resolvePuckUrl } from "@/puck/utils";

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
}: HomeHeroBlockProps) {
  const { basePath } = usePuckProducts();
  const primaryUrl = resolvePuckUrl(primaryButtonUrl, basePath);
  const secondaryUrl = resolvePuckUrl(secondaryButtonUrl, basePath);
  const tertiaryUrl = resolvePuckUrl(tertiaryButtonUrl, basePath);

  return (
    <section
      className="flex min-h-[560px] items-center border-b border-gray-200 sm:min-h-[620px] md:min-h-[680px] lg:min-h-[720px]"
      style={{ backgroundColor }}
    >
      <div className="container mx-auto px-4 py-10 sm:px-6 sm:py-16 lg:px-8 lg:py-24">
        <div className="mx-auto max-w-4xl text-center">
          {title && (
            <h1
              className="text-3xl font-bold leading-tight tracking-tight sm:text-4xl md:text-5xl lg:text-6xl"
              style={{ color: titleColor }}
            >
              {title}
            </h1>
          )}

          {text && (
            <p
              className="mx-auto mt-4 max-w-2xl text-base leading-7 sm:mt-5 sm:text-lg md:text-xl md:leading-8"
              style={{ color: textColor }}
            >
              {text}
            </p>
          )}

          <div className="mt-7 flex flex-col items-stretch justify-center gap-3 sm:mt-8 sm:flex-row sm:flex-wrap sm:items-center sm:gap-4">
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
                target={isExternalPuckUrl(secondaryButtonUrl) ? "_blank" : undefined}
                rel={isExternalPuckUrl(secondaryButtonUrl) ? "noopener noreferrer" : undefined}
                className="inline-flex w-full items-center justify-center rounded-md border border-gray-300 bg-white px-6 py-3 text-base font-semibold text-gray-900 transition-opacity hover:opacity-80 sm:w-auto sm:text-lg"
              >
                {secondaryButtonText}
              </Link>
            )}

            {tertiaryButtonText && (
              <Link
                href={tertiaryUrl}
                target={isExternalPuckUrl(tertiaryButtonUrl) ? "_blank" : undefined}
                rel={isExternalPuckUrl(tertiaryButtonUrl) ? "noopener noreferrer" : undefined}
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
