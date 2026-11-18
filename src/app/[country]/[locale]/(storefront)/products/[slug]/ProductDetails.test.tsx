import type { Product } from "@spree/sdk";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { getProductDetailsData } from "@/lib/data/product-details-data";
import { PRODUCT_PAGE_EXPAND } from "@/lib/data/cached";
import { ProductDetails } from "./ProductDetails";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("@/components/products/MediaGallery", () => ({
  MediaGallery: () => null,
}));

vi.mock("@/components/products/ProductCustomFields", () => ({
  ProductCustomFields: () => null,
}));

vi.mock("@/contexts/CartContext", () => ({
  useCart: () => ({ addItem: vi.fn() }),
}));

vi.mock("@/contexts/HiddenPricingContext", () => ({
  useHiddenPricing: () => null,
}));

vi.mock("@/contexts/StoreContext", () => ({
  useStore: () => ({ currency: "USD" }),
}));

vi.mock("@/lib/analytics/gtm", () => ({
  trackAddToCart: vi.fn(),
  trackViewItem: vi.fn(),
}));

const productWithoutCustomVariants = {
  id: "product-1",
  name: "Single Variant Product",
  slug: "single-variant-product",
  default_variant_id: "variant-master",
  default_variant: {
    id: "variant-master",
    product_id: "product-1",
    sku: "MASTER-SKU-001",
    options_text: "",
    purchasable: true,
    in_stock: true,
    price: {
      display_amount: "$25.00",
      amount_in_cents: 2500,
      compare_at_amount_in_cents: null,
      display_compare_at_amount: null,
    },
    original_price: null,
  },
  variants: [],
  option_types: [],
  media: [],
  purchasable: true,
  in_stock: true,
  price: {
    display_amount: "$25.00",
    amount_in_cents: 2500,
    compare_at_amount_in_cents: null,
    display_compare_at_amount: null,
  },
  original_price: null,
  description_html: null,
  custom_fields: [],
} as unknown as Product;

describe("ProductDetails", () => {
  it.each([
    { inStock: false, purchasable: true, preorder: false, preparation: true },
    { inStock: true, purchasable: true, preorder: false, preparation: false },
    { inStock: false, purchasable: true, preorder: true, preparation: false },
    { inStock: false, purchasable: false, preorder: false, preparation: false },
  ])("shows supplier preparation only for an orderable non-stock item: %j", ({
    inStock,
    purchasable,
    preorder,
    preparation,
  }) => {
    const product = {
      ...productWithoutCustomVariants,
      in_stock: inStock,
      purchasable,
      preorder,
    };
    render(
      <ProductDetails
        product={getProductDetailsData(product)}
        basePath="/es/es"
        shortDescription=""
      />,
    );
    expect(screen.queryByText("extendedFulfillment") !== null).toBe(
      preparation,
    );
    if (purchasable) {
      expect(
        screen.getByRole("button", {
          name: preorder ? "preorderAction" : "addToCart",
        }),
      ).toBeEnabled();
    } else {
      expect(screen.getByRole("button", { name: "outOfStock" })).toBeDisabled();
    }
  });

  it("uses the selected variant stock rather than other variants' physical stock", () => {
    const supplierVariant = {
      ...productWithoutCustomVariants.default_variant!,
      in_stock: false,
      purchasable: true,
      preorder: false,
    };
    const product = {
      ...productWithoutCustomVariants,
      in_stock: true,
      default_variant: supplierVariant,
      variants: [supplierVariant],
    };
    render(
      <ProductDetails
        product={getProductDetailsData(product)}
        basePath="/es/es"
        shortDescription=""
      />,
    );
    expect(screen.getByText("extendedFulfillment")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "addToCart" })).toBeEnabled();
  });

  it("requests product detail data without the broken category expansion", () => {
    expect(PRODUCT_PAGE_EXPAND).toContain("default_variant");
    expect(PRODUCT_PAGE_EXPAND).not.toContain("categories");
  });

  it("shows the master SKU when a product has no custom variants", () => {
    render(
      <ProductDetails
        product={getProductDetailsData(productWithoutCustomVariants)}
        basePath="/us/en"
        shortDescription="A concise product description."
      />,
    );

    expect(screen.getByText("sku")).toBeInTheDocument();
    expect(screen.getByText("MASTER-SKU-001")).toBeInTheDocument();
  });

  it("shows the concise product description near the title", () => {
    render(
      <ProductDetails
        product={getProductDetailsData(productWithoutCustomVariants)}
        basePath="/us/en"
        shortDescription="A concise product description."
      />,
    );

    expect(
      screen.getByText("A concise product description."),
    ).toBeInTheDocument();
  });
});

describe("product data sent to the browser", () => {
  it("keeps stock, prices, options and the two usable image URLs without server-only fields", () => {
    const nativeVariant = {
      ...productWithoutCustomVariants.default_variant!,
      dimensions_unit: "cm",
      weight: 1,
      price: {
        ...productWithoutCustomVariants.default_variant!.price,
        amount: "25.00",
        currency: "USD",
        amount_in_cents: 2500,
      },
      option_values: [{
        id: "unused-id",
        option_type_id: "language",
        option_type_label: "Idioma",
        name: "es",
        label: "Español",
      }],
    };
    const product = {
      ...productWithoutCustomVariants,
      description_html: "<p>Cartas en español.</p>",
      description: "SEO plain description",
      meta_keywords: "seo-keywords",
      tags: ["bison-tcg-catalog"],
      default_variant: nativeVariant,
      variants: [nativeVariant],
      media: [{
        id: "art",
        alt: "Caja",
        variant_ids: [nativeVariant.id],
        xlarge_url: "/main.webp",
        large_url: "/large.webp",
        original_url: "/original.png",
        small_url: "/thumb.webp",
        mini_url: "/mini.webp",
        og_image_url: "/seo-image.webp",
      }],
      custom_fields: [
        { id: "lang", key: "language", label: "Idioma", field_type: "short_text", value: "Español" },
        { id: "private", key: "sourcing.variant_provenance", label: "Proveedor", field_type: "json", value: "internal-only" },
      ],
    } as unknown as Product;

    const details = getProductDetailsData(product);
    expect(details).toMatchObject({
      default_variant: { id: "variant-master", sku: "MASTER-SKU-001" },
      variants: [{
        purchasable: true,
        in_stock: true,
        price: { amount: "25.00", amount_in_cents: 2500 },
        option_values: [{
          option_type_id: "language", option_type_label: "Idioma", name: "es", label: "Español",
        }],
      }],
      custom_fields: [{ id: "lang", label: "Idioma", field_type: "short_text", value: "Español" }],
      media: [{ id: "art", alt: "Caja", variant_ids: [nativeVariant.id], src: "/main.webp", thumbnail: "/thumb.webp" }],
    });
    expect(details).not.toHaveProperty("description");
    expect(details).not.toHaveProperty("meta_keywords");
    expect(details).not.toHaveProperty("tags");
    expect(details.custom_fields).toHaveLength(1);
    expect(details.variants[0]).not.toHaveProperty("weight");
    expect(details.media[0]).not.toHaveProperty("original_url");
    expect(details.description_html).toBe(product.description_html);
  });
});
