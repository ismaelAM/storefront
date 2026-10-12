import type { Product } from "@spree/sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getCachedProduct } = vi.hoisted(() => ({ getCachedProduct: vi.fn() }));
vi.mock("@/lib/data/cached", () => ({
  getCachedProduct,
  PRODUCT_METADATA_EXPAND: [],
}));
vi.mock("@/lib/data/products", () => ({ cachedGetProduct: vi.fn() }));
vi.mock("@/lib/spree", () => ({ DEFAULT_SURFACE: "dtc" }));
vi.mock("@/lib/metadata/alternates", () => ({
  translationFingerprint: () => "fingerprint",
  buildLocalizedAlternates: async () => ({
    canonical: "https://bisontcg.example/es/es/products/fundas",
    languages: {},
  }),
}));

import { generateProductMetadata } from "./product";

const price = { amount: "9.95", currency: "EUR" };
const initialProduct = {
  id: "product-1",
  name: "Fundas",
  slug: "fundas",
  price,
  purchasable: true,
  in_stock: true,
  preorder: false,
  backorderable: false,
  meta_title: null,
  meta_description: null,
  description: null,
  description_html: null,
  meta_keywords: null,
};
const route = { country: "es", locale: "es", slug: "fundas" };

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://bisontcg.example");
  getCachedProduct.mockResolvedValue(initialProduct);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("product social metadata", () => {
  it("uses the store share card when product imagery is missing", async () => {
    vi.stubEnv("NEXT_PUBLIC_STORE_NAME", "BisonTCG");
    const metadata = await generateProductMetadata(route);
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
  });
  it("advertises the actual initial variant price and backorder status", async () => {
    getCachedProduct.mockResolvedValue({
      ...initialProduct,
      default_variant: {
        sku: "variant-1",
        price: { ...price, amount: "12.95" },
        purchasable: true,
        in_stock: false,
        preorder: false,
        backorderable: true,
      },
    } as Product);
    expect((await generateProductMetadata(route)).other).toMatchObject({
      "product:price:amount": "12.95",
      "product:price:currency": "EUR",
      "product:availability": "backorder",
      "product:retailer_item_id": "variant-1",
    });
  });

  it("does not advertise a preorder that cannot be purchased", async () => {
    getCachedProduct.mockResolvedValue({
      ...initialProduct,
      purchasable: false,
      preorder: true,
    });
    expect(
      (await generateProductMetadata(route)).other?.["product:availability"],
    ).toBe("out of stock");
  });

  it("does not advertise invalid price amounts or orphan currencies", async () => {
    getCachedProduct.mockResolvedValue({
      ...initialProduct,
      price: { ...price, amount: "NaN" },
    });
    const metadata = await generateProductMetadata(route);
    expect(metadata.other).not.toHaveProperty("product:price:amount");
    expect(metadata.other).not.toHaveProperty("product:price:currency");
  });

  it("uses public product image URLs without assuming optimizer host support", async () => {
    getCachedProduct.mockResolvedValue({
      ...initialProduct,
      thumbnail_url: "https://supplier.example/fundas.jpg",
    });
    const metadata = await generateProductMetadata(route);
    expect(metadata.openGraph?.images).toEqual([
      { url: "https://supplier.example/fundas.jpg", alt: "Fundas" },
    ]);
  });
});
