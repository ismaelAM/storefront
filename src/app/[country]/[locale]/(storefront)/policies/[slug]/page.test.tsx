import { type Policy, SpreeError } from "@spree/sdk";
import { getTranslations } from "next-intl/server";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getPolicy } from "@/lib/data/policies";
import { getSpanishLegalPolicy } from "@/lib/legal/spain";
import { buildLocalizedAlternates } from "@/lib/metadata/alternates";
import PolicyPage, { generateMetadata } from "./page";

vi.mock("next/server", () => ({
  connection: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/puck/get-site-page-data", () => ({
  getSitePageData: (_pageId: string, fallback: unknown) =>
    Promise.resolve(fallback),
}));

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(),
}));

vi.mock("@/lib/data/policies", () => ({
  cachedGetPolicy: vi.fn(),
  getPolicy: vi.fn(),
}));

vi.mock("@/lib/metadata/alternates", () => ({
  buildLocalizedAlternates: vi.fn(),
  translationFingerprint: (...fields: unknown[]) => JSON.stringify(fields),
}));

const policy = {
  id: "policy-1",
  name: "Privacy Policy",
  slug: "privacy-policy",
  body: null,
  body_html: null,
} satisfies Policy;

describe("policy metadata", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://store.example/");
    vi.stubEnv("NEXT_PUBLIC_STORE_NAME", "Example Store");
    vi.mocked(getPolicy).mockResolvedValue(policy);
    vi.mocked(getTranslations).mockResolvedValue(
      ((key: string) => key) as never,
    );
    vi.mocked(buildLocalizedAlternates).mockResolvedValue({
      canonical: "https://store.example/us/en/policies/privacy-policy",
      languages: {
        en: "https://store.example/us/en/policies/privacy-policy",
        de: "https://store.example/us/de/policies/datenschutz",
        "x-default": "https://store.example/us/en/policies/privacy-policy",
      },
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it("sets the localized policy URL as canonical", async () => {
    const metadata = await generateMetadata({
      params: Promise.resolve({
        country: "us",
        locale: "en",
        slug: "privacy-policy",
      }),
    });

    const canonicalUrl = "https://store.example/us/en/policies/privacy-policy";

    expect(metadata).toMatchObject({
      title: "Privacy Policy",
      description: "Privacy Policy — Example Store",
      alternates: {
        canonical: canonicalUrl,
        languages: {
          en: canonicalUrl,
          de: "https://store.example/us/de/policies/datenschutz",
          "x-default": canonicalUrl,
        },
      },
      openGraph: {
        title: "Privacy Policy",
        description: "Privacy Policy — Example Store",
        url: canonicalUrl,
      },
    });
    expect(getPolicy).toHaveBeenCalledWith("privacy-policy", {
      country: "us",
      locale: "en",
    });
  });

  it.each([
    "privacy-policy",
    "terms-of-service",
    "shipping-policy",
    "returns-policy",
  ])("serves the existing Spanish %s without requesting the Store API", async (slug) => {
    const expected = getSpanishLegalPolicy(slug)!;
    const params = Promise.resolve({ country: "es", locale: "es", slug });
    const metadata = await generateMetadata({ params });
    const html = renderToStaticMarkup(await PolicyPage({ params }));
    expect(metadata.title).toBe(expected.name);
    expect(html).toContain(expected.body_html!);
    expect(getPolicy).not.toHaveBeenCalled();
  });

  it.each([
    401, 503,
  ])("keeps known legal content available during a Store API %s", async (status) => {
    const error = new SpreeError(
      { error: { code: "unavailable", message: "private response details" } },
      status,
    );
    vi.mocked(getPolicy).mockRejectedValue(error);
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const params = Promise.resolve({
      country: "es",
      locale: "en",
      slug: "privacy-policy",
    });
    const expected = getSpanishLegalPolicy("privacy-policy")!;
    const metadata = await generateMetadata({ params });
    const html = renderToStaticMarkup(await PolicyPage({ params }));

    expect(metadata.title).toBe(expected.name);
    expect(html).toContain(expected.body_html!);
    expect(html).toContain('lang="es"');
    expect(buildLocalizedAlternates).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith(
      "PolicyPage: Store API unavailable; using the Spanish legal policy",
      { slug: "privacy-policy", country: "es", locale: "en", status },
    );
    expect(JSON.stringify(log.mock.calls)).not.toContain(
      "private response details",
    );
  });

  it.each([
    401, 500,
  ])("does not hide an unknown policy's Store API %s", async (status) => {
    const error = new SpreeError(
      { error: { code: "unavailable", message: "Unavailable" } },
      status,
    );
    vi.mocked(getPolicy).mockRejectedValue(error);
    await expect(
      generateMetadata({
        params: Promise.resolve({
          country: "es",
          locale: "es",
          slug: "unknown-policy",
        }),
      }),
    ).rejects.toBe(error);
  });

  it("does not substitute legal content for a real policy not-found", async () => {
    vi.mocked(getPolicy).mockResolvedValue(null);
    const metadata = await generateMetadata({
      params: Promise.resolve({
        country: "es",
        locale: "en",
        slug: "privacy-policy",
      }),
    });
    expect(metadata.title).toBe("policyNotFound");
  });

  it.each([
    new SpreeError({ error: { code: "forbidden", message: "Forbidden" } }, 403),
    new TypeError("fetch failed"),
  ])("preserves errors outside the authorized legal fallback", async (error) => {
    vi.mocked(getPolicy).mockRejectedValue(error);
    await expect(
      generateMetadata({
        params: Promise.resolve({
          country: "es",
          locale: "en",
          slug: "privacy-policy",
        }),
      }),
    ).rejects.toBe(error);
  });
});
