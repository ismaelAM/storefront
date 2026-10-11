import { madridCommercialDay } from "../../../supabase/functions/_shared/commercial-pricing-policy";
import {
  type DailyOfferCategory,
  dailyOfferCategory,
} from "../../../supabase/functions/_shared/daily-offer-selection";

export const OFFER_CATEGORIES: Record<DailyOfferCategory, string> = {
  tcg: "TCG",
  "juegos-de-mesa": "Juegos de mesa y rol",
  accesorios: "Accesorios",
  merchandising: "Merchandising",
};
export interface DailyOfferState {
  day_key: string | null;
  spree_price_list_id: string | null;
  last_rotated_at: string | null;
  last_error: string | null;
  active_products: Array<{
    productId: string;
    variantId?: string;
    amount?: number;
    compareAtAmount?: number;
    category?: string;
  }>;
}
interface PublicPrice {
  amount?: string | null;
  compare_at_amount?: string | null;
  currency?: string | null;
  price_list_id?: string | null;
}
interface PublicVariant {
  id: string;
  purchasable: boolean;
  preorder?: boolean;
  thumbnail_url?: string | null;
  price: PublicPrice;
  original_price?: PublicPrice | null;
}
export interface PublicOfferProduct {
  id: string;
  name: string;
  slug: string;
  purchasable: boolean;
  tags: string[];
  default_variant_id: string;
  thumbnail_url: string | null;
  price: PublicPrice;
  original_price?: PublicPrice | null;
  variants?: PublicVariant[];
  default_variant?: PublicVariant;
}
export interface SocialOffer {
  productId: string;
  variantId: string;
  category: DailyOfferCategory;
  name: string;
  slug: string;
  price: number;
  originalPrice: number;
  imageUrl: string;
}
export interface SocialOfferSnapshot {
  dayKey: string;
  priceListId: string;
  offers: SocialOffer[];
}

export function buildSocialOffers(
  state: DailyOfferState | null,
  products: PublicOfferProduct[],
  categoryKeys: Record<string, string | null>,
  now = new Date(),
): SocialOfferSnapshot {
  const dayKey = madridCommercialDay(now).dayKey;
  if (
    !state ||
    state.day_key !== dayKey ||
    !state.last_rotated_at ||
    state.last_error ||
    !state.spree_price_list_id
  ) {
    throw new Error(
      "La rotación de hoy aún no está lista. Vuelve a intentarlo cuando termine.",
    );
  }
  const offers: SocialOffer[] = [];
  const seen = new Set<string>();
  for (const selected of state.active_products) {
    const product = products.find((p) => p.id === selected.productId);
    const category = dailyOfferCategory(
      selected.category ?? categoryKeys[selected.productId],
    );
    if (
      !category ||
      seen.has(selected.productId) ||
      offers.filter((o) => o.category === category).length >= 3
    )
      continue;
    if (
      !product?.purchasable ||
      !product.tags.includes(`offer-date:${dayKey}`) ||
      !product.tags.some(
        (t) => t === "daily-offer" || t === "saturday-special",
      ) ||
      product.tags.some((t) =>
        /revision-humana|necesita-tu-ayuda|catalog-review/i.test(t),
      )
    )
      continue;
    const variantId = selected.variantId ?? product.default_variant_id;
    const variant =
      product.variants?.find((v) => v.id === variantId) ??
      (product.default_variant?.id === variantId
        ? product.default_variant
        : undefined);
    if (!variant?.purchasable || variant.preorder) continue;
    const price = Number(variant.price.amount);
    const originalPrice = Number(
      variant.price.compare_at_amount ?? variant.original_price?.amount,
    );
    const imageUrl = variant.thumbnail_url || product.thumbnail_url;
    if (
      variant.price.currency !== "EUR" ||
      variant.price.price_list_id !== state.spree_price_list_id ||
      !Number.isFinite(price) ||
      price <= 0 ||
      !Number.isFinite(originalPrice) ||
      originalPrice <= price ||
      originalPrice - price < 0.5 - 1e-8 ||
      price / originalPrice > 0.975 + 1e-8 ||
      !imageUrl ||
      (selected.amount !== undefined &&
        Math.abs(selected.amount - price) > 0.005) ||
      (selected.compareAtAmount !== undefined &&
        Math.abs(selected.compareAtAmount - originalPrice) > 0.005)
    )
      continue;
    seen.add(product.id);
    offers.push({
      productId: product.id,
      variantId,
      category,
      name: product.name,
      slug: product.slug,
      price,
      originalPrice,
      imageUrl,
    });
  }
  return { dayKey, priceListId: state.spree_price_list_id, offers };
}

export function offerCaption(
  snapshot: SocialOfferSnapshot,
  storeUrl: string,
): string {
  const euro = (value: number) =>
    new Intl.NumberFormat("es-ES", {
      style: "currency",
      currency: "EUR",
    }).format(value);
  const lines = [
    `Ofertas BisonTCG · ${snapshot.dayKey.split("-").reverse().join("/")}`,
    "",
  ];
  for (const [category, label] of Object.entries(OFFER_CATEGORIES)) {
    const offers = snapshot.offers.filter((o) => o.category === category);
    if (!offers.length) continue;
    lines.push(
      label,
      ...offers.map(
        (o) =>
          `${o.name.length > 84 ? `${o.name.slice(0, 83)}…` : o.name}: ${euro(o.price)} (antes ${euro(o.originalPrice)})`,
      ),
      "",
    );
  }
  lines.push(
    `Compra en ${storeUrl}`,
    "Precios con IVA. Envío aparte. Válidas hoy mientras haya disponibilidad. Consulta las condiciones en la tienda.",
    "#BisonTCG #Ofertas #TCG #JuegosDeMesa",
  );
  return lines.join("\n");
}
