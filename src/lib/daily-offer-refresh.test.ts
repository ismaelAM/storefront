import { describe, expect, it } from "vitest";
import * as selection from "../../supabase/functions/_shared/daily-offer-selection";

const now = Date.parse("2026-10-29T02:00:00Z");
const candidate = (
  id: string,
  category: selection.DailyOfferCategory,
  changes = {},
) => ({
  id,
  source_url: `https://tcgfactory.com/es/${id}.html`,
  productId: id,
  category,
  lastSeenAt: "2026-10-28T00:00:00Z",
  priceReady: true,
  cost: 20,
  ...changes,
});
const plan = (offers: selection.DailyOfferRefreshCandidate[]) =>
  selection.planDailyOfferRefresh(offers, now);

describe("balanced daily supplier refresh", () => {
  it("revalidates the most recently observed cohort before old dead catalog URLs", () => {
    const offers = [
      ...Array.from({ length: 40 }, (_, i) => candidate(`old${i}`, "accesorios", {
        lastSeenAt: "2026-09-01T00:00:00Z",
      })),
      ...Array.from({ length: 3 }, (_, i) => candidate(`recent${i}`, "accesorios", {
        lastSeenAt: "2026-10-28T19:00:00Z",
      })),
    ];
    expect(plan(offers).offers.map((o) => o.id)).toEqual(["recent0", "recent1", "recent2"]);
  });
  it("refreshes the missing category before an oversized general catalog", () => {
    const ready = (["tcg", "juegos-de-mesa", "accesorios"] as const).flatMap(
      (c) =>
        Array.from({ length: 3 }, (_, i) =>
          candidate(`${c}${i}`, c, { lastSeenAt: "2026-10-29T01:00:00Z" }),
        ),
    );
    const merch = Array.from({ length: 5 }, (_, i) =>
      candidate(`merch${i}`, "merchandising", { priceReady: false }),
    );
    const result = plan([
      ...Array.from({ length: 100 }, (_, i) => candidate(`tcg-old${i}`, "tcg")),
      ...ready,
      ...merch,
    ]);
    expect(result.offers.map((o: { id: string }) => o.id)).toEqual([
      "merch0",
      "merch1",
      "merch2",
    ]);
  });
  it("counts unique products and fills only the deficit with a bounded batch", () => {
    const offers = [
      candidate("ready", "tcg", { lastSeenAt: "2026-10-29T01:00:00Z" }),
      candidate("same-product", "tcg", {
        productId: "ready",
        lastSeenAt: "2026-10-29T01:00:00Z",
      }),
      candidate("next", "tcg"),
      candidate("last", "tcg"),
      candidate("extra", "tcg"),
    ];
    expect(plan(offers).offers.map((o: { id: string }) => o.id)).toEqual([
      "next",
      "last",
    ]);
  });
  it("does not retry a recently failed/manual price or trust future timestamps", () => {
    const offers = [
      candidate("recent", "merchandising", {
        priceReady: false,
        lastSeenAt: "2026-10-29T01:55:00Z",
      }),
      candidate("future", "merchandising", {
        lastSeenAt: "2026-10-30T00:00:00Z",
      }),
      candidate("due", "merchandising"),
    ];
    expect(plan(offers).offers.map((o: { id: string }) => o.id)).toEqual([
      "due",
    ]);
  });
  it("leaves the ordinary crawl alone when all four quotas are fresh and priced", () => {
    const offers = (
      ["tcg", "juegos-de-mesa", "accesorios", "merchandising"] as const
    ).flatMap((c) =>
      Array.from({ length: 3 }, (_, i) =>
        candidate(`${c}${i}`, c, { lastSeenAt: "2026-10-29T01:00:00Z" }),
      ),
    );
    expect(plan(offers).offers).toEqual([]);
  });
});

it("does not waste a missing slot on a product already fresh through another variant", () => {
  const offers = [
    candidate("ready", "tcg", { lastSeenAt: "2026-10-29T01:00:00Z" }),
    candidate("old-variant", "tcg", { productId: "ready" }),
    candidate("next", "tcg"),
    candidate("last", "tcg"),
  ];
  expect(plan(offers).offers.map((o) => o.id)).toEqual(["next", "last"]);
});

it("moves past failed attempts without pretending their supplier observation is fresh", () => {
  const offers = [
    candidate("failed", "tcg", { lastAttemptedAt: "2026-10-29T01:00:00Z" }),
    candidate("untried1", "tcg"),
    candidate("untried2", "tcg"),
    candidate("untried3", "tcg"),
  ];
  const result = plan(offers);
  expect(result.counts.tcg).toBe(0);
  expect(result.offers.map((o) => o.id)).toEqual([
    "untried1",
    "untried2",
    "untried3",
  ]);
});

it("shares repeated hourly attempts across categories when one category never becomes price-ready", () => {
  let offers = ["tcg", "merchandising"].flatMap((category) =>
    Array.from({ length: 3 }, (_, i) =>
      candidate(`${category}${i}`, category as selection.DailyOfferCategory, {
        priceReady: false,
      }),
    ),
  );
  const first = selection.planDailyOfferRefresh(offers, now);
  offers = offers.map((o) =>
    first.offers.some((selected) => selected.id === o.id)
      ? { ...o, lastAttemptedAt: new Date(now).toISOString() }
      : o,
  );
  const second = selection.planDailyOfferRefresh(offers, now + 60 * 60 * 1000);
  expect(first.offers).toHaveLength(3);
  expect(second.offers.map((o) => o.id)).toEqual([
    "merchandising0",
    "merchandising1",
    "merchandising2",
  ]);
});
