// @vitest-environment node
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { createClient } from "@supabase/supabase-js";
import ts from "typescript";
import { describe, expect, it } from "vitest";

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
        node.name?.text === "loadDailyOfferRefresh",
    )
    .map((node) => node.getText(source))
    .join("\n"),
  { compilerOptions: { target: ts.ScriptTarget.ES2022 } },
).outputText;
function row(
  id: string,
  mode: string | null = "supplier_or_physical",
  decision: string | null = "pending",
) {
  return {
    id,
    source_url: `https://supplier.test/${id}`,
    last_seen_at: "2026-11-01",
    updated_at: "2026-11-01",
    normalized_cost: 10,
    minimum_order_quantity: null,
    variant: {
      canonical_sku: id,
      last_auto_price: null,
      fulfillment_mode: mode,
      spree_variant_id: "variant",
      product: {
        id,
        name: "Game",
        category_key: "games",
        spree_product_id: `native-${id}`,
        requires_review: false,
        review_decision: decision,
      },
    },
  };
}
async function load(rows: ReturnType<typeof row>[], applyDbFilters = true) {
  const urls: URL[] = [];
  const delivered: string[] = [];
  const supabase = createClient("https://example.supabase.co", "test-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: async (input) => {
        const url = new URL(String(input));
        urls.push(url);
        // A small relational fixture models WHERE before LIMIT/OFFSET. The real
        // client still serializes the embedded filters and inclusive range.
        const filtered = applyDbFilters
          ? rows.filter(
              (item) =>
                (url.searchParams.get("variant.fulfillment_mode") !==
                  "eq.supplier_or_physical" ||
                  item.variant.fulfillment_mode === "supplier_or_physical") &&
                (url.searchParams.get("variant.product.review_decision") !==
                  "neq.rejected" ||
                  (item.variant.product.review_decision !== null &&
                    item.variant.product.review_decision !== "rejected")),
            )
          : rows;
        const offset = Number(url.searchParams.get("offset") ?? 0);
        const limit = Number(url.searchParams.get("limit") ?? 500);
        const page = filtered.slice(offset, offset + limit);
        delivered.push(...page.map((item) => item.id));
        return new Response(JSON.stringify(page), {
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  });
  let candidates: Array<{ id: string; priceReady: boolean }> = [];
  const run = runInNewContext(`${code}; loadDailyOfferRefresh`, {
    supabase,
    dailyOfferState: async () => null,
    madridDailyOfferDay: () => ({ dayKey: "2026-11-10", saturday: false }),
    dailyOfferCategory: () => "games",
    isBookProduct: () => false,
    isPack: () => false,
    commercialPricingProfile: () => ({ offerEligible: true }),
    dailyOfferPrice: () => ({ amount: 18 }),
    planDailyOfferRefresh: (items: typeof candidates) => {
      candidates = items;
      return { offers: items.map((item) => ({ id: item.id })) };
    },
  });
  const offers = await run({
    id: "supplier",
    code: "tcgfactory",
    config: {},
    stale_after_hours: 8,
  });
  return { offers, urls, delivered, candidates };
}

describe("daily offer refresh database transfer budget", () => {
  it("filters ineligible joined rows before the 10,000-row scan cap", async () => {
    const rows = Array.from({ length: 10000 }, (_, i) =>
      i % 2
        ? row(`rejected-${i}`, "supplier_or_physical", "rejected")
        : row(`physical-${i}`, "physical_only"),
    );
    rows.push(row("eligible"));
    const result = await load(rows);
    expect(result.offers).toEqual([{ id: "eligible" }]);
    expect(result.delivered).toEqual(["eligible"]);
    expect(result.urls).toHaveLength(1);
    expect(result.urls[0].searchParams.get("variant.fulfillment_mode")).toBe(
      "eq.supplier_or_physical",
    );
    expect(
      result.urls[0].searchParams.get("variant.product.review_decision"),
    ).toBe("neq.rejected");
    expect(result.urls[0].searchParams.get("select")).toContain(
      "catalog_supplier_offers_variant_id_fkey!inner",
    );
    expect(result.urls[0].searchParams.get("select")).toContain(
      "catalog_variants_product_id_fkey!inner",
    );
  });

  it("retains the database defaults and does not treat a null price as ready", async () => {
    const result = await load([
      row("default"),
      row("approved", "supplier_or_physical", "approved"),
      row("disabled", "disabled"),
      row("missing-mode", null),
    ]);
    expect(result.candidates).toEqual([
      expect.objectContaining({ id: "default", priceReady: false }),
      expect.objectContaining({ id: "approved", priceReady: false }),
    ]);
  });

  it("retains JS defenses if a response contains ineligible joined rows", async () => {
    const result = await load(
      [
        row("valid"),
        row("physical", "physical_only"),
        row("disabled", "disabled"),
        row("missing-mode", null),
        row("rejected", "supplier_or_physical", "rejected"),
      ],
      false,
    );
    expect(result.offers).toEqual([{ id: "valid" }]);
  });

  it("continues pagination over eligible rows at the existing 500-row boundary", async () => {
    const result = await load(
      Array.from({ length: 501 }, (_, i) => row(`eligible-${i}`)),
    );
    expect(result.offers).toHaveLength(501);
    expect(result.urls.map((url) => url.searchParams.get("offset"))).toEqual([
      "0",
      "500",
    ]);
  });
});
