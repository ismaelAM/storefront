import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BUYING_GUIDES } from "@/lib/guides/content";
import GuidesPage, { generateMetadata as indexMetadata } from "../page";
import GuidePage, { generateMetadata } from "./page";

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

const params = (locale = "es", slug = "como-empezar-pokemon-tcg") =>
  Promise.resolve({ country: "es", locale, slug });

describe("Spanish buying guide routes", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://store.example/");
    vi.stubEnv("NEXT_PUBLIC_STORE_NAME", "BisonTCG");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("links all articles within the current market and locale", async () => {
    const html = renderToStaticMarkup(await GuidesPage({ params: params() }));
    const document = new DOMParser().parseFromString(html, "text/html");
    expect(document.querySelector('[lang="es"]')).not.toBeNull();
    for (const guide of BUYING_GUIDES) {
      expect(
        document.querySelector(`a[href="/es/es/guias/${guide.slug}"]`)
          ?.textContent,
      ).toContain(guide.title);
    }
  });

  it("sets canonical and social URLs to the exact localized article path", async () => {
    const metadata = await generateMetadata({ params: params() });
    const canonical =
      "https://store.example/es/es/guias/como-empezar-pokemon-tcg";
    expect(metadata).toMatchObject({
      title: BUYING_GUIDES[0].title,
      description: BUYING_GUIDES[0].intro,
      alternates: { canonical },
      openGraph: { type: "article", url: canonical },
    });
    expect(
      (await indexMetadata({ params: params() })).alternates?.canonical,
    ).toBe("https://store.example/es/es/guias");
  });

  it("renders sourced Spanish content and matching editorial Article schema", async () => {
    const html = renderToStaticMarkup(await GuidePage({ params: params() }));
    const document = new DOMParser().parseFromString(html, "text/html");
    const article = document.querySelector('article[lang="es"]');
    expect(article?.querySelector("h1")?.textContent).toBe(
      BUYING_GUIDES[0].title,
    );
    for (const section of BUYING_GUIDES[0].sections) {
      expect(article?.textContent).toContain(section.title);
      for (const paragraph of section.paragraphs)
        expect(article?.textContent).toContain(paragraph);
    }
    for (const source of BUYING_GUIDES[0].sources) {
      expect(article?.querySelector(`a[href="${source.url}"]`)).not.toBeNull();
    }
    const schemas = Array.from(
      document.querySelectorAll('script[type="application/ld+json"]'),
    ).map((script) => JSON.parse(script.textContent!));
    expect(
      schemas.find((schema) => schema["@type"] === "Article"),
    ).toMatchObject({
      headline: BUYING_GUIDES[0].title,
      description: BUYING_GUIDES[0].intro,
      inLanguage: "es",
      mainEntityOfPage:
        "https://store.example/es/es/guias/como-empezar-pokemon-tcg",
      author: {
        "@type": "Organization",
        "@id": "https://store.example#organization",
        name: "BisonTCG",
      },
      publisher: { "@id": "https://store.example#organization" },
    });
    expect(
      schemas.some((schema) =>
        ["Product", "FAQPage"].includes(schema["@type"]),
      ),
    ).toBe(false);
  });

  it.each([
    "en",
    "fr",
    "de",
    "es-MX",
  ])("does not serve Spanish content on %s routes", async (locale) => {
    await expect(GuidesPage({ params: params(locale) })).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
    await expect(indexMetadata({ params: params(locale) })).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
    await expect(GuidePage({ params: params(locale) })).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
    await expect(generateMetadata({ params: params(locale) })).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
  });

  it("does not duplicate guides on another Spanish-speaking country route", async () => {
    const params = Promise.resolve({
      country: "mx",
      locale: "es",
      slug: BUYING_GUIDES[0].slug,
    });
    await expect(GuidesPage({ params })).rejects.toThrow("NEXT_NOT_FOUND");
    await expect(indexMetadata({ params })).rejects.toThrow("NEXT_NOT_FOUND");
    await expect(GuidePage({ params })).rejects.toThrow("NEXT_NOT_FOUND");
    await expect(generateMetadata({ params })).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
  });

  it("returns not-found for an unpublished guide", async () => {
    await expect(
      GuidePage({ params: params("es", "unknown") }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
    await expect(
      generateMetadata({ params: params("es", "unknown") }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
  });
});
