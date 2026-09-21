import type { Product } from "@spree/sdk";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildOrganizationJsonLd,
  buildProductJsonLd,
  buildProductShortDescription,
  buildWebSiteJsonLd,
} from "@/lib/seo";

function product(overrides: Partial<Product> = {}): Product {
  return {
    id: "product-1",
    name: "Fundas Standard Matte",
    slug: "fundas-standard-matte",
    meta_title: null,
    meta_description: null,
    meta_keywords: null,
    variant_count: 0,
    available_on: null,
    preorder_ships_at: null,
    purchasable: true,
    preorder: false,
    in_stock: true,
    backorderable: false,
    available: true,
    description: null,
    description_html: null,
    default_variant_id: "variant-1",
    thumbnail_url: "https://cdn.example.com/product.jpg",
    tags: [],
    price: {
      id: "price-1",
      amount: "9.95",
      amount_in_cents: 995,
      compare_at_amount: null,
      compare_at_amount_in_cents: null,
      currency: "EUR",
      display_amount: "9,95 €",
      display_compare_at_amount: null,
      price_list_id: null,
    },
    original_price: null,
    ...overrides,
  };
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("product SEO", () => {
  it("uses authored content and strips HTML for the concise description", () => {
    expect(
      buildProductShortDescription(
        product({
          meta_description:
            "<p>Fundas resistentes&nbsp;para proteger tus cartas.</p>",
        }),
        "es",
      ),
    ).toBe("Fundas resistentes para proteger tus cartas.");
  });

  it("creates a localized factual fallback when Spree has no description", () => {
    vi.stubEnv("NEXT_PUBLIC_STORE_NAME", "BisonTCG");

    expect(buildProductShortDescription(product(), "es-ES")).toBe(
      "Fundas Standard Matte en BisonTCG. Consulta precio, disponibilidad, variantes y opciones de compra.",
    );
  });

  it("adds identifiers, brand and variant offers without inventing reviews", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://bisontcg.example");
    vi.stubEnv("NEXT_PUBLIC_STORE_NAME", "BisonTCG");
    const schema = buildProductJsonLd(
      product({
        custom_fields: [
          {
            id: "brand",
            key: "catalog.brand",
            label: "Marca",
            type: "Spree::Metafields::ShortText",
            field_type: "short_text",
            value: "Dragon Shield",
          },
          {
            id: "ean",
            key: "catalog.ean",
            label: "EAN",
            type: "Spree::Metafields::ShortText",
            field_type: "short_text",
            value: "5706569110024",
          },
        ],
        categories: [
          {
            id: "category-1",
            name: "Accesorios para cartas",
            permalink: "accesorios/fundas",
            position: 1,
            depth: 1,
            meta_title: null,
            meta_description: null,
            meta_keywords: null,
            children_count: 0,
            parent_id: "root",
            description: "",
            description_html: "",
            image_url: null,
            square_image_url: null,
            is_root: false,
            is_child: true,
            is_leaf: true,
          },
        ],
        variants: [
          {
            id: "variant-black",
            product_id: "product-1",
            sku: "BLACK-100",
            options_text: "Color: Negro",
            track_inventory: true,
            media_count: 0,
            preorder_ships_at: null,
            thumbnail_url: null,
            purchasable: true,
            in_stock: false,
            backorderable: false,
            preorder: true,
            weight: null,
            height: null,
            width: null,
            depth: null,
            price: product().price,
            original_price: null,
            option_values: [],
          },
        ],
      }),
      "https://bisontcg.example/es/es/products/fundas-standard-matte",
      { description: "Fundas para cartas.", locale: "es" },
    );

    expect(schema).toMatchObject({
      "@type": "Product",
      "@id":
        "https://bisontcg.example/es/es/products/fundas-standard-matte#product",
      description: "Fundas para cartas.",
      gtin13: "5706569110024",
      brand: { "@type": "Brand", name: "Dragon Shield" },
      category: "Accesorios para cartas",
      offers: [
        {
          "@type": "Offer",
          sku: "BLACK-100",
          price: "9.95",
          priceCurrency: "EUR",
          availability: "https://schema.org/PreOrder",
          itemCondition: "https://schema.org/NewCondition",
          seller: {
            "@id": "https://bisontcg.example#organization",
            name: "BisonTCG",
          },
        },
      ],
    });
    expect(schema).not.toHaveProperty("review");
    expect(schema).not.toHaveProperty("aggregateRating");
  });
});

describe("store SEO", () => {
  it("links WebSite and Organization with stable identifiers", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://bisontcg.example");
    vi.stubEnv("NEXT_PUBLIC_STORE_NAME", "BisonTCG");
    vi.stubEnv("NEXT_PUBLIC_STORE_DESCRIPTION", "Juegos y coleccionables.");

    expect(buildOrganizationJsonLd()).toMatchObject({
      "@type": "Organization",
      "@id": "https://bisontcg.example#organization",
      name: "BisonTCG",
      description: "Juegos y coleccionables.",
    });
    expect(
      buildWebSiteJsonLd("https://bisontcg.example/es/es", "es"),
    ).toMatchObject({
      "@type": "WebSite",
      "@id": "https://bisontcg.example#website",
      url: "https://bisontcg.example/es/es",
      inLanguage: "es",
      publisher: { "@id": "https://bisontcg.example#organization" },
    });
  });
});
