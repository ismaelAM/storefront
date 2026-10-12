import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ category: vi.fn() }));
vi.mock("@/lib/data/cached", () => ({ getCachedCategory: mocks.category }));
vi.mock("@/lib/data/categories", () => ({ cachedGetCategory: mocks.category }));
vi.mock("@/lib/store", () => ({
  getStoreUrl: () => undefined,
  getStoreName: () => "BisonTCG",
}));
vi.mock("@/lib/metadata/alternates", () => ({
  translationFingerprint: (...fields: unknown[]) => JSON.stringify(fields),
}));

import { generateCategoryMetadata } from "../category";

beforeEach(() =>
  mocks.category.mockResolvedValue({
    name: "Juegos de mesa",
    permalink: "juegos-de-mesa",
    description: "",
    description_html: "",
    meta_description: null,
  }),
);

describe("category descriptions", () => {
  it("keeps a branded share image when the category has no photo", async () => {
    const metadata = await generateCategoryMetadata({
      country: "es",
      locale: "es",
      permalink: ["juegos-de-mesa"],
    });
    expect(metadata.openGraph).toMatchObject({
      siteName: "BisonTCG",
      locale: "es_ES",
      images: [
        {
          url: "/bison-social-image.webp",
          width: 1200,
          height: 630,
          alt: "BisonTCG",
        },
      ],
    });
    expect(metadata.twitter?.images).toBeDefined();
  });
  it("uses a Spanish fallback for a Spanish category", async () => {
    const metadata = await generateCategoryMetadata({
      country: "es",
      locale: "es",
      permalink: ["juegos-de-mesa"],
    });
    expect(metadata.description).toBe(
      "Explora los productos de Juegos de mesa.",
    );
    expect(metadata.openGraph?.description).toBe(metadata.description);
  });
  it("preserves authored descriptions", async () => {
    mocks.category.mockResolvedValue({
      name: "Games",
      permalink: "games",
      meta_description: "Juegos para compartir.",
    });
    const metadata = await generateCategoryMetadata({
      country: "es",
      locale: "es",
      permalink: ["games"],
    });
    expect(metadata.description).toBe("Juegos para compartir.");
  });
});
