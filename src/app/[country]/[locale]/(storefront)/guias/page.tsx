import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BUYING_GUIDES, isBuyingGuideRoute } from "@/lib/guides/content";
import { buildCanonicalUrl, normalizeOpenGraphLocale } from "@/lib/seo";
import { getStoreName, getStoreUrl } from "@/lib/store";

interface GuidesPageProps {
  params: Promise<{ country: string; locale: string }>;
}

const title = "Guías de compra";
const description =
  "Criterios prácticos para empezar en Pokémon TCG, proteger tus cartas y elegir un juego de mesa para dos.";

export async function generateMetadata({
  params,
}: GuidesPageProps): Promise<Metadata> {
  const { country, locale } = await params;
  if (!isBuyingGuideRoute(country, locale)) notFound();
  const storeUrl = getStoreUrl();
  const canonical = storeUrl
    ? buildCanonicalUrl(new URL(storeUrl).origin, `/${country}/${locale}/guias`)
    : undefined;
  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      title,
      description,
      url: canonical,
      type: "website",
      siteName: getStoreName(),
      locale: normalizeOpenGraphLocale(locale, country),
    },
  };
}

export default async function GuidesPage({ params }: GuidesPageProps) {
  const { country, locale } = await params;
  if (!isBuyingGuideRoute(country, locale)) notFound();
  const basePath = `/${country}/${locale}`;
  return (
    <div lang="es" className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
      <header className="max-w-2xl">
        <p className="text-sm font-medium text-muted-foreground">
          {getStoreName()}
        </p>
        <h1 className="mt-2 text-3xl font-bold sm:text-4xl">{title}</h1>
        <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
          {description}
        </p>
      </header>
      <div className="mt-10 grid gap-6 md:grid-cols-3">
        {BUYING_GUIDES.map((guide) => (
          <Link
            key={guide.slug}
            href={`${basePath}/guias/${guide.slug}`}
            className="rounded-xl border bg-card p-6 transition-colors hover:border-primary focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
          >
            <h2 className="text-xl font-semibold">{guide.title}</h2>
            <p className="mt-3 leading-relaxed text-muted-foreground">
              {guide.intro}
            </p>
            <span className="mt-6 inline-block text-sm font-medium">
              Leer guía →
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
