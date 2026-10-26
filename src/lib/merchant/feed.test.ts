import type { Product } from "@spree/sdk";
import { describe, expect, it } from "vitest";
import { buildMerchantFeed, buildMerchantItem } from "./feed";

const options = {
  storeUrl: "https://www.bisontcg.com",
  now: new Date("2026-10-14T00:00:00Z"),
};

function product(overrides: Partial<Product> = {}): Product {
  return {
    id: "prod-1",
    name: "Juego & cartas",
    slug: "juego",
    description: "<p>Un juego de cartas.</p>",
    price: { amount: "25.00", currency: "EUR" },
    purchasable: true,
    in_stock: true,
    preorder: false,
    backorderable: false,
    default_variant_id: "variant-1",
    variant_count: 1,
    media: [
      {
        media_type: "image",
        original_url: "https://images.example.com/juego.jpg",
        variant_ids: [],
      },
    ],
    ...overrides,
  } as Product;
}

describe("Merchant Center XML", () => {
  it("exports the visible guest EUR offer with escaped copy and original images", () => {
    const xml = buildMerchantItem(product(), options);
    expect(xml).toContain("<g:title>Juego &amp; cartas</g:title>");
    expect(xml).toContain("<g:description>Un juego de cartas.</g:description>");
    expect(xml).toContain(
      "<g:link>https://www.bisontcg.com/es/es/products/juego</g:link>",
    );
    expect(xml).toContain(
      "<g:image_link>https://images.example.com/juego.jpg</g:image_link>",
    );
    expect(xml).toContain("<g:price>25.00 EUR</g:price>");
    expect(xml).toContain("<g:availability>in_stock</g:availability>");
    expect(xml).not.toContain("identifier_exists");
    expect(xml).not.toContain("<g:brand>BisonTCG");
  });

  it("uses the default variant even when another variant has a cheaper price", () => {
    const p = product({
      default_variant: {
        id: "v-default",
        price: { amount: "19.90", currency: "EUR" },
        purchasable: true,
        in_stock: true,
      } as Product["default_variant"],
      variants: [
        {
          id: "v-other",
          price: { amount: "1.00", currency: "EUR" },
          purchasable: true,
          in_stock: true,
        },
      ] as Product["variants"],
    });
    expect(buildMerchantItem(p, options)).toContain("<g:id>v-default</g:id>");
    expect(buildMerchantItem(p, options)).toContain(
      "<g:price>19.90 EUR</g:price>",
    );
  });

  it.each([
    {
      productPreorder: false,
      variantPreorder: true,
      productDate: null,
      variantDate: "2026-11-01T10:00:00Z",
      purchasable: true,
    },
    {
      productPreorder: true,
      variantPreorder: false,
      productDate: "2026-11-01T10:00:00Z",
      variantDate: null,
      purchasable: true,
    },
    {
      productPreorder: true,
      variantPreorder: true,
      productDate: "2026-11-01T10:00:00Z",
      variantDate: "2026-12-01T10:00:00Z",
      purchasable: true,
    },
    {
      productPreorder: false,
      variantPreorder: false,
      productDate: null,
      variantDate: null,
      purchasable: false,
    },
  ])("omits a default offer whose availability conflicts with the product page fallback: %j", (values) => {
    const p = product({
      preorder: values.productPreorder,
      preorder_ships_at: values.productDate,
      purchasable: values.purchasable,
      variants: [],
      default_variant: {
        id: "v-default",
        price: { amount: "19.90", currency: "EUR" },
        purchasable: true,
        in_stock: true,
        preorder: values.variantPreorder,
        preorder_ships_at: values.variantDate,
      } as Product["default_variant"],
    });
    expect(buildMerchantItem(p, options)).toBeNull();
    expect(
      buildMerchantItem({ ...p, variants: undefined }, options),
    ).toBeNull();
  });

  it("preserves the selected variant price and ID when product fallback preorder data agrees", () => {
    const p = product({
      preorder: true,
      preorder_ships_at: "2026-11-01T10:00:00Z",
      variants: [],
      default_variant: {
        id: "v-default",
        price: { amount: "19.90", currency: "EUR" },
        purchasable: true,
        in_stock: false,
        preorder: true,
        preorder_ships_at: "2026-11-01T10:00:00Z",
      } as Product["default_variant"],
    });
    const item = buildMerchantItem(p, options);
    expect(item).toContain("<g:id>v-default</g:id>");
    expect(item).toContain("<g:price>19.90 EUR</g:price>");
    expect(item).toContain("<g:availability>preorder</g:availability>");
    expect(item).toContain(
      "<g:availability_date>2026-11-01T10:00Z</g:availability_date>",
    );
  });

  it("uses variant preorder data when the product page has expanded variants", () => {
    const variant = {
      id: "v-default",
      price: { amount: "19.90", currency: "EUR" },
      purchasable: true,
      in_stock: false,
      preorder: true,
      preorder_ships_at: "2026-11-01T10:00:00Z",
    } as NonNullable<Product["default_variant"]>;
    const item = buildMerchantItem(
      product({
        preorder: false,
        preorder_ships_at: null,
        default_variant: variant,
        variants: [variant],
      }),
      options,
    );
    expect(item).toContain("<g:availability>preorder</g:availability>");
    expect(item).toContain(
      "<g:availability_date>2026-11-01T10:00Z</g:availability_date>",
    );
  });

  it("removes forbidden XML characters while preserving multilingual text", () => {
    const xml = buildMerchantItem(
      product({ name: "Juego\u0001 español 🦬" }),
      options,
    );
    expect(xml).toContain("Juego español 🦬");
    expect(xml).not.toContain("\u0001");
  });

  it("describes a grouped initial variant using public option metadata", () => {
    const p = product({
      variant_count: 2,
      default_variant: {
        id: "v-es",
        purchasable: true,
        in_stock: true,
        price: { amount: "20", currency: "EUR" },
        option_values: [
          {
            option_type_name: "language",
            option_type_label: "Idioma",
            label: "Español",
          },
        ],
      } as Product["default_variant"],
    });
    const item = buildMerchantItem(p, options);
    expect(item).toContain("<g:item_group_id>prod-1</g:item_group_id>");
    expect(item).toContain(
      "<g:item_group_title>Juego &amp; cartas</g:item_group_title>",
    );
    expect(item).toContain(
      "<g:variant_option><g:name>Idioma</g:name><g:value>Español</g:value></g:variant_option>",
    );
    expect(item).toContain("Juego &amp; cartas · Español");
  });

  it("omits multiple-variant products without exact initial option metadata", () => {
    expect(
      buildMerchantItem(product({ variant_count: 2 }), options),
    ).toBeNull();
  });

  it("never treats purchasability alone as in-stock", () => {
    expect(buildMerchantItem(product({ in_stock: false }), options)).toContain(
      "<g:availability>out_of_stock</g:availability>",
    );
    expect(
      buildMerchantItem(product({ purchasable: false }), options),
    ).toContain("<g:availability>out_of_stock</g:availability>");
  });

  it("exports preorder with the real expected shipping date", () => {
    const xml = buildMerchantItem(
      product({ preorder: true, preorder_ships_at: "2026-11-01T10:00:00Z" }),
      options,
    );
    expect(xml).toContain("<g:availability>preorder</g:availability>");
    expect(xml).toContain(
      "<g:availability_date>2026-11-01T10:00Z</g:availability_date>",
    );
  });

  it.each([
    null,
    "not-a-date",
    "2026-10-01T10:00:00Z",
    "2028-11-01T10:00:00Z",
  ])("omits preorder when its date is unusable: %s", (preorder_ships_at) => {
    expect(
      buildMerchantItem(
        product({ preorder: true, preorder_ships_at }),
        options,
      ),
    ).toBeNull();
  });

  it("omits backorders because no visible expected backorder shipping date is available", () => {
    expect(
      buildMerchantItem(
        product({ in_stock: false, backorderable: true }),
        options,
      ),
    ).toBeNull();
  });

  it.each([
    { price: { amount: "0", currency: "EUR" } },
    { price: { amount: "12", currency: "USD" } },
    { price: { amount: "NaN", currency: "EUR" } },
    { media: [], thumbnail_url: "https://images.example.com/thumbnail.jpg" },
    {
      media: [
        {
          media_type: "video",
          original_url: "https://images.example.com/video.mp4",
        },
      ],
    },
  ])("omits unusable public offers: %j", (overrides) => {
    expect(
      buildMerchantItem(product(overrides as Partial<Product>), options),
    ).toBeNull();
  });

  it("uses an image associated with the initially selected variant", () => {
    const p = product({
      media: [
        {
          media_type: "image",
          original_url: "https://images.example.com/other.jpg",
          variant_ids: ["other"],
        },
        {
          media_type: "image",
          original_url: "https://images.example.com/selected.jpg",
          variant_ids: ["variant-1"],
        },
      ] as Product["media"],
    });
    expect(buildMerchantItem(p, options)).toContain(
      "https://images.example.com/selected.jpg",
    );
    expect(buildMerchantItem(p, options)).not.toContain(
      "https://images.example.com/other.jpg",
    );
  });

  it("emits validated public GTIN and manufacturer identifiers without exposing other custom fields", () => {
    const p = product({
      custom_fields: [
        { key: "brand", value: "Asmodee" },
        { key: "mpn", value: "MAN-123" },
        { key: "supplier_cost", value: "PRIVATE-COST" },
      ] as Product["custom_fields"],
    });
    const xml = buildMerchantItem(p, { ...options, gtin: "3665361138648" });
    expect(xml).toContain("<g:gtin>3665361138648</g:gtin>");
    expect(xml).toContain("<g:brand>Asmodee</g:brand>");
    expect(xml).toContain("<g:mpn>MAN-123</g:mpn>");
    expect(xml).not.toContain("PRIVATE-COST");
    expect(
      buildMerchantItem(p, { ...options, gtin: "3665361138649" }),
    ).not.toContain("<g:gtin>");
  });

  it("does not submit an ISBN-10 as a GTIN", () => {
    const p = product({
      custom_fields: [
        { key: "isbn", value: "0306406152" },
      ] as Product["custom_fields"],
    });
    expect(buildMerchantItem(p, options)).not.toContain("<g:gtin>");
  });

  it("prepares complete RSS chunks and counts intentional omissions", () => {
    const result = buildMerchantFeed(
      [
        product(),
        product({
          id: "prod-2",
          default_variant_id: "variant-2",
          preorder: true,
        }),
      ],
      options,
    );
    const xml = result.chunks.join("");
    expect(result.itemCount).toBe(1);
    expect(result.skippedCount).toBe(1);
    expect(xml).toContain('xmlns:g="http://base.google.com/ns/1.0"');
    expect(xml).toMatch(/<rss[^>]*><channel>/);
    expect(xml).toMatch(/<\/channel><\/rss>$/);
    expect(() => buildMerchantFeed([], options)).toThrow(/empty/i);
  });

  it("rejects duplicate offer identities instead of returning a partial feed", () => {
    expect(() =>
      buildMerchantFeed([product(), product({ id: "prod-2" })], options),
    ).toThrow(/duplicate/i);
  });

  it("bounds total XML bytes even when escaped image URLs are unusually large", () => {
    const largeImage = `https://images.example.com/x?${"&".repeat(1_970)}`;
    const products = Array.from({ length: 5000 }, (_, i) =>
      product({
        id: `p-${i}`,
        default_variant_id: `v-${i}`,
        media: [
          { media_type: "image", original_url: largeImage, variant_ids: [] },
        ] as unknown as Product["media"],
      }),
    );
    expect(() => buildMerchantFeed(products, options)).toThrow(/25 MB/);
  });
});
