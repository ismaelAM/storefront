// @vitest-environment node
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";
import { catalogReviewFingerprint, shouldRequireCatalogReview } from "../../supabase/functions/_shared/catalog-publish-policy";

const source = ts.createSourceFile("index.ts", readFileSync("supabase/functions/devir-sync/index.ts", "utf8"), ts.ScriptTarget.Latest, true);
const code = ts.transpileModule(source.statements.filter(node => ts.isFunctionDeclaration(node) && ["adoptPublishedCatalogReview", "humanizeReviewReason", "reviewReasonsFromLastError"].includes(node.name?.text ?? "")).map(node => node.getText(source)).join("\n"), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;

function fixture(decision = "pending", snapshot = "catalan_requires_operator_review", displayed = "") {
  const policy = { id: "cat_1", review_decision: decision, approved_review_fingerprint: null, updated_at: "2026-09-24" };
  let change: Record<string, unknown> | undefined;
  const update = vi.fn((value: Record<string, unknown>) => { change = value; return query; });
  const query = { select: () => query, eq: () => query, update, maybeSingle: async () => ({ data: { ...policy, ...change }, error: null }) };
  const fn = runInNewContext(`${code}; typeof adoptPublishedCatalogReview === "function" ? adoptPublishedCatalogReview : async () => null`, {
    supabase: { from: () => query }, catalogReviewFingerprint,
    productFields: async () => [{ key: "catalog.review_pending_fingerprint", value: snapshot }, { key: "catalog.review_reason", value: displayed }],
  }) as (config: object, product: object, reasons?: string[]) => Promise<typeof policy | null>;
  return { fn, update };
}

describe("publishing in Spree approves the recorded review", () => {
  it("does not invent a review reason from an empty legacy marker", () => {
    const parse = runInNewContext(`${code}; reviewReasonsFromLastError`, {}) as (value: unknown) => string[];
    expect(parse(null)).toEqual([]);
    expect(parse("")).toEqual([]);
  });

  it("checkpoints approved review markers instead of blocking the batch queue", async () => {
    const body = source.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === "refreshHumanReviewMarkersBatch")!;
    const compiled = ts.transpileModule(body.getText(source), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
    const update = vi.fn(() => query);
    const query = {
      select: () => query, eq: () => query, not: () => query, or: () => query, order: () => query, update,
      limit: async () => ({ data: [{ spree_product_id: "prod_1", last_error: "REVIEW: product_image_missing" }], count: 1, error: null }),
      // biome-ignore lint/suspicious/noThenProperty: Models the marker update acknowledgement.
      then: (resolve: (value: unknown) => void) => resolve({ error: null }),
    };
    const run = runInNewContext(`${compiled}; refreshHumanReviewMarkersBatch`, {
      supabase: { from: () => query }, HUMAN_REVIEW_MARKER_VERSION: "review_test",
      reviewReasonsFromLastError: () => ["product_image_missing"], definitions: async () => new Map(),
      spreeRequest: async () => ({ id: "prod_1", status: "active" }),
      adoptPublishedCatalogReview: async () => ({ review_decision: "approved", approved_review_fingerprint: "product_image_missing" }),
      shouldRequireCatalogReview,
    });
    expect(await run({})).toEqual({ processed: 1, remaining: 0 });
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ review_marker_version: "review_test" }));
  });
  it("recognizes a legacy publication using the reasons previously displayed in Spree", async () => {
    const f = fixture("pending", "", "Producto en catalán: revisa si debe publicarse en la tienda.");
    await f.fn({}, { id: "prod_1", status: "active", tags: ["REVISION-HUMANA"] }, ["catalan_requires_operator_review", "supplier_cost_missing"]);
    expect(f.update).toHaveBeenCalledWith(expect.objectContaining({ approved_review_fingerprint: "catalan_requires_operator_review" }));
  });
  it("does not approve new reasons without recorded evidence", async () => {
    const f = fixture("pending", "");
    await f.fn({}, { id: "prod_1", status: "active", tags: ["catalog-review"] }, ["supplier_cost_missing"]);
    expect(f.update).not.toHaveBeenCalled();
  });
  it("persists approval and leaves new reasons pending", async () => {
    const f = fixture();
    const policy = await f.fn({}, { id: "prod_1", status: "active", tags: ["catalog-review"] }, ["catalan_requires_operator_review", "supplier_cost_missing"]);
    expect(f.update).toHaveBeenCalledWith(expect.objectContaining({ review_decision: "approved", approved_review_fingerprint: "catalan_requires_operator_review" }));
    expect(shouldRequireCatalogReview({ reasons: ["catalan_requires_operator_review"], decision: policy?.review_decision as "approved", approvedFingerprint: policy?.approved_review_fingerprint })).toBe(false);
    expect(shouldRequireCatalogReview({ reasons: ["supplier_cost_missing"], decision: "approved", approvedFingerprint: policy?.approved_review_fingerprint })).toBe(true);
  });
  it.each(["draft", "archived"])("does not approve a %s product", async status => {
    const f = fixture(); await f.fn({}, { id: "prod_1", status, tags: ["catalog-review"] });
    expect(f.update).not.toHaveBeenCalled();
  });
  it("does not turn ordinary automatic publication into approval", async () => {
    const f = fixture(); await f.fn({}, { id: "prod_1", status: "active", tags: ["catalog-ready"] });
    expect(f.update).not.toHaveBeenCalled();
  });
  it("does not override an explicit catalog rejection", async () => {
    const f = fixture("rejected"); await f.fn({}, { id: "prod_1", status: "active", tags: ["catalog-review"] });
    expect(f.update).not.toHaveBeenCalled();
  });
});
