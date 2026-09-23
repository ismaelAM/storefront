// @vitest-environment node
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";

// Run the real function bodies without starting Deno.serve or reading secrets.
const source = ts.createSourceFile("index.ts", readFileSync("supabase/functions/devir-sync/index.ts", "utf8"), ts.ScriptTarget.Latest, true);
const names = ["operatorAction", "operatorAuthorized", "validateSpreeAdminKey", "stockItemsForVariant", "setVariantBackorderability", "spreeList", "spreeListAll", "syncSpecialPriceRows"];
const bodies = source.statements.filter(node => ts.isFunctionDeclaration(node) && names.includes(node.name?.text ?? "")).map(node => node.getText(source)).join("\n");
const code = ts.transpileModule(bodies, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;

function fixture(overrides: Record<string, unknown> = {}) {
  const update = vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) }));
  const fetch = vi.fn(async () => Response.json({ data: [] }));
  const devirFetch = vi.fn(async () => "authenticated fixture");
  const spreeRequest = vi.fn();
  const api = runInNewContext(`${code}; ({ operatorAction, validateSpreeAdminKey, stockItemsForVariant, setVariantBackorderability, syncSpecialPriceRows })`, {
    Request, Response, URL, fetch, devirFetch, spreeRequest,
    json: (body: unknown, status = 200) => Response.json(body, { status }),
    sha256: async (value: string) => createHash("sha256").update(value).digest("hex"),
    supabase: { from: () => ({ update }) },
    ...overrides,
  }) as {
    operatorAction: (action: string, req: Request, config: Record<string, unknown>, body: Record<string, unknown>) => Promise<Response>;
    validateSpreeAdminKey: (url: string, key: string) => Promise<void>;
    stockItemsForVariant: (config: object, id: string) => Promise<Array<typeof stock>>;
    setVariantBackorderability: (config: object, productId: string, variantId: string, desired: boolean) => Promise<number>;
    syncSpecialPriceRows: (config: object, program: object, priceList: object) => Promise<number>;
  };
  return { api, fetch, devirFetch, spreeRequest, update };
}
const config = { spree_admin_api_key: "sk_existing_fixture", spree_api_url: "https://bisontcg.spree.sh", base_url: "https://b2bdevir.es" };
const stock = { id: "si_target", variant_id: "variant_target", count_on_hand: -2, stock_location_id: "sl_1", backorderable: false };
const req = (key = config.spree_admin_api_key) => new Request("https://worker.invalid", { headers: { "x-spree-admin-key": key } });

describe("Devir bootstrap authorization", () => {
  it("rejects a different key before any network or configuration write", async () => {
    const f = fixture();
    const response = await f.api.operatorAction("bootstrap", req("sk_wrong"), config, { sessionState: {} });
    expect(response.status).toBe(401);
    expect(f.fetch).not.toHaveBeenCalled();
    expect(f.devirFetch).not.toHaveBeenCalled();
    expect(f.update).not.toHaveBeenCalled();
  });
  it.each([
    { spreeApiUrl: "https://untrusted.invalid" },
    { spreeApiUrl: "https://bisontcg.spree.sh@untrusted.invalid" },
    { spreeApiUrl: "http://bisontcg.spree.sh" },
    { baseUrl: "https://untrusted.invalid" },
    { baseUrl: "https://b2bdevir.es/other/path" },
  ])("rejects caller-selected destinations even for first installation: %j", async (body) => {
    const f = fixture();
    const response = await f.api.operatorAction("bootstrap", req(), { ...config, spree_admin_api_key: null }, { sessionState: {}, ...body });
    expect(response.status).toBe(400);
    expect(f.fetch).not.toHaveBeenCalled();
    expect(f.update).not.toHaveBeenCalled();
  });
  it.each([config, { ...config, spree_admin_api_key: null }])("preserves authorized bootstrap against trusted servers", async (existing) => {
    const f = fixture();
    const response = await f.api.operatorAction("bootstrap", req(), existing, { sessionState: {} });
    expect(response.status).toBe(200);
    expect(f.fetch).toHaveBeenCalledWith("https://bisontcg.spree.sh/api/v3/admin/products?limit=1", expect.objectContaining({ redirect: "error" }));
    expect(f.update).toHaveBeenCalledTimes(1);
  });
  it("does not write configuration if trusted Spree rejects the key", async () => {
    const f = fixture();
    f.fetch.mockResolvedValueOnce(Response.json({}, { status: 401 }));
    await expect(f.api.operatorAction("bootstrap", req(), config, { sessionState: {} })).rejects.toThrow();
    expect(f.update).not.toHaveBeenCalled();
  });
});

describe("BISON3 catalog coverage", () => {
  it("syncs every eligible variant beyond the API row limit", async () => {
    const rows = Array.from({ length: 1250 }, (_, index) => ({
      variant_id: `catalog_${index}`, canonical_sku: `SKU_${index}`,
      spree_variant_id: `variant_${index}`, normalized_cost: 5, supplier_code: "fixture",
    }));
    const ranges: Array<[number, number]> = [];
    const supplyQuery = {
      select: () => supplyQuery, not: () => supplyQuery, order: () => supplyQuery,
      // Simulate the API's default row cap if no page is requested.
      // biome-ignore lint/suspicious/noThenProperty: PostgREST query builders are intentionally thenable.
      then: (resolve: (value: unknown) => void) => resolve({ data: rows.slice(0, 1000), error: null }),
      range: async (start: number, end: number) => {
        ranges.push([start, end]);
        return { data: rows.slice(start, end + 1), error: null };
      },
    };
    const f = fixture({
      specialProgramPrice: () => 10,
      isFixedPriceBookSku: () => false,
      supabase: { from: (table: string) => {
        if (table === "catalog_selected_supply") return supplyQuery;
        if (table === "catalog_variants") return { select: () => ({
          in: async (_key: string, ids: string[]) => ({ data: ids.map(id => ({ id, last_auto_price: 20 })), error: null }),
        }) };
        return { update: () => ({ eq: async () => ({ error: null }) }) };
      } },
    });
    expect(await f.api.syncSpecialPriceRows({}, { code: "BISON3", target_margin: 0.03 }, { id: "pl_fixture" })).toBe(1250);
    expect(ranges.length).toBeGreaterThan(1);
    const written = f.spreeRequest.mock.calls.flatMap(call => call[3].prices);
    expect(written).toHaveLength(1250);
    expect(new Set(written.map(row => row.variant_id)).size).toBe(1250);
  });
});

describe("Devir inventory boundaries", () => {
  it("never returns another variant when a server ignores search filters", async () => {
    const f = fixture();
    f.spreeRequest.mockResolvedValue({ data: [{ ...stock, variant_id: "variant_other" }, stock] });
    expect(await f.api.stockItemsForVariant({}, "variant_target")).toEqual([stock]);
  });
  it("reads subsequent pages when meta.pages exists without meta.next", async () => {
    const f = fixture();
    f.spreeRequest.mockImplementation(async (_config, _method, path: string) => path.includes("page=2")
      ? { data: [stock], meta: { page: 2, pages: 2 } }
      : { data: Array.from({ length: 100 }, (_, i) => ({ ...stock, id: `other_${i}`, variant_id: "other" })), meta: { page: 1, pages: 2 } });
    expect(await f.api.stockItemsForVariant({}, "variant_target")).toEqual([stock]);
  });
  it("reports a silently ignored update without deleting or rewriting quantity", async () => {
    const f = fixture();
    f.spreeRequest.mockResolvedValue({ data: [stock] });
    await expect(f.api.setVariantBackorderability({}, "product_1", "variant_target", true)).rejects.toThrow();
    const writes = f.spreeRequest.mock.calls.filter(call => call[1] !== "GET");
    expect(writes).toEqual([[{}, "PATCH", "/stock_items/si_target", { backorderable: true }]]);
  });
  it("confirms a successful boolean update while preserving negative stock", async () => {
    const f = fixture();
    let current = { ...stock };
    f.spreeRequest.mockImplementation(async (_config, method, _path, body) => {
      if (method === "PATCH") current = { ...current, ...body };
      return method === "GET" ? { data: [current] } : current;
    });
    expect(await f.api.setVariantBackorderability({}, "product_1", "variant_target", true)).toBe(1);
    expect(current.count_on_hand).toBe(-2);
  });
  it("does not report success when stock rows disappear during verification", async () => {
    const f = fixture();
    let patched = false;
    f.spreeRequest.mockImplementation(async (_config, method) => {
      if (method === "PATCH") patched = true;
      return { data: patched ? [] : [stock] };
    });
    await expect(f.api.setVariantBackorderability({}, "product_1", "variant_target", true)).rejects.toThrow();
  });
  it("aborts before writing when the listing exceeds the pagination limit", async () => {
    const f = fixture();
    f.spreeRequest.mockResolvedValue({ data: [stock], meta: { pages: 26 } });
    await expect(f.api.setVariantBackorderability({}, "product_1", "variant_target", true)).rejects.toThrow("paginación");
    expect(f.spreeRequest.mock.calls.every(call => call[1] === "GET")).toBe(true);
  });
  it("aborts before writing when a stock item has no variant identity", async () => {
    const f = fixture();
    f.spreeRequest.mockResolvedValue({ data: [{ ...stock, variant_id: undefined }] });
    await expect(f.api.setVariantBackorderability({}, "product_1", "variant_target", true)).rejects.toThrow("identidad");
    expect(f.spreeRequest.mock.calls.every(call => call[1] === "GET")).toBe(true);
  });
  it("does not write when the boolean already matches", async () => {
    const f = fixture();
    f.spreeRequest.mockResolvedValue({ data: [stock] });
    expect(await f.api.setVariantBackorderability({}, "product_1", "variant_target", false)).toBe(0);
    expect(f.spreeRequest.mock.calls.every(call => call[1] === "GET")).toBe(true);
  });
});
