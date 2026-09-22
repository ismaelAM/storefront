"use client";

import Link from "next/link";
import { usePuckProducts } from "@/components/puck/PuckProductsContext";
import { isExternalPuckUrl, resolvePuckUrl } from "@/puck/utils";

interface HomeWholesaleBlockProps {
  badge: string;
  title: string;
  description: string;
  primaryButtonText: string;
  primaryButtonUrl: string;
  secondaryButtonText: string;
  secondaryButtonUrl: string;
  pricingTitle: string;
  pricingDescription: string;
  quickOrderTitle: string;
  quickOrderDescription: string;
  ordersTitle: string;
  ordersDescription: string;
  basePath?: string;
}

export function HomeWholesaleBlock({
  badge,
  title,
  description,
  primaryButtonText,
  primaryButtonUrl,
  secondaryButtonText,
  secondaryButtonUrl,
  pricingTitle,
  pricingDescription,
  quickOrderTitle,
  quickOrderDescription,
  ordersTitle,
  ordersDescription,
}: HomeWholesaleBlockProps) {
  const { basePath } = usePuckProducts();
  const primaryUrl = resolvePuckUrl(primaryButtonUrl, basePath);
  const secondaryUrl = resolvePuckUrl(secondaryButtonUrl, basePath);

  return (
    <section className="bg-slate-900 text-slate-100">
      <div className="container mx-auto px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
        <div className="grid gap-8 lg:grid-cols-2 lg:items-center lg:gap-16">
          <div>
            {badge && (
              <span className="inline-flex items-center rounded-full bg-slate-800 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-300">
                {badge}
              </span>
            )}

            {title && (
              <h2 className="mt-4 text-2xl font-bold text-white sm:text-3xl">
                {title}
              </h2>
            )}

            {description && (
              <p className="mt-4 max-w-xl text-sm leading-7 text-slate-300 sm:text-base">
                {description}
              </p>
            )}

            <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:gap-4">
              {primaryButtonText && (
                <Link
                  href={primaryUrl}
                  target={
                    isExternalPuckUrl(primaryButtonUrl) ? "_blank" : undefined
                  }
                  rel={
                    isExternalPuckUrl(primaryButtonUrl)
                      ? "noopener noreferrer"
                      : undefined
                  }
                  className="inline-flex w-full items-center justify-center rounded-md bg-white px-6 py-3 font-semibold text-slate-900 transition-opacity hover:opacity-80 sm:w-auto"
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
                  className="inline-flex w-full items-center justify-center rounded-md border border-slate-600 bg-transparent px-6 py-3 font-semibold text-slate-100 transition-opacity hover:opacity-80 sm:w-auto"
                >
                  {secondaryButtonText}
                </Link>
              )}
            </div>
          </div>

          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
            {[
              { title: pricingTitle, description: pricingDescription },
              { title: quickOrderTitle, description: quickOrderDescription },
              { title: ordersTitle, description: ordersDescription },
            ]
              .filter((benefit) => benefit.title || benefit.description)
              .map((benefit) => (
                <li
                  key={`${benefit.title}-${benefit.description}`}
                  className="rounded-lg border border-slate-800 bg-slate-800/40 px-5 py-4"
                >
                  {benefit.title && (
                    <h3 className="font-semibold text-white">
                      {benefit.title}
                    </h3>
                  )}
                  {benefit.description && (
                    <p className="mt-1 text-sm leading-6 text-slate-300">
                      {benefit.description}
                    </p>
                  )}
                </li>
              ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
