"use client";

import Link from "next/link";

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
  basePath: string;
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
  basePath,
}: HomeHeroBlockProps) {
  const resolveUrl = (url: string) =>
    url.startsWith("/") && !url.startsWith(basePath)
      ? `${basePath}${url}`
      : url;

  return (
    <section
      className="flex min-h-[823px] items-center border-b border-gray-200 md:min-h-0"
      style={{ backgroundColor }}
    >
      <div className="container mx-auto px-4 py-12 sm:px-6 md:py-24 lg:px-8">
        <div className="text-center">
          <h1
            className="text-4xl font-bold tracking-tight md:text-5xl"
            style={{ color: titleColor }}
          >
            {title}
          </h1>

          <p
            className="mx-auto mt-4 max-w-2xl text-lg"
            style={{ color: textColor }}
          >
            {text}
          </p>

          <div className="mt-8 flex flex-wrap justify-center gap-4">
            {primaryButtonText && (
              <Link
                href={resolveUrl(primaryButtonUrl)}
                className="inline-flex items-center rounded-md bg-black px-6 py-3 text-lg font-semibold text-white transition-opacity hover:opacity-80"
              >
                {primaryButtonText}
              </Link>
            )}

            {secondaryButtonText && (
              <Link
                href={secondaryButtonUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center rounded-md border border-gray-300 bg-white px-6 py-3 text-lg font-semibold text-gray-900 transition-opacity hover:opacity-80"
              >
                {secondaryButtonText}
              </Link>
            )}

            {tertiaryButtonText && (
              <Link
                href={tertiaryButtonUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center rounded-md border border-gray-300 bg-white px-6 py-3 text-lg font-semibold text-gray-900 transition-opacity hover:opacity-80"
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
