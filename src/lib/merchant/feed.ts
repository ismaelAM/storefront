import type { Media, Product } from "@spree/sdk";
import {
  buildCanonicalUrl,
  buildProductJsonLd,
  buildProductShortDescription,
  getProductOfferSource,
  schemaAvailability,
  validOfferPrice,
} from "@/lib/seo";
import { getStoreName } from "@/lib/store";

export const MERCHANT_MAX_PRODUCTS = 5_000;
export const MERCHANT_MAX_XML_BYTES = 25_000_000;

interface FeedOptions {
  storeUrl: string;
  now?: Date;
  gtins?: ReadonlyMap<string, string>;
}

function xml(value: string): string {
  // XML 1.0 excludes control characters and unpaired UTF-16 surrogates.
  let clean = "";
  for (const character of value) {
    const point = character.codePointAt(0) ?? 0;
    if (
      point === 9 ||
      point === 10 ||
      point === 13 ||
      (point >= 0x20 && point <= 0xd7ff) ||
      (point >= 0xe000 && point <= 0xfffd) ||
      point >= 0x10000
    )
      clean += character;
  }
  return clean
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function field(name: string, value: string): string {
  return `<g:${name}>${xml(value)}</g:${name}>`;
}

function publicUrl(value: string | null | undefined): string | undefined {
  if (!value || value.length > 2_000) return undefined;
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) &&
      !url.username &&
      !url.password
      ? url.href
      : undefined;
  } catch {
    return undefined;
  }
}

function initialImage(product: Product, variantId: string): string | undefined {
  const images = (product.media ?? []).filter(
    (media) => media.media_type === "image",
  );
  const associated = images.filter((media) =>
    media.variant_ids?.includes(variantId),
  );
  const generic = images.filter((media) => !media.variant_ids?.length);
  const candidates: Media[] = associated.length ? associated : generic;
  for (const image of candidates) {
    const url = publicUrl(image.original_url) ?? publicUrl(image.large_url);
    if (url) return url;
  }
  return undefined;
}

function shippingDate(
  value: string | null | undefined,
  now: Date,
): string | undefined {
  if (!value || !/^\d{4}-\d{2}-\d{2}(?:T|$)/.test(value)) return undefined;
  const date = new Date(value);
  const latest = new Date(now);
  latest.setUTCFullYear(latest.getUTCFullYear() + 1);
  if (!Number.isFinite(date.getTime()) || date < now || date > latest)
    return undefined;
  // Merchant Center's date limit is 25 characters; omit unnecessary seconds.
  return `${date.toISOString().slice(0, 16)}Z`;
}

/** Export only the offer selected by the existing product page on first load. */
export function buildMerchantItem(
  product: Product,
  options: FeedOptions & { gtin?: string },
): string | null {
  const source = getProductOfferSource(product);
  // ProductDetails uses product-level purchase/preorder data when its expanded
  // variants list is empty, even if a default variant supplies price and ID.
  // Omit conflicts rather than publish availability the landing page contradicts.
  if (
    !product.variants?.some(Boolean) &&
    (Boolean(source.purchasable) !== Boolean(product.purchasable) ||
      Boolean(source.preorder) !== Boolean(product.preorder) ||
      (product.preorder &&
        (source.preorder_ships_at ?? null) !==
          (product.preorder_ships_at ?? null)))
  )
    return null;
  const id =
    source.id === product.id
      ? product.default_variant_id || product.id
      : source.id;
  const title = product.name?.trim();
  const image = initialImage(product, id);
  if (
    !id ||
    id.length > 50 ||
    !title ||
    !product.slug ||
    !image ||
    !validOfferPrice(source.price) ||
    source.price.currency !== "EUR" ||
    Number(source.price.amount) <= 0
  )
    return null;
  const link = publicUrl(
    buildCanonicalUrl(
      options.storeUrl,
      `/es/es/products/${encodeURIComponent(product.slug)}`,
    ),
  );
  if (!link) return null;
  const availability = schemaAvailability(source).split("/").at(-1);
  // ProductDetails does not expose an expected backorder date yet.
  if (availability === "BackOrder") return null;
  const date =
    availability === "PreOrder"
      ? shippingDate(source.preorder_ships_at, options.now ?? new Date())
      : undefined;
  if (availability === "PreOrder" && !date) return null;
  let group = "";
  let itemTitle = title;
  if (product.variant_count > 1) {
    const values = "option_values" in source ? source.option_values : undefined;
    if (
      source.id === product.id ||
      !values?.length ||
      values.length > 30 ||
      product.id.length > 50
    )
      return null;
    const dimensions = values.map((value) => ({
      name: value.option_type_label || value.option_type_name,
      value: value.label || value.name,
      standard: value.option_type_name?.toLowerCase().replace(/\s+/g, "_"),
    }));
    if (
      dimensions.some(
        (dimension) =>
          !dimension.name ||
          !dimension.value ||
          dimension.name.length > 250 ||
          dimension.value.length > 250,
      ) ||
      dimensions.reduce(
        (length, dimension) =>
          length + dimension.name.length + dimension.value.length,
        0,
      ) > 5_000
    )
      return null;
    group =
      field("item_group_id", product.id) +
      field("item_group_title", title.slice(0, 150));
    for (const dimension of dimensions) {
      group += `<g:variant_option>${field("name", dimension.name)}${field("value", dimension.value)}</g:variant_option>`;
      if (
        [
          "color",
          "pattern",
          "material",
          "age_group",
          "gender",
          "size",
        ].includes(dimension.standard)
      )
        group += field(dimension.standard, dimension.value);
    }
    itemTitle = `${title} · ${dimensions.map((dimension) => dimension.value).join(" · ")}`;
  }
  const description = buildProductShortDescription(product, "es");
  const schema = buildProductJsonLd(product, link, {
    locale: "es",
    gtin: options.gtin,
  });
  const identifiers: string[] = [];
  for (const key of ["gtin8", "gtin12", "gtin13", "gtin14"]) {
    if (typeof schema[key] === "string") {
      identifiers.push(field("gtin", schema[key] as string));
      break;
    }
  }
  // ISBN-10 is valid book metadata but not a Merchant Center GTIN length.
  if (
    !identifiers.length &&
    typeof schema.isbn === "string" &&
    schema.isbn.length === 13
  ) {
    identifiers.push(field("gtin", schema.isbn));
  }
  const brand = schema.brand as { name?: unknown } | undefined;
  if (typeof brand?.name === "string" && brand.name.length <= 70)
    identifiers.push(field("brand", brand.name));
  if (typeof schema.mpn === "string" && schema.mpn.length <= 70)
    identifiers.push(field("mpn", schema.mpn));
  const status =
    availability === "InStock"
      ? "in_stock"
      : availability === "PreOrder"
        ? "preorder"
        : "out_of_stock";
  return `<item>${field("id", id)}${field("title", itemTitle.slice(0, 150))}${field("description", description.slice(0, 5_000))}${field("link", link)}${field("image_link", image)}${field("condition", "new")}${field("availability", status)}${date ? field("availability_date", date) : ""}${field("price", `${source.price.amount} EUR`)}${group}${identifiers.join("")}</item>`;
}

/** No response is opened until the complete bounded document is prepared. */
export function buildMerchantFeed(products: Product[], options: FeedOptions) {
  const storeUrl = publicUrl(options.storeUrl);
  if (!storeUrl) throw new Error("Merchant store URL is invalid.");
  if (products.length > MERCHANT_MAX_PRODUCTS)
    throw new Error("Merchant catalogue exceeds 5,000 products.");
  const chunks = [
    `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0" xmlns:g="http://base.google.com/ns/1.0"><channel><title>${xml(getStoreName())}</title><link>${xml(storeUrl)}</link><description>Catálogo público de productos en España</description>`,
  ];
  let bytes = Buffer.byteLength(chunks[0], "utf8");
  let skippedCount = 0;
  const ids = new Set<string>();
  for (const product of products) {
    const source = getProductOfferSource(product);
    const variantId =
      source.id === product.id
        ? product.default_variant_id || product.id
        : source.id;
    const item = buildMerchantItem(product, {
      ...options,
      gtin: options.gtins?.get(variantId),
    });
    if (!item) {
      skippedCount += 1;
      continue;
    }
    if (ids.has(variantId))
      throw new Error("Duplicate Merchant offer identity.");
    ids.add(variantId);
    bytes += Buffer.byteLength(item, "utf8");
    if (bytes + 17 > MERCHANT_MAX_XML_BYTES)
      throw new Error("Merchant XML exceeds the 25 MB byte limit.");
    chunks.push(item);
  }
  if (!ids.size) throw new Error("Refusing an empty Merchant feed.");
  chunks.push("</channel></rss>");
  return { chunks, itemCount: ids.size, skippedCount };
}
