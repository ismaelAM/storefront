// @vitest-environment node
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as pricing from "../../supabase/functions/_shared/commercial-pricing-policy";
import * as selection from "../../supabase/functions/_shared/daily-offer-selection";

const source = ts.createSourceFile(
  "index.ts",
  readFileSync("supabase/functions/devir-sync/index.ts", "utf8"),
  ts.ScriptTarget.Latest,
  true,
);
const functions = [
  "loadDailyOfferSupplyRows",
  "dailyOfferBasePrice",
  "dailyOfferPrice",
  "rotateDailyOffersUnlocked",
  "resumeDailyOfferRotation",
  "variantPrice",
  "roundUpToProfessionalPrice",
  "paymentAwareFloor",
  "isBookSku",
  "isBookProduct",
  "canStartSyncWork",
  "syncDeferred",
  "isSyncDeferred",
];
const code = ts.transpileModule(
  source.statements
    .filter(
      (node) =>
        ts.isFunctionDeclaration(node) &&
        functions.includes(node.name?.text ?? ""),
    )
    .map((node) => node.getText(source))
    .join("\n"),
  { compilerOptions: { target: ts.ScriptTarget.ES2022 } },
).outputText;

type ProductFixture = {
  id: string;
  category: string | null;
  name?: string;
  sku?: string;
  price?: number;
  lastAutoPrice?: number | null;
  cost?: number | null;
  nativeCost?: number;
  costCurrency?: string;
  noSupplier?: boolean;
  liveStock?: number;
  ownerAuthorized?: boolean;
  activeOfferPrice?: number;
  tags?: string[];
  availability?: string;
  purchasable?: boolean;
  fulfillmentMode?: string;
  stock?: number;
  supplierEnabled?: boolean;
  lastSeenAt?: string;
};
function fixture(products: ProductFixture[], saturday = false, latencyMs = 0) {
  let state: Record<string, unknown> | null = null;
  const requests: Array<{
    method: string;
    path: string;
    body?: Record<string, unknown>;
  }> = [];
  const supplies = products
    .filter((product) => !product.noSupplier)
    .map((product) => ({
      variant_id: `catalog-${product.id}`,
      spree_variant_id: `variant-${product.id}`,
      spree_product_id: product.id,
      product_id: `catalog-product-${product.id}`,
      product_name: product.name ?? product.id,
      canonical_sku: product.sku ?? product.id,
      normalized_cost: product.cost === undefined ? 10 : product.cost,
      supplier_code: "fixture",
      availability: product.availability ?? "available",
      currency: "EUR",
      supplier_enabled: product.supplierEnabled ?? true,
      supplier_stale_after_hours: 24,
      last_seen_at: product.lastSeenAt ?? new Date().toISOString(),
      fulfillment_mode: product.fulfillmentMode ?? "supplier_or_physical",
    }));
  const api = runInNewContext(
    `${code}; ({ rotateDailyOffersUnlocked, category: typeof dailyOfferCategory === 'function' ? dailyOfferCategory : undefined, interleave: typeof interleaveDailyOfferCandidates === 'function' ? interleaveDailyOfferCandidates : undefined })`,
    {
      ...pricing,
      ...selection,
      madridCommercialDay: () => ({ dayKey: "2026-10-11", saturday }),
      deterministicOfferScore: (_day: string, id: string) =>
        products.findIndex((product) => id === `catalog-${product.id}`),
      STANDARD_EEA_CARD_RATE: 0.015,
      STANDARD_EEA_CARD_FIXED_EUR: 0.25,
      inferDevirCategoryKey: () => "",
      dailyOfferState: async () => state,
      spreeListAll: async () =>
        products.map((product) => ({
          variant_id: `variant-${product.id}`,
          count_on_hand: product.stock ?? 0,
        })),
      selectedSupplyForSpreeVariant: async (id: string) =>
        supplies.find((row) => row.spree_variant_id === id),
      minimumOrderRiskSurcharge: () => 0,
      supplierVatRate: () => 0.21,
      restoreDailyOfferTags: async () => {},
      spreeRequest: async (
        config: { request_budget?: { deadline_at: number } },
        method: string,
        path: string,
        body?: Record<string, unknown>,
      ) => {
        if (latencyMs) {
          await new Promise((resolve) => setTimeout(resolve, latencyMs));
          if (
            config.request_budget &&
            Date.now() >= config.request_budget.deadline_at
          )
            throw Object.assign(new Error("budget"), { name: "SyncDeferred" });
        }
        requests.push({ method, path, body });
        if (path === "/price_lists") return { id: "list" };
        const id = path.split("/")[2];
        const product = products.find((row) => row.id === id);
        if (path.includes("/variants/"))
          return {
            id: `variant-${id}`,
            price:
              product?.activeOfferPrice === undefined
                ? (product?.price ?? 30)
                : {
                    amount: product.activeOfferPrice,
                    currency: "EUR",
                    price_list_id: "old-offer",
                  },
            original_price:
              product?.activeOfferPrice === undefined
                ? undefined
                : {
                    amount: product.price ?? 30,
                    currency: "EUR",
                    price_list_id: null,
                  },
            cost_price: product?.nativeCost ?? product?.cost,
            cost_currency: product?.costCurrency ?? "EUR",
            purchasable: product?.purchasable ?? true,
            total_on_hand: product?.liveStock ?? product?.stock ?? 0,
          };
        if (path.startsWith("/products/"))
          return {
            id,
            status: "active",
            tags: product?.tags ?? [],
            metadata: product?.ownerAuthorized
              ? {
                  owner_stock_20261030: {
                    source: "owner_instruction",
                    manual_price_eur: product.price,
                  },
                }
              : {},
          };
        return {};
      },
      supabase: {
        from: (table: string) => {
          let wantedSpreeIds: string[] | undefined;
          const query = {
            select: () => query,
            in: (column: string, ids: string[]) => {
              if (column === "spree_variant_id") wantedSpreeIds = ids;
              return query;
            },
            eq: () => query,
            not: () => query,
            order: () => query,
            range: async () => ({ data: supplies, error: null }),
            upsert: (row: Record<string, unknown>) => {
              state = row;
              return query;
            },
            update: (row: Record<string, unknown>) => {
              Object.assign(state!, row);
              return query;
            },
            // biome-ignore lint/suspicious/noThenProperty: Fixture implements a Supabase query.
            then: (resolve: (value: unknown) => void) =>
              resolve({
                error: null,
                data:
                  table === "catalog_variants"
                    ? products
                        .filter(
                          (product) =>
                            !wantedSpreeIds ||
                            wantedSpreeIds.includes(`variant-${product.id}`),
                        )
                        .map((product) => ({
                          id: `catalog-${product.id}`,
                          product_id: `catalog-product-${product.id}`,
                          canonical_sku: product.sku ?? product.id,
                          spree_variant_id: `variant-${product.id}`,
                          fulfillment_mode:
                            product.fulfillmentMode ?? "supplier_or_physical",
                          last_auto_price:
                            product.lastAutoPrice === undefined
                              ? 30
                              : product.lastAutoPrice,
                        }))
                    : table === "catalog_products"
                      ? products.map((product) => ({
                          id: `catalog-product-${product.id}`,
                          spree_product_id: product.id,
                          name: product.name ?? product.id,
                          category_key: product.category,
                        }))
                      : [],
              }),
          };
          return query;
        },
      },
      Date,
      console,
    },
  );
  return {
    api,
    requests,
    state: () => state,
    setState: (value: Record<string, unknown>) => {
      state = value;
    },
  };
}
afterEach(() => vi.useRealTimers());
function productsFor(category: string, count: number): ProductFixture[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `${category.replaceAll("/", "-")}-${index}`,
    category,
  }));
}
const balanced = () => [
  ...productsFor("tcg/mtg", 6),
  ...productsFor("juegos-de-mesa/general", 6),
  ...productsFor("accesorios/fundas-standard", 6),
  ...productsFor("merchandising", 6),
];

describe("Pure daily offer category selection", () => {
  it.each([
    ["tcg/pokemon", "tcg"],
    ["juegos-de-mesa/expansiones", "juegos-de-mesa"],
    ["rol/otros", "juegos-de-mesa"],
    ["accesorios/fundas-standard", "accesorios"],
    ["merchandising/figuras", "merchandising"],
    ["manga-comic", null],
    ["pinturas", null],
    ["unknown", null],
    [null, null],
    [undefined, null],
    ["", null],
  ])("maps explicit taxonomy %s to %s", (key, expected) => {
    expect(selection.dailyOfferCategory(key)).toBe(expected);
  });
  it("shares the inspection limit and preserves each category's supplied rank", () => {
    const ranked = [
      ...Array.from({ length: 130 }, (_, id) => ({
        id,
        category: "tcg" as const,
      })),
      { id: 200, category: "merchandising" as const },
      { id: 300, category: "accesorios" as const },
      { id: 400, category: "juegos-de-mesa" as const },
    ];
    const candidates = selection.interleaveDailyOfferCandidates(ranked);
    expect(candidates).toHaveLength(120);
    expect(candidates.slice(0, 4).map((candidate) => candidate.id)).toEqual([
      0, 400, 300, 200,
    ]);
    expect(
      candidates
        .filter((candidate) => candidate.category === "tcg")
        .slice(0, 3)
        .map((candidate) => candidate.id),
    ).toEqual([0, 1, 2]);
    expect(selection.interleaveDailyOfferCandidates([])).toEqual([]);
  });
});

describe("Daily offer category rotation", () => {
  it.each([
    false,
    true,
  ])("never discounts a physical precon by more than three percent on saturday=%s", async (saturday) => {
    const f = fixture(
      [
        {
          id: "precon",
          name: "Fallout Science! Commander Deck - Magic: The Gathering",
          category: "tcg/mtg",
          price: 59.99,
          lastAutoPrice: 59.99,
          cost: 20,
          stock: 3,
        },
      ],
      saturday,
    );
    const offer = (await f.api.rotateDailyOffersUnlocked({}, true)).selected[0];
    expect(offer.amount).toBe(58.2);
  });

  it.each([
    false,
    true,
  ])("never discounts a physical booster box by more than ten euros on saturday=%s", async (saturday) => {
    const f = fixture(
      [
        {
          id: "box",
          name: "Lorwyn Eclipsed Play Booster Box (30 sobres) - Magic: The Gathering",
          category: "tcg/mtg",
          price: 139.99,
          lastAutoPrice: 139.99,
          cost: 70,
          stock: 6,
        },
      ],
      saturday,
    );
    const offer = (await f.api.rotateDailyOffersUnlocked({}, true)).selected[0];
    expect(offer.amount).toBe(129.99);
  });

  it("prioritizes authorized physical-only manual stock without requiring a supplier or auto price", async () => {
    const f = fixture([
      ...productsFor("tcg/mtg", 4),
      {
        id: "owner",
        name: "Fallout Science! Commander Deck - Magic: The Gathering",
        category: "tcg/mtg",
        price: 39.99,
        lastAutoPrice: null,
        cost: null,
        stock: 3,
        noSupplier: true,
        fulfillmentMode: "physical_only",
        ownerAuthorized: true,
      },
    ]);
    const offers = (await f.api.rotateDailyOffersUnlocked({}, true)).selected;
    expect(
      offers.map((offer: { productId: string }) => offer.productId),
    ).toEqual(["owner", "tcg-mtg-0", "tcg-mtg-1"]);
    expect(offers[0].amount).toBe(38.8);
    expect(offers[0].compareAtAmount).toBe(39.99);
    expect(
      f.requests.some(
        (request) =>
          request.method !== "GET" && request.path.includes("/variants/"),
      ),
    ).toBe(false);
  });

  it("rechecks live stock before discounting a manual owned product", async () => {
    const f = fixture([
      {
        id: "sold",
        name: "Fallout Commander Deck - Magic: The Gathering",
        category: "tcg/mtg",
        price: 39.99,
        lastAutoPrice: null,
        cost: null,
        stock: 3,
        liveStock: 0,
        noSupplier: true,
        fulfillmentMode: "physical_only",
        ownerAuthorized: true,
      },
    ]);
    expect((await f.api.rotateDailyOffersUnlocked({}, true)).selected).toEqual(
      [],
    );
  });

  it("does not authorize unknown-cost manual discounts from a stale stock snapshot", async () => {
    const f = fixture([
      {
        id: "unknown-live-stock",
        name: "Fallout Commander Deck - Magic: The Gathering",
        category: "tcg/mtg",
        price: 39.99,
        lastAutoPrice: null,
        cost: null,
        stock: 3,
        liveStock: NaN,
        noSupplier: true,
        fulfillmentMode: "physical_only",
        ownerAuthorized: true,
      },
    ]);
    expect((await f.api.rotateDailyOffersUnlocked({}, true)).selected).toEqual(
      [],
    );
  });

  it("retains review and uncapped manual-price guards for physical-only stock", async () => {
    const f = fixture([
      {
        id: "review-owned",
        name: "Fallout Commander Deck - Magic: The Gathering",
        category: "tcg/mtg",
        price: 39.99,
        lastAutoPrice: null,
        cost: null,
        stock: 3,
        noSupplier: true,
        fulfillmentMode: "physical_only",
        tags: ["catalog-review"],
      },
      {
        id: "uncapped",
        name: "Manual-priced figure",
        category: "merchandising",
        price: 39.99,
        lastAutoPrice: null,
        cost: null,
        stock: 3,
        noSupplier: true,
        fulfillmentMode: "physical_only",
      },
    ]);
    expect((await f.api.rotateDailyOffersUnlocked({}, true)).selected).toEqual(
      [],
    );
  });

  it("calculates the offer from the regular EUR price without compounding an active overlay", async () => {
    const f = fixture([
      {
        id: "overlay",
        name: "MTG Play Booster Box",
        category: "tcg/mtg",
        price: 139.99,
        lastAutoPrice: 139.99,
        activeOfferPrice: 129.99,
        cost: 70,
        stock: 6,
      },
    ]);
    const offer = (await f.api.rotateDailyOffersUnlocked({}, true)).selected[0];
    expect(offer.compareAtAmount).toBe(139.99);
    expect(offer.amount).toBe(129.99);
  });

  it("uses the normalized EUR supply cost instead of interpreting a foreign native cost as euros", async () => {
    const f = fixture([
      {
        id: "foreign-cost",
        name: "MTG Play Booster Box",
        category: "tcg/mtg",
        price: 139.99,
        lastAutoPrice: 139.99,
        cost: 70,
        nativeCost: 200,
        costCurrency: "USD",
        stock: 6,
      },
    ]);
    const offer = (await f.api.rotateDailyOffersUnlocked({}, true)).selected[0];
    expect(offer?.amount).toBe(129.99);
  });
  it("reaches fresh offers without spending the request budget inspecting stale supplier candidates", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-26T10:00:00Z"));
    const now = Date.now();
    const stale = productsFor("tcg/stale", 130).map((product) => ({
      ...product,
      lastSeenAt: "2020-01-01T00:00:00Z",
    }));
    const f = fixture([...stale, ...balanced()], false, 700);
    const rotation = f.api.rotateDailyOffersUnlocked({
      request_budget: { deadline_at: now + 70_000 },
    });
    const result = rotation.catch((error: Error) => ({ error: error.name }));
    await vi.runAllTimersAsync();
    expect((await result).selected).toHaveLength(12);
    expect(
      f.requests.some((request) => request.path.includes("tcg-stale")),
    ).toBe(false);
    expect(Date.now() - now).toBeLessThan(70_000);
  });

  it("can still discount owned physical stock when its supplier observation has expired", async () => {
    const f = fixture([
      {
        id: "owned-stock",
        category: "tcg/mtg",
        stock: 1,
        lastSeenAt: "2020-01-01T00:00:00Z",
        fulfillmentMode: "physical_only",
        cost: 20,
      },
    ]);
    const offers = (await f.api.rotateDailyOffersUnlocked({}, true)).selected;
    expect(
      offers.map((offer: { productId: string }) => offer.productId),
    ).toEqual(["owned-stock"]);
    expect(offers[0].physicalStock).toBe(true);
  });

  it("completes twelve offers with rejected candidates inside the expanded daily budget", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const candidates = selection.DAILY_OFFER_CATEGORIES.flatMap((category) => [
      ...productsFor(`${category}/rejected`, 3).map((product) => ({
        ...product,
        price: 29,
      })),
      ...productsFor(category, 3),
    ]);
    const short = fixture(candidates, false, 700)
      .api.rotateDailyOffersUnlocked({
        request_budget: { deadline_at: 25_000 },
      })
      .catch((error: Error) => error.name);
    await vi.runAllTimersAsync();
    expect(await short).toBe("SyncDeferred");
    vi.setSystemTime(0);
    const f = fixture(candidates, false, 700);
    const rotation = f.api.rotateDailyOffersUnlocked({
      request_budget: { deadline_at: 70_000 },
    });
    await vi.runAllTimersAsync();
    expect((await rotation).selected).toHaveLength(12);
    expect(f.state()!.last_rotated_at).toBeTruthy();
    expect(Date.now()).toBeLessThan(70_000);
  });
  it.each([
    false,
    true,
  ])("selects three products per group on saturday=%s", async (saturday) => {
    const f = fixture(balanced(), saturday);
    const result = await f.api.rotateDailyOffersUnlocked({});
    expect(result.selected).toHaveLength(12);
    expect(
      result.selected
        .map((offer: { category: string }) => offer.category)
        .sort(),
    ).toEqual([
      "accesorios",
      "accesorios",
      "accesorios",
      "juegos-de-mesa",
      "juegos-de-mesa",
      "juegos-de-mesa",
      "merchandising",
      "merchandising",
      "merchandising",
      "tcg",
      "tcg",
      "tcg",
    ]);
  });
  it("gives scarce categories room before the 120 candidate inspection limit", async () => {
    const f = fixture([
      ...productsFor("tcg/mtg", 130),
      ...productsFor("juegos-de-mesa/general", 3),
      ...productsFor("accesorios", 3),
      ...productsFor("merchandising", 3),
    ]);
    expect((await f.api.rotateDailyOffersUnlocked({})).selected).toHaveLength(
      12,
    );
  });
  it("leaves missing category slots empty instead of borrowing from other categories", async () => {
    const f = fixture([
      ...productsFor("tcg/mtg", 20),
      ...productsFor("juegos-de-mesa/general", 1),
      ...productsFor("accesorios", 4),
      { id: "unknown", category: null },
      { id: "paint", category: "pinturas" },
    ]);
    const offers = (await f.api.rotateDailyOffersUnlocked({}, true)).selected;
    expect(offers).toHaveLength(7);
    expect(
      offers.map((offer: { productId: string }) => offer.productId),
    ).not.toContain("unknown");
    expect(
      offers.map((offer: { productId: string }) => offer.productId),
    ).not.toContain("paint");
  });
  it("retains protections for manual prices, reviews, books and unpurchasable variants", async () => {
    const f = fixture(
      [
        ...balanced(),
        { id: "manual", category: "tcg/mtg", price: 29 },
        { id: "review", category: "merchandising", tags: ["catalog-review"] },
        { id: "book", category: "rol/otros", name: "Manual del jugador" },
        { id: "isbn", category: "merchandising", sku: "9781234567890" },
        { id: "manga", category: "manga-comic" },
        {
          id: "disabled",
          category: "merchandising",
          fulfillmentMode: "disabled",
        },
        { id: "unavailable", category: "accesorios", purchasable: false },
      ].reverse(),
    );
    const ids = (await f.api.rotateDailyOffersUnlocked({})).selected.map(
      (offer: { productId: string }) => offer.productId,
    );
    for (const id of [
      "manual",
      "review",
      "book",
      "isbn",
      "manga",
      "disabled",
      "unavailable",
    ])
      expect(ids).not.toContain(id);
    expect(ids).toHaveLength(12);
  });
  it("persists the exact Spree variant and price pair used by the price list", async () => {
    const f = fixture(balanced());
    await f.api.rotateDailyOffersUnlocked({});
    const prices = f.requests.find(
      (request) => request.path === "/prices/bulk_upsert",
    )!.body!.prices as Array<{
      variant_id: string;
      amount: number;
      compare_at_amount: number;
    }>;
    const state = f.state()!.active_products as Array<{
      variantId: string;
      amount: number;
      compareAtAmount: number;
      category: string;
    }>;
    expect(state).toHaveLength(12);
    for (const offer of state) {
      expect(offer.category).toBeTruthy();
      expect(prices).toContainEqual(
        expect.objectContaining({
          variant_id: offer.variantId,
          amount: offer.amount,
          compare_at_amount: offer.compareAtAmount,
        }),
      );
      expect(offer.amount).toBeLessThan(offer.compareAtAmount);
    }
  });
  it("keeps Saturday discounts stronger while retaining the same quota", async () => {
    const daily = (await fixture(balanced()).api.rotateDailyOffersUnlocked({}))
      .selected;
    const saturday = (
      await fixture(balanced(), true).api.rotateDailyOffersUnlocked({})
    ).selected;
    expect(saturday).toHaveLength(12);
    for (const offer of saturday)
      expect(offer.amount).toBeLessThan(
        daily.find(
          (row: { productId: string }) => row.productId === offer.productId,
        ).amount,
      );
  });
  it("does not fill quotas with discounts that cannot meet the contribution floor", async () => {
    const f = fixture([
      ...productsFor("merchandising", 4).map((product) => ({
        ...product,
        cost: 23,
      })),
      ...productsFor("accesorios", 3),
    ]);
    const offers = (await f.api.rotateDailyOffersUnlocked({}, true)).selected;
    expect(offers).toHaveLength(3);
    expect(
      offers.every(
        (offer: { category: string }) => offer.category === "accesorios",
      ),
    ).toBe(true);
  });
  it("skips stale, disabled and physical-only supplier stock while preserving physical clearance", async () => {
    const f = fixture([
      { id: "stale", category: "tcg/mtg", lastSeenAt: "2020-01-01T00:00:00Z" },
      { id: "supplier-disabled", category: "tcg/mtg", supplierEnabled: false },
      {
        id: "physical-only-empty",
        category: "tcg/mtg",
        fulfillmentMode: "physical_only",
      },
      {
        id: "clearance",
        category: "tcg/mtg",
        stock: 1,
        fulfillmentMode: "physical_only",
        cost: 20,
      },
      { id: "rpg-starter", category: "rol/otros", name: "Set de inicio" },
    ]);
    const offers = (await f.api.rotateDailyOffersUnlocked({}, true)).selected;
    expect(
      offers.map((offer: { productId: string }) => offer.productId).sort(),
    ).toEqual(["clearance", "rpg-starter"]);
    const physical = offers.find(
      (offer: { productId: string }) => offer.productId === "clearance",
    );
    expect(physical.physicalStock).toBe(true);
    expect(
      physical.amount / 1.21 - 20 - physical.amount * 0.015 - 0.25,
    ).toBeGreaterThanOrEqual(0);
  });
});

describe("complete automatic daily rotations", () => {
  it("does not spend native product requests or replace the list while a category lacks candidates", async () => {
    const f = fixture(productsFor("tcg/mtg", 3));
    const result = await f.api.rotateDailyOffersUnlocked({});
    expect(result.status).toBe("waiting_supply");
    expect(f.requests).toEqual([]);
    expect(f.state()).toBeNull();
  });
  it("retries an incomplete selection on the same day after supply is repaired", async () => {
    const f = fixture(balanced());
    f.setState({
      day_key: "2026-10-11",
      spree_price_list_id: "incomplete",
      last_rotated_at: "done",
      active_products: [],
    });
    expect((await f.api.rotateDailyOffersUnlocked({})).selected).toHaveLength(
      12,
    );
    expect(f.state()!.active_products).toHaveLength(12);
  });
  it("keeps the existing price list when live guards reject a category", async () => {
    const products = balanced().map((p) =>
      p.category === "merchandising" ? { ...p, purchasable: false } : p,
    );
    const f = fixture(products);
    const result = await f.api.rotateDailyOffersUnlocked({});
    expect(result.status).toBe("waiting_catalog");
    expect(f.requests.some((r) => r.method !== "GET")).toBe(false);
    expect(f.state()).toBeNull();
  });
});
