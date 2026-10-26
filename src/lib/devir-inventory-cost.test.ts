// @vitest-environment node
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";

const source = ts.createSourceFile(
  "index.ts",
  readFileSync("supabase/functions/devir-sync/index.ts", "utf8"),
  ts.ScriptTarget.Latest,
  true,
);
const body = source.statements.find(
  (node) =>
    ts.isFunctionDeclaration(node) &&
    node.name?.text === "stockItemsForVariant",
);
if (!body) throw new Error("Missing production inventory reader");
const code = ts.transpileModule(body.getText(source), {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText;

function inventoryReader(request: (...args: unknown[]) => Promise<unknown>) {
  return runInNewContext(`${code}; stockItemsForVariant`, {
    spreeRequest: request,
    isSyncDeferred: (error: Error) => error.name === "SyncDeferred",
  }) as (config: object, variantId: string) => Promise<unknown[]>;
}

describe("Bounded inventory lookup", () => {
  it("accepts a confirmed empty first page without scanning the whole store", async () => {
    const request = vi.fn(async (_config, _method, path) => {
      if (String(path).startsWith("/stock_items?q[variant_id_eq]=")) {
        // Actual owned Spree response for a variant without a stock item.
        return {
          data: [],
          meta: { count: 0, page: 1, pages: 1, next: null, limit: 100 },
        };
      }
      // The compatibility predicate is ignored by Spree: every page would
      // serialize unrelated stock and enqueue an API-key bookkeeping job.
      return {
        data: [{ id: "si_other", variant_id: "variant_other" }],
        meta: { page: 1, pages: 1, next: null, count: 1 },
      };
    });
    expect(
      await inventoryReader(request)(
        { spree_api_url: "https://project-7ck7q.vercel.app" },
        "variant_empty",
      ),
    ).toEqual([]);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("keeps the compatibility fallback when a backend ignores a filter", async () => {
    const target = { id: "si_target", variant_id: "variant_target" };
    const request = vi.fn(async (_config, _method, path) => ({
      data: String(path).startsWith("/stock_items?q[variant_id_eq]=")
        ? [{ id: "si_other", variant_id: "variant_other" }]
        : [target],
      meta: { count: 1, pages: 1, next: null },
    }));
    expect(await inventoryReader(request)({}, "variant_target")).toEqual([
      target,
    ]);
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("does not accept empty data with a contradictory non-zero count", async () => {
    const target = { id: "si_target", variant_id: "variant_target" };
    const request = vi.fn(async (_config, _method, path) => ({
      data: String(path).startsWith("/stock_items?q[variant_id_eq]=")
        ? []
        : [target],
      meta: { count: 1, pages: 1, next: null },
    }));
    expect(
      await inventoryReader(request)(
        { spree_api_url: "https://project-7ck7q.vercel.app" },
        "variant_target",
      ),
    ).toEqual([target]);
  });

  it("retains empty-result compatibility for legacy backends without verified prefixed-ID filters", async () => {
    const target = { id: "si_target", variant_id: "variant_target" };
    const request = vi.fn(async (_config, _method, path) => ({
      data: String(path).startsWith("/stock_items?q[variant_id_eq]=")
        ? []
        : [target],
      meta: { count: 0, pages: 1, next: null },
    }));
    expect(
      await inventoryReader(request)(
        { spree_api_url: "https://legacy.invalid" },
        "variant_target",
      ),
    ).toEqual([target]);
  });
});
