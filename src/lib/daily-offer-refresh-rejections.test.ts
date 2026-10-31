// @vitest-environment node
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import * as selection from "../../supabase/functions/_shared/daily-offer-selection";

const source = ts.createSourceFile(
  "index.ts",
  readFileSync("supabase/functions/devir-sync/index.ts", "utf8"),
  ts.ScriptTarget.Latest,
  true,
);
const code = ts.transpileModule(
  source.statements
    .filter(
      (n) =>
        ts.isFunctionDeclaration(n) && n.name?.text === "loadDailyOfferRefresh",
    )
    .map((n) => n.getText(source))
    .join("\n"),
  { compilerOptions: { target: ts.ScriptTarget.ES2022 } },
).outputText;
const now = Date.parse("2026-10-31T19:00:00Z");
const rows = [0, 1, 2, 3].map((i) => ({
  id: `offer${i}`,
  source_url: `https://supplier.test/${i}`,
  normalized_cost: 10,
  last_seen_at: i < 3 ? "2026-10-31T18:00:00Z" : "2026-10-30T12:00:00Z",
  updated_at: "2026-10-30T12:00:00Z",
  minimum_order_quantity: null,
  variant: {
    canonical_sku: `sku${i}`,
    last_auto_price: 20,
    fulfillment_mode: "supplier_or_physical",
    spree_variant_id: `v${i}`,
    product: {
      id: `p${i}`,
      name: `Game ${i}`,
      category_key: "juegos-de-mesa/general",
      spree_product_id: `native${i}`,
      requires_review: false,
      review_decision: "approved",
    },
  },
}));
async function refresh(pending: unknown) {
  const query = {
    select: () => query,
    eq: () => query,
    gt: () => query,
    not: () => query,
    order: () => query,
    range: async () => ({ data: rows, error: null }),
  };
  const run = runInNewContext(`${code}; loadDailyOfferRefresh`, {
    ...selection,
    supabase: { from: () => query },
    dailyOfferState: async () => ({
      day_key: "2026-10-30",
      pending_rotation: pending,
    }),
    madridCommercialDay: () => ({ dayKey: "2026-10-31", saturday: true }),
    isBookProduct: () => false,
    isPack: () => false,
    commercialPricingProfile: () => ({ offerEligible: true }),
    dailyOfferPrice: () => ({ amount: 19 }),
    Date: class extends Date {
      static now() {
        return now;
      }
    },
  });
  return run({
    id: "supplier",
    code: "tcgfactory",
    config: {},
    stale_after_hours: 8,
  });
}
describe("daily refresh follows native eligibility", () => {
  it("finds a replacement when a fresh product was rejected for a manual price", async () => {
    expect(
      await refresh({ dayKey: "2026-10-31", rejectedProductIds: ["native2"] }),
    ).toEqual([{ id: "offer3", source_url: "https://supplier.test/3" }]);
  });
  it("expires exclusions with the Madrid commercial day", async () => {
    expect(
      await refresh({ dayKey: "2026-10-30", rejectedProductIds: ["native2"] }),
    ).toEqual([]);
  });
  it("keeps an already complete valid cohort without extra supplier work", async () => {
    expect(await refresh(null)).toEqual([]);
  });
});
