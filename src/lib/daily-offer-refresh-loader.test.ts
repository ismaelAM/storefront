// @vitest-environment node
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { expect, it } from "vitest";
import {
  dailyOfferCategory,
  planDailyOfferRefresh,
} from "../../supabase/functions/_shared/daily-offer-selection";
import { requiresManualPackSplitReview } from "../../supabase/functions/_shared/mtg-precon-policy";

it("keeps a supplier pack requiring physical splitting out of the ready daily cohort", async () => {
  const source = ts.createSourceFile(
    "index.ts",
    readFileSync("supabase/functions/devir-sync/index.ts", "utf8"),
    ts.ScriptTarget.Latest,
    true,
  );
  const code = ts.transpileModule(
    source.statements
      .filter(
        (node) =>
          ts.isFunctionDeclaration(node) &&
          ["isPack", "loadDailyOfferRefresh"].includes(node.name?.text ?? ""),
      )
      .map((node) => node.getText(source))
      .join("\n"),
    { compilerOptions: { target: ts.ScriptTarget.ES2022 } },
  ).outputText;
  const recent = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const old = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const rows = [
    ["ready1", "Play Booster Display (30 sobres) Magic", recent],
    ["ready2", "Play Booster Display (30 sobres) Magic", recent],
    [
      "pack",
      "Commander Display (4 mazos) Marvel Super Heroes Inglés - Magic The Gathering",
      recent,
    ],
    ["due", "Play Booster Display (30 sobres) Magic", old],
  ].map(([id, name, time]) => ({
    id,
    source_url: `https://tcgfactory.com/es/${id}.html`,
    last_seen_at: time,
    updated_at: time,
    normalized_cost: 10,
    minimum_order_quantity: null,
    variant: {
      canonical_sku: id,
      last_auto_price: 20,
      fulfillment_mode: "supplier_or_physical",
      spree_variant_id: `variant_${id}`,
      product: {
        id,
        name,
        category_key: "tcg/mtg",
        spree_product_id: `prod_${id}`,
        requires_review: false,
        review_decision: "pending",
      },
    },
  }));
  const query = Object.fromEntries(
    ["select", "eq", "gt", "not", "order"].map((name) => [
      name,
      function () {
        return query;
      },
    ]),
  ) as Record<string, unknown>;
  query.range = async () => ({ data: rows, error: null });
  const load = runInNewContext(`${code}; loadDailyOfferRefresh`, {
    supabase: { from: () => query },
    dailyOfferCategory,
    planDailyOfferRefresh,
    isBookProduct: () => false,
    requiresManualPackSplitReview,
    commercialPricingProfile: () => ({ offerEligible: true }),
    dailyOfferPrice: () => ({ amount: 18, discount: 0.1 }),
    madridCommercialDay: () => ({ saturday: false }),
  });
  expect(
    await load({
      id: "supplier",
      code: "tcgfactory",
      config: {},
      stale_after_hours: 8,
    }),
  ).toEqual([{ id: "due", source_url: "https://tcgfactory.com/es/due.html" }]);
});
