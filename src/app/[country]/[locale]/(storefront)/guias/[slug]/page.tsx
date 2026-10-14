import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { JsonLd } from "@/components/seo/JsonLd";
import { getBuyingGuide, isBuyingGuideRoute } from "@/lib/guides/content";
import { buildCanonicalUrl, normalizeOpenGraphLocale } from "@/lib/seo";
import { getStoreName, getStoreUrl } from "@/lib/store";

interface GuidePageProps {
  params: Promise<{ country: string; locale: string; slug: string }>;
}

export async function generateMetadata({
  params,
}: GuidePageProps): Promise<Metadata> {
  const { country, locale, slug } = await params;
  if (!isBuyingGuideRoute(country, locale)) notFound();
  const guide = getBuyingGuide(slug);
  if (!guide) notFound();
  const storeUrl = getStoreUrl();
  const canonical = storeUrl
    ? buildCanonicalUrl(
        new URL(storeUrl).origin,
        `/${country}/${locale}/guias/${guide.slug}`,
      )
    : undefined;
  return {
    title: guide.title,
    description: guide.intro,
    alternates: { canonical },
    openGraph: {
      title: guide.title,
      description: guide.intro,
      type: "article",
      url: canonical,
      siteName: getStoreName(),
      locale: normalizeOpenGraphLocale(locale, country),
    },
  };
}

export default async function GuidePage({ params }: GuidePageProps) {
  const { country, locale, slug } = await params;
  if (!isBuyingGuideRoute(country, locale)) notFound();
  const guide = getBuyingGuide(slug);
  if (!guide) notFound();
  const basePath = `/${country}/${locale}`;
  const storeUrl = getStoreUrl();
  const origin = storeUrl ? new URL(storeUrl).origin : undefined;
  const canonical = origin
    ? buildCanonicalUrl(origin, `${basePath}/guias/${guide.slug}`)
    : undefined;
  const organization = {
    "@type": "Organization",
    "@id": `${origin}#organization`,
    name: getStoreName(),
  };

  return (
    <article lang="es" className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:px-8">
      {canonical && origin ? (
        <>
          <JsonLd
            data={{
              "@context": "https://schema.org",
              "@type": "Article",
              "@id": `${canonical}#article`,
              headline: guide.title,
              description: guide.intro,
              inLanguage: "es",
              mainEntityOfPage: canonical,
              url: canonical,
              author: organization,
              publisher: organization,
              citation: guide.sources.map((source) => source.url),
            }}
          />
          <JsonLd
            data={{
              "@context": "https://schema.org",
              "@type": "BreadcrumbList",
              itemListElement: [
                { name: "Inicio", item: buildCanonicalUrl(origin, basePath) },
                {
                  name: "Guías de compra",
                  item: buildCanonicalUrl(origin, `${basePath}/guias`),
                },
                { name: guide.title, item: canonical },
              ].map((item, index) => ({
                "@type": "ListItem",
                position: index + 1,
                ...item,
              })),
            }}
          />
        </>
      ) : null}
      <nav
        aria-label="Ruta de navegación"
        className="text-sm text-muted-foreground"
      >
        <Link
          href={`${basePath}/guias`}
          className="underline underline-offset-4"
        >
          Guías de compra
        </Link>
      </nav>
      <header className="mt-6">
        <p className="text-sm font-medium text-muted-foreground">
          Una guía de {getStoreName()}
        </p>
        <h1 className="mt-3 text-3xl font-bold leading-tight sm:text-4xl">
          {guide.title}
        </h1>
        <p className="mt-5 text-lg leading-relaxed text-muted-foreground">
          {guide.intro}
        </p>
      </header>
      <div className="mt-10 space-y-8">
        {guide.sections.map((section) => (
          <section key={section.title}>
            <h2 className="text-xl font-semibold">{section.title}</h2>
            <div className="mt-3 space-y-4 leading-7">
              {section.paragraphs.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </div>
          </section>
        ))}
      </div>
      <section aria-labelledby="guide-sources" className="mt-12 border-t pt-8">
        <h2 id="guide-sources" className="text-xl font-semibold">
          Fuentes oficiales
        </h2>
        <p className="mt-3 leading-relaxed text-muted-foreground">
          Consulta las especificaciones y las reglas de la edición concreta
          antes de decidir.
        </p>
        <ul className="mt-4 list-disc space-y-3 pl-5">
          {guide.sources.map((source) => (
            <li key={source.url}>
              <a
                href={source.url}
                className="break-words underline underline-offset-4"
              >
                {source.title}
              </a>
            </li>
          ))}
        </ul>
      </section>
    </article>
  );
}
