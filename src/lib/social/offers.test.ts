import { describe, expect, it } from "vitest";
import {
  buildSocialOffers,
  type DailyOfferState,
  offerCaption,
  type SocialOfferSnapshot,
} from "./offers";

const now = new Date("2026-10-11T08:00:00Z");
const state: DailyOfferState = {
  day_key: "2026-10-11",
  spree_price_list_id: "pl_daily",
  last_rotated_at: "2026-10-10T22:05:00Z",
  last_error: null,
  active_products: [
    {
      productId: "prod_1",
      variantId: "variant_2",
      amount: 18,
      compareAtAmount: 20,
      category: "tcg",
    },
  ],
};
const product = {
  id: "prod_1",
  name: "Caja real",
  slug: "caja-real",
  purchasable: true,
  thumbnail_url: "https://console.spree.sh/rails/active_storage/caja.jpg",
  tags: ["daily-offer", "offer-date:2026-10-11"],
  default_variant_id: "variant_1",
  price: { amount: "9", currency: "EUR", price_list_id: "pl_other" },
  variants: [
    {
      id: "variant_2",
      purchasable: true,
      preorder: false,
      price: {
        amount: "18",
        compare_at_amount: "20",
        currency: "EUR",
        price_list_id: "pl_daily",
      },
    },
  ],
};

describe("public daily offer snapshot", () => {
  it("uses the selected variant public price rather than another variant or account price", () => {
    const result = buildSocialOffers(state, [product], {}, now);
    expect(result.offers).toMatchObject([
      {
        productId: "prod_1",
        variantId: "variant_2",
        price: 18,
        originalPrice: 20,
        category: "tcg",
      },
    ]);
  });
  it("rejects stale Madrid days and incomplete rotations", () => {
    expect(() =>
      buildSocialOffers(
        { ...state, day_key: "2026-10-10" },
        [product],
        {},
        now,
      ),
    ).toThrow();
    expect(() =>
      buildSocialOffers(
        { ...state, last_rotated_at: null },
        [product],
        {},
        now,
      ),
    ).toThrow();
    expect(() =>
      buildSocialOffers({ ...state, last_error: "failed" }, [product], {}, now),
    ).toThrow();
  });
  it("does not advertise unavailable, changed or account-only prices", () => {
    for (const variants of [
      [{ ...product.variants[0], purchasable: false }],
      [
        {
          ...product.variants[0],
          price: { ...product.variants[0].price, amount: "19" },
        },
      ],
      [
        {
          ...product.variants[0],
          price: { ...product.variants[0].price, price_list_id: "pl_account" },
        },
      ],
    ])
      expect(
        buildSocialOffers(state, [{ ...product, variants }], {}, now).offers,
      ).toHaveLength(0);
  });
  it("requires current offer tags and a genuine discount", () => {
    expect(
      buildSocialOffers(state, [{ ...product, tags: ["sale"] }], {}, now)
        .offers,
    ).toHaveLength(0);
    const variants = [
      {
        ...product.variants[0],
        price: { ...product.variants[0].price, compare_at_amount: "18" },
      },
    ];
    expect(
      buildSocialOffers(state, [{ ...product, variants }], {}, now).offers,
    ).toHaveLength(0);
  });
  it("supports legacy state with the default variant and canonical category", () => {
    const legacy = { ...state, active_products: [{ productId: "prod_1" }] };
    const p = { ...product, default_variant_id: "variant_2" };
    expect(
      buildSocialOffers(legacy, [p], { prod_1: "tcg/mtg" }, now).offers,
    ).toHaveLength(1);
    expect(
      buildSocialOffers(legacy, [p], { prod_1: null }, now).offers,
    ).toHaveLength(0);
  });
  it("caps each category at three and deduplicates products", () => {
    const entries = Array.from({ length: 5 }, (_, i) => ({
      ...state.active_products[0],
      productId: `prod_${i}`,
    }));
    const products = entries.map((e) => ({ ...product, id: e.productId }));
    const result = buildSocialOffers(
      { ...state, active_products: [...entries, entries[0]] },
      products,
      {},
      now,
    );
    expect(result.offers).toHaveLength(3);
  });
});

describe("automatic Instagram hashtags", () => {
  const offer = {
    productId: "p",
    variantId: "v",
    category: "tcg" as const,
    name: "Producto",
    slug: "producto",
    price: 9.9,
    originalPrice: 12,
    imageUrl: "https://images.example.com/product.jpg",
  };
  const snapshot: SocialOfferSnapshot = {
    dayKey: "2026-10-15",
    priceListId: "pl_daily",
    offers: [],
  };

  it("adds five stable, unique brand/category hashtags to a complete daily carousel", () => {
    const offers = (
      ["tcg", "juegos-de-mesa", "accesorios", "merchandising"] as const
    ).flatMap((category) =>
      [1, 2, 3].map((n) => ({
        ...offer,
        productId: `${category}-${n}`,
        category,
      })),
    );
    const caption = offerCaption(
      { ...snapshot, offers },
      "https://www.bisontcg.com",
    );
    expect(caption.split("\n").at(-1)).toBe(
      "#BisonTCG #TCG #JuegosDeMesa #AccesoriosTCG #Merchandising",
    );
    const tags = caption.match(/#[A-Za-z]+/g) ?? [];
    expect(tags).toHaveLength(5);
    expect(new Set(tags).size).toBe(5);
  });

  it("does not add hashtags for categories missing from a partial download", () => {
    const caption = offerCaption(
      { ...snapshot, offers: [offer, { ...offer, productId: "p2" }] },
      "https://www.bisontcg.com",
    );
    expect(caption.split("\n").at(-1)).toBe("#BisonTCG #TCG");
  });

  it("keeps the complete twelve-offer caption within the publishing character budget", () => {
    const offers = (
      ["tcg", "juegos-de-mesa", "accesorios", "merchandising"] as const
    ).flatMap((category) =>
      [1, 2, 3].map((n) => ({
        ...offer,
        productId: `${category}-${n}`,
        category,
        name: "Nombre de producto largo 🦬 ".repeat(15),
      })),
    );
    const caption = offerCaption(
      { ...snapshot, offers },
      "https://www.bisontcg.com",
    );
    expect([...caption].length).toBeLessThanOrEqual(2200);
    expect(caption).toContain("#Merchandising");
  });
});
