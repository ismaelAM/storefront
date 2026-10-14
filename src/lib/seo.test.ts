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
  it("uses the exact catalog variant GTIN rather than a group identifier", () => {
    const schema = buildProductJsonLd(
      product({
        custom_fields: [
          { key: "ean", value: "5706569110024" },
        ] as Product["custom_fields"],
      }),
      "https://example.com/es/es/products/item",
      { gtin: "3665361138648" },
    );
    expect(schema.gtin13).toBe("3665361138648");
  });

  it.each([
    "DIST-3665361138648",
    "3665361138649",
    "",
    "s",
  ])("rejects invalid catalog GTIN %j", (gtin) => {
    const schema = buildProductJsonLd(
      product(),
      "https://example.com/product",
      { gtin },
    );
    expect(schema).not.toHaveProperty("gtin13");
    expect(schema).not.toHaveProperty("brand");
  });

  it("references the same return policy identifier as the store markup", () => {
    const returnPolicyUrl = "https://example.com/es/es/policies/returns-policy";
    const schema = buildProductJsonLd(
      product(),
      "https://example.com/es/es/products/item",
      { returnPolicyUrl },
    );
    const organization = buildOrganizationJsonLd({ returnPolicyUrl });
    expect(schema.offers).toMatchObject({
      hasMerchantReturnPolicy: { "@id": `${returnPolicyUrl}#policy` },
    });
    expect(organization.hasMerchantReturnPolicy).toMatchObject({
      "@id": `${returnPolicyUrl}#policy`,
      merchantReturnLink: returnPolicyUrl,
    });
  });
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

  it("adds identifiers, brand and the initial offer without inventing reviews", () => {
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
      offers: {
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
    });
    expect(schema).not.toHaveProperty("review");
    expect(schema).not.toHaveProperty("aggregateRating");
  });

  it("does not turn a distributor SKU into a global identifier", () => {
    const schema = buildProductJsonLd(
      product({
        default_variant: {
          sku: "DIST-5706569110024",
        } as Product["default_variant"],
      }),
      "https://example.com/product",
    );
    expect(schema).not.toHaveProperty("gtin13");
    expect(schema.sku).toBe("DIST-5706569110024");
  });

  it("rejects GTIN fields containing letters instead of stripping them", () => {
    const schema = buildProductJsonLd(
      product({
        custom_fields: [
          {
            key: "gtin",
            value: "DIST-5706569110024",
          },
        ] as Product["custom_fields"],
      }),
      "https://example.com/product",
    );
    expect(schema).not.toHaveProperty("gtin13");
  });

  it("keeps a validated explicit ISBN-10 separate from GTIN", () => {
    const schema = buildProductJsonLd(
      product({
        custom_fields: [
          {
            key: "isbn",
            value: "0-8044-2957-X",
          },
        ] as Product["custom_fields"],
      }),
      "https://example.com/product",
    );
    expect(schema.isbn).toBe("080442957X");
    expect(schema["@type"]).toEqual(["Product", "Book"]);
    expect(schema).not.toHaveProperty("gtin13");
  });

  it.each([
    "-1",
    "NaN",
    "Infinity",
    "",
    " ",
  ])("omits an invalid actual price %j", (amount) => {
    const schema = buildProductJsonLd(
      product({ price: { ...product().price!, amount } }),
      "https://example.com/product",
    );
    expect(schema).not.toHaveProperty("offers");
  });

  it("uses default variant price and actual backorder status", () => {
    const schema = buildProductJsonLd(
      product({
        default_variant: {
          sku: "default",
          price: { ...product().price!, amount: "12.95" },
          purchasable: true,
          in_stock: false,
          preorder: false,
          backorderable: true,
        } as Product["default_variant"],
      }),
      "https://example.com/product",
    );
    expect(schema.offers).toMatchObject({
      price: "12.95",
      availability: "https://schema.org/BackOrder",
    });
  });

  it("uses the displayed product price fallback when default price is absent", () => {
    const schema = buildProductJsonLd(
      product({
        default_variant: {
          sku: "default",
          price: null,
          purchasable: true,
          in_stock: true,
        } as unknown as Product["default_variant"],
      }),
      "https://example.com/product",
    );
    expect(schema.offers).toMatchObject({ price: "9.95", sku: "default" });
  });

  it.each([
    { preorder: true },
    { backorderable: true },
  ])("does not advertise ordering for a nonpurchasable product %j", (state) => {
    const schema = buildProductJsonLd(
      product({ ...state, purchasable: false, in_stock: false }),
      "https://example.com/product",
    );
    expect(schema.offers).toMatchObject({
      availability: "https://schema.org/OutOfStock",
    });
  });
});

describe("store SEO", () => {
  it("identifies the spaced, joined and Bisonte names as the same store", () => {
    vi.stubEnv("NEXT_PUBLIC_STORE_NAME", "BisonTCG");
    const alternateName = [
      "Bison TCG",
      "Bisontcg",
      "Bisonte TCG",
      "Bisontetcg",
    ];
    expect(
      buildWebSiteJsonLd("https://bisontcg.example/es/es", "es"),
    ).toMatchObject({ name: "BisonTCG", alternateName });
    expect(buildOrganizationJsonLd()).toMatchObject({
      name: "BisonTCG",
      alternateName,
    });
  });

  it("does not assign BisonTCG aliases to another configured store", () => {
    vi.stubEnv("NEXT_PUBLIC_STORE_NAME", "Another Store");
    expect(
      buildWebSiteJsonLd("https://example.com/es/es", "es"),
    ).not.toHaveProperty("alternateName");
    expect(buildOrganizationJsonLd()).not.toHaveProperty("alternateName");
  });
  it("uses the root origin when deriving a site URL from the canonical homepage", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL", "");
    vi.stubEnv("NODE_ENV", "test");
    expect(buildWebSiteJsonLd("https://bisontcg.example/es/es", "es").url).toBe(
      "https://bisontcg.example",
    );
  });

  it("links WebSite and Organization with stable identifiers", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://bisontcg.example");
    vi.stubEnv("NEXT_PUBLIC_STORE_NAME", "BisonTCG");
    vi.stubEnv("NEXT_PUBLIC_STORE_DESCRIPTION", "Juegos y coleccionables.");

    expect(buildOrganizationJsonLd()).toMatchObject({
      "@type": "OnlineStore",
      "@id": "https://bisontcg.example#organization",
      name: "BisonTCG",
      description: "Juegos y coleccionables.",
    });
    expect(
      buildWebSiteJsonLd("https://bisontcg.example/es/es", "es"),
    ).toMatchObject({
      "@type": "WebSite",
      "@id": "https://bisontcg.example#website",
      url: "https://bisontcg.example",
      inLanguage: "es",
      publisher: { "@id": "https://bisontcg.example#organization" },
    });
  });

  it("uses the resolved logo and links to the actual return policy", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://bisontcg.example");
    const schema = buildOrganizationJsonLd({
      logoUrl: "/bison-logo.png",
      returnPolicyUrl: "https://bisontcg.example/es/es/policies/returns-policy",
    });
    expect(schema.logo).toBe("https://bisontcg.example/bison-logo.png");
    expect(schema.hasMerchantReturnPolicy).toEqual({
      "@type": "MerchantReturnPolicy",
      "@id": "https://bisontcg.example/es/es/policies/returns-policy#policy",
      merchantReturnLink:
        "https://bisontcg.example/es/es/policies/returns-policy",
    });
    expect(schema).not.toHaveProperty("address");
  });

  it("uses the same verified email fallback as the visible legal identity", () => {
    vi.stubEnv("STORE_SUPPORT_EMAIL", "");
    vi.stubEnv("LEGAL_CONTACT_EMAIL", "support@bisontcg.example");
    expect(buildOrganizationJsonLd()).toMatchObject({
      contactPoint: { email: "support@bisontcg.example" },
    });
  });
});
