import type { CustomField, Media, OptionType, Product, Variant } from "@spree/sdk";

function pick<T, K extends keyof T>(value: T, keys: readonly K[]): Pick<T, K> {
  const result = {} as Pick<T, K>;
  for (const key of keys) {
    if (value[key] !== undefined) result[key] = value[key];
  }
  return result;
}

const PRICE_FIELDS = [
  "amount",
  "amount_in_cents",
  "display_amount",
  "compare_at_amount_in_cents",
  "display_compare_at_amount",
] as const;
const VARIANT_FIELDS = [
  "id",
  "sku",
  "options_text",
  "purchasable",
  "in_stock",
  "preorder",
  "preorder_ships_at",
] as const;
const MEDIA_FIELDS = ["id", "alt", "variant_ids"] as const;
const OPTION_TYPE_FIELDS = ["id", "label", "kind"] as const;
const CUSTOM_FIELD_FIELDS = ["id", "label", "field_type", "value"] as const;
const PRODUCT_FIELDS = [
  "id",
  "name",
  "default_variant_id",
  "purchasable",
  "in_stock",
  "preorder",
  "preorder_ships_at",
  "description_html",
] as const;

type OptionValue = NonNullable<Variant["option_values"]>[number] & {
  option_type_label?: string | null;
  option_type_name?: string | null;
  option_type_presentation?: string | null;
};
const OPTION_VALUE_FIELDS = [
  "name",
  "label",
  "option_type_id",
  "color_code",
  "image_url",
  "option_type_label",
  "option_type_name",
  "option_type_presentation",
] as const satisfies readonly (keyof OptionValue)[];

export type ProductGalleryImage = Pick<Media, (typeof MEDIA_FIELDS)[number]> & {
  src: string | null;
  thumbnail: string | null;
};
export type ProductPageOptionType = Pick<OptionType, "id" | "label"> &
  Partial<Pick<OptionType, "kind">>;
export type PresentedCustomField = Pick<CustomField, (typeof CUSTOM_FIELD_FIELDS)[number]>;

type CustomerField = PresentedCustomField & {
  key?: string | null;
  namespace?: string | null;
};

export function isCustomerVisibleField(field: CustomerField): boolean {
  const key = (field.key ?? "").toLowerCase();
  const namespace = (field.namespace ?? "").toLowerCase();
  const label = (field.label ?? "").toLowerCase();

  return !["devir", "pricing", "sourcing"].includes(namespace) &&
    !/^(?:devir|pricing|sourcing)\.|^catalog\.review_/.test(key) &&
    !/\bisbn\b/i.test(key) && !/\bisbn\b/i.test(label);
}

function getVariantDetails(variant: Variant) {
  return {
    ...pick(variant, VARIANT_FIELDS),
    price: variant.price && pick(variant.price, PRICE_FIELDS),
    original_price: variant.original_price && pick(variant.original_price, PRICE_FIELDS),
    option_values: (variant.option_values ?? []).map((value: OptionValue) =>
      pick(value, OPTION_VALUE_FIELDS),
    ),
  };
}

export type ProductPageVariant = ReturnType<typeof getVariantDetails>;

/** The server keeps SEO and other catalogue data. Only presentation and cart inputs cross the client boundary. */
export function getProductDetailsData(product: Product) {
  return {
    ...pick(product, PRODUCT_FIELDS),
    price: product.price && pick(product.price, PRICE_FIELDS),
    original_price: product.original_price && pick(product.original_price, PRICE_FIELDS),
    default_variant: product.default_variant && getVariantDetails(product.default_variant),
    variants: (product.variants ?? []).filter(Boolean).map(getVariantDetails),
    option_types: (product.option_types ?? []).map((option) => pick(option, OPTION_TYPE_FIELDS)),
    media: (product.media ?? []).map((image): ProductGalleryImage => ({
      ...pick(image, MEDIA_FIELDS),
      src: image.xlarge_url || image.large_url || image.original_url || null,
      thumbnail: image.small_url || image.mini_url || image.original_url || null,
    })),
    categories: product.categories?.slice(0, 1).map(({ name }) => ({ name })),
    custom_fields: (product.custom_fields ?? [])
      .filter(isCustomerVisibleField)
      .map((field) => pick(field, CUSTOM_FIELD_FIELDS)),
  };
}

export type ProductDetailsData = ReturnType<typeof getProductDetailsData>;
