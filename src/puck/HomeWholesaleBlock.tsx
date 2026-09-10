"use client";

import Link from "next/link";

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
  basePath: string;
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
  basePath,
}: HomeWholesaleBlockProps) {
  return (
    <section className="bg-slate-900 text-slate-100">
      <div className="container mx-auto px-4 py-16 sm:px-6 lg:px-8">
        <div className="grid gap-10 lg:grid-cols-2 lg:items-center lg:gap-16">
          <div>
            <span className="inline-flex items-center rounded-full bg-slate-800 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-300">
              {badge}
            </span>

            <h2 className="mt-4 text-2xl font-bold text-white">{title}</h2>

            <p className="mt-4 text-slate-300">{description}</p>

            <div className="mt-8 flex flex-wrap gap-4">
              {primaryButtonText && (
                <Link
                  href={`${basePath}${primaryButtonUrl}`}
                  className="inline-flex rounded-md bg-white px-6 py-3 font-semibold text-slate-900 transition-opacity hover:opacity-80"
                >
                  {primaryButtonText}
                </Link>
              )}

              {secondaryButtonText && (
                <Link
                  href={`${basePath}${secondaryButtonUrl}`}
                  className="inline-flex rounded-md border border-slate-600 bg-transparent px-6 py-3 font-semibold text-slate-100 transition-opacity hover:opacity-80"
                >
                  {secondaryButtonText}
                </Link>
              )}
            </div>
          </div>

          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
            {[
              {
                title: pricingTitle,
                description: pricingDescription,
              },
              {
                title: quickOrderTitle,
                description: quickOrderDescription,
              },
              {
                title: ordersTitle,
                description: ordersDescription,
              },
            ].map((benefit) => (
              <li
                key={benefit.title}
                className="rounded-lg border border-slate-800 bg-slate-800/40 px-5 py-4"
              >
                <h3 className="font-semibold text-white">{benefit.title}</h3>

                <p className="mt-1 text-sm text-slate-300">
                  {benefit.description}
                </p>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
