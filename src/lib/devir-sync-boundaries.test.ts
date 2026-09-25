// @vitest-environment node
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";
import { isCatalogReviewApproved } from "../../supabase/functions/_shared/catalog-publish-policy";
import { supplierPackChildVariantIds } from "../../supabase/functions/_shared/mtg-precon-policy";

// Run the real function bodies without starting Deno.serve or reading secrets.
const rawSource = readFileSync("supabase/functions/devir-sync/index.ts", "utf8");
const source = ts.createSourceFile("index.ts", rawSource, ts.ScriptTarget.Latest, true);
const names = ["decodeHtml", "stripHtml", "parseAvailability", "operatorAction", "operatorAuthorized", "validateSpreeAdminKey", "stockItemsForVariant", "setVariantBackorderability", "spreeList", "spreeListAll", "syncSpecialPriceRows", "patchVariantInventory", "initializeVerifiedEmptyBackorderStock", "definitions", "retireReplacementSource", "reconcileUnavailableTcgFactoryProduct", "recoverExpiredCycleJobs", "finishCycle", "retireMissingDevirOffers", "normalizeGroupKey", "safeMangaEditionSuffix", "groupingInfo", "tcgFactoryItemFailureDisposition"];
const bodies = source.statements.filter(node => ts.isFunctionDeclaration(node) && names.includes(node.name?.text ?? "")).map(node => node.getText(source)).join("\n");
const code = ts.transpileModule(bodies, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;

function fixture(overrides: Record<string, unknown> = {}) {
  const update = vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) }));
  const fetch = vi.fn(async () => Response.json({ data: [] }));
  const devirFetch = vi.fn(async () => "authenticated fixture");
  const spreeRequest = vi.fn();
  const api = runInNewContext(`${code}; ({ operatorAction, validateSpreeAdminKey, stockItemsForVariant, setVariantBackorderability, syncSpecialPriceRows, patchVariantInventory, initializeVerifiedEmptyBackorderStock, definitions, retireReplacementSource, reconcileUnavailableTcgFactoryProduct, recoverExpiredCycleJobs, finishCycle, groupingInfo, tcgFactoryItemFailureDisposition })`, {
    Request, Response, URL, fetch, devirFetch, spreeRequest,
    json: (body: unknown, status = 200) => Response.json(body, { status }),
    sha256: async (value: string) => createHash("sha256").update(value).digest("hex"),
    supabase: { from: () => ({ update }) },
    defaultStockLocationId: async () => "sl_1",
    categoryKey: (product: { name?: string }) =>
      /Pathfinder/i.test(String(product.name ?? ""))
        ? "rol/pathfinder"
        : "manga-comic",
    ...overrides,
  }) as {
    operatorAction: (action: string, req: Request, config: Record<string, unknown>, body: Record<string, unknown>) => Promise<Response>;
    validateSpreeAdminKey: (url: string, key: string) => Promise<void>;
    stockItemsForVariant: (config: object, id: string) => Promise<Array<typeof stock>>;
    setVariantBackorderability: (config: object, productId: string, variantId: string, desired: boolean) => Promise<number>;
    syncSpecialPriceRows: (config: object, program: object, priceList: object) => Promise<number>;
    patchVariantInventory: (config: object, productId: string, variantId: string, quantity: number, backorder: boolean, preorder: boolean, date: string | null, initialize?: boolean) => Promise<unknown>;
    initializeVerifiedEmptyBackorderStock: (config: object, productId: string, variantId: string) => Promise<number>;
    definitions: (config: object) => Promise<Map<string, unknown>>;
    retireReplacementSource: (config: object, productId: string, replacementId: string) => Promise<void>;
    reconcileUnavailableTcgFactoryProduct: (config: object, supplierId: string, product: object, runId: string | null, categories: unknown[], defs: Map<string, unknown>) => Promise<void>;
    recoverExpiredCycleJobs: (cycleId: string) => Promise<void>;
    finishCycle: (config: object, cycleId: string) => Promise<boolean>;
    groupingInfo: (product: { name: string }) => {
      itemKind: "standalone" | "variant_candidate";
      groupKey: string | null;
      groupName: string | null;
      variantLabel: string | null;
      variantPosition: number | null;
      confidence: "none" | "high" | "ambiguous";
    };
    tcgFactoryItemFailureDisposition: (error: unknown) => "retry" | "skip" | "fail";
    parseAvailability: (html: string) => {
      availability: "available" | "preorder" | "unavailable" | "unknown";
      label: string | null;
    };
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

describe("Supplier pack child stock propagation", () => {
  const helperSource = source.statements
    .filter(
      node =>
        ts.isFunctionDeclaration(node) &&
        ["supplierPackSplitApproved", "syncApprovedSupplierPackChildren"].includes(
          node.name?.text ?? "",
        ),
    )
    .map(node => node.getText(source))
    .join("\n");
  const helperCode = ts.transpileModule(helperSource, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText;

  function packFixture(
    availability: "available" | "preorder" | "unavailable",
    managedVariantIds = ["variant_pack"],
  ) {
    const setVariantBackorderability = vi.fn(async () => 1);
    const spreeRequest = vi.fn(async () => ({}));
    const query = {
      select: () => query,
      eq: () => query,
      not: async () => ({
        data: managedVariantIds.map(spree_variant_id => ({ spree_variant_id })),
        error: null,
      }),
    };
    const run = runInNewContext(
      `${helperCode}; syncApprovedSupplierPackChildren`,
      {
        supabase: { from: () => query },
        spreeList: async () => [
          { id: "variant_pack" },
          { id: "variant_child_a" },
          { id: "variant_child_b" },
          ...(managedVariantIds.includes("variant_pack_2")
            ? [{ id: "variant_pack_2" }]
            : []),
        ],
        setVariantBackorderability,
        spreeRequest,
        isCatalogReviewApproved,
        supplierPackChildVariantIds,
      },
    ) as (
      config: object,
      context: object,
      productId: string,
      availability: "available" | "preorder" | "unavailable",
      releaseDate: string | null,
    ) => Promise<number>;

    return {
      run,
      setVariantBackorderability,
      spreeRequest,
      context: {
        catalogProductId: "catalog_product_1",
        reviewDecision: "approved",
        approvedReviewFingerprint: "pack_requires_operator_split",
      },
      availability,
    };
  }

  it("turns every manual child off when the supplier pack is unavailable", async () => {
    const f = packFixture("unavailable");
    expect(
      await f.run({}, f.context, "prod_1", f.availability, null),
    ).toBe(2);
    expect(f.setVariantBackorderability).toHaveBeenCalledTimes(2);
    expect(f.setVariantBackorderability).toHaveBeenCalledWith(
      {},
      "prod_1",
      "variant_child_a",
      false,
    );
    expect(f.setVariantBackorderability).toHaveBeenCalledWith(
      {},
      "prod_1",
      "variant_child_b",
      false,
    );
    expect(f.spreeRequest).toHaveBeenCalledWith(
      {},
      "PATCH",
      "/products/prod_1/variants/variant_child_a",
      expect.objectContaining({
        preorderable: false,
        preorder_ships_at: null,
      }),
    );
  });

  it("enables supplier fulfillment on children when the approved pack is available", async () => {
    const f = packFixture("available");
    await f.run({}, f.context, "prod_1", f.availability, null);
    expect(f.setVariantBackorderability).toHaveBeenCalledWith(
      {},
      "prod_1",
      "variant_child_a",
      true,
    );
  });

  it("does nothing before the operator approves the pack split", async () => {
    const f = packFixture("available");
    await f.run(
      {},
      { ...f.context, reviewDecision: "pending", approvedReviewFingerprint: null },
      "prod_1",
      f.availability,
      null,
    );
    expect(f.setVariantBackorderability).not.toHaveBeenCalled();
  });

  it("does not fan out when more than one catalog-managed pack source exists", async () => {
    const f = packFixture("unavailable", ["variant_pack", "variant_pack_2"]);
    expect(
      await f.run({}, f.context, "prod_1", f.availability, null),
    ).toBe(0);
    expect(f.setVariantBackorderability).not.toHaveBeenCalled();
  });

  it("wires the cascade into both eligible and no-offer reconciliation paths", () => {
    expect(
      rawSource.match(/syncApprovedSupplierPackChildren\(/g)?.length ?? 0,
    ).toBeGreaterThanOrEqual(3);
    expect(rawSource).toContain(
      'mappedProductId,\n      "unavailable",\n      null,',
    );
    expect(rawSource).toContain(
      "productId,\n      product.availability,\n      product.releaseDate,",
    );
  });
});

describe("Catalog maintenance resilience", () => {
  it("treats TcgFactory product-lock contention as retryable", () => {
    const f = fixture();
    expect(
      f.api.tcgFactoryItemFailureDisposition(
        new Error("El producto cat_1 está siendo sincronizado por otro worker"),
      ),
    ).toBe("retry");
  });

  it("treats stale TcgFactory listing 404s as non-fatal skips", () => {
    const f = fixture();
    expect(
      f.api.tcgFactoryItemFailureDisposition(
        new Error("TcgFactory HTTP 404 en /es/distribucion/producto-antiguo.html"),
      ),
    ).toBe("skip");
  });

  it("keeps genuine TcgFactory validation failures fatal", () => {
    const f = fixture();
    expect(
      f.api.tcgFactoryItemFailureDisposition(
        new Error("Precio B2B inválido"),
      ),
    ).toBe("fail");
  });

  it("does not advance the TcgFactory cursor over a retryable product lock", () => {
    const fn = source.statements.find(
      node => ts.isFunctionDeclaration(node) && node.name?.text === "tcgFactoryTick",
    );
    const body = fn?.getText(source) ?? "";
    expect(body).toContain("retryBlocked = true");
    expect(body).toContain("consumeThisItem = false");
    expect(body).toContain("offset + consumed");
    expect(body).not.toContain("offset + urls.length");
  });

  it("physical-only maintenance only enforces flags and never republishes or rewrites quantities", () => {
    const fn = source.statements.find(
      node =>
        ts.isFunctionDeclaration(node) &&
        node.name?.text === "reconcilePhysicalOnlyCatalogBatch",
    );
    const body = fn?.getText(source) ?? "";
    expect(body).toContain("enforceVariantFulfillmentFlags");
    expect(body).toContain('"unavailable"');
    expect(body).toContain('"physical_only"');
    expect(body).not.toContain("preparePublishBatch");
    expect(body).not.toContain("markCatalogProductDirty");
    expect(body).not.toContain("count_on_hand");
  });

  it("rotates a failing physical-only product instead of hammering it forever", () => {
    const fn = source.statements.find(
      node =>
        ts.isFunctionDeclaration(node) &&
        node.name?.text === "reconcilePhysicalOnlyCatalogBatch",
    );
    const body = fn?.getText(source) ?? "";
    const catchIndex = body.indexOf("catch (error)");
    expect(catchIndex).toBeGreaterThan(0);
    expect(body.slice(catchIndex)).toContain(
      '.update({ updated_at: new Date().toISOString() })',
    );
  });
});

describe("Manga grouping review policy", () => {
  it.each([
    [
      "Los diarios de la boticaria núm. 01. Edición aniversario.",
      "Tomo 01 · Edición aniversario.",
    ],
    [
      "Los diarios de la boticaria núm. 15 (Ed. Especial)",
      "Tomo 15 · (Ed. Especial)",
    ],
    ["Serie manga - Tomo 03", "Tomo 03"],
  ])("treats recognized manga editions as high-confidence variants: %s", (name, label) => {
    const f = fixture();
    expect(f.api.groupingInfo({ name })).toEqual(
      expect.objectContaining({
        itemKind: "variant_candidate",
        variantLabel: label,
        confidence: "high",
      }),
    );
  });

  it("keeps an unknown manga suffix in human review", () => {
    const f = fixture();
    expect(
      f.api.groupingInfo({ name: "Serie manga vol. 02 - Cofre sorpresa" }),
    ).toEqual(
      expect.objectContaining({
        itemKind: "variant_candidate",
        confidence: "ambiguous",
      }),
    );
  });

  it("does not auto-approve Tome grouping outside the manga category", () => {
    const f = fixture();
    expect(
      f.api.groupingInfo({
        name: "Pathfinder 2ª ed. - Forjador de reyes - Tomo 1",
      }),
    ).toEqual(
      expect.objectContaining({
        itemKind: "variant_candidate",
        confidence: "ambiguous",
      }),
    );
  });

  it("recomputes grouping review instead of trusting stale legacy confidence", () => {
    expect(rawSource).toContain(
      'groupingInfo(legacyProduct).confidence === "ambiguous"',
    );
    expect(rawSource).toContain(
      "const reasons = await currentCatalogReviewReasonsForSpreeProduct(productId);",
    );
  });
});

describe("Catalog safety boundaries", () => {
  it("runs the lightweight stale-supply guard before an active Devir cycle", () => {
    const staleGuard = rawSource.indexOf(
      "await reconcileStaleCatalogBatch(config, 10, false);",
    );
    const cyclePriority = rawSource.indexOf(
      "return await processDevirCycleTick(config);",
    );
    const optionalMaintenance = rawSource.indexOf(
      "const reviewMarkers = await refreshHumanReviewMarkersBatch(config);",
    );
    expect(staleGuard).toBeGreaterThan(0);
    expect(cyclePriority).toBeGreaterThan(staleGuard);
    expect(optionalMaintenance).toBeGreaterThan(cyclePriority);
  });

  it("keeps the active-crawl stale guard sellability-only", () => {
    expect(rawSource).toContain(
      "async function reconcileStaleCatalogBatch(\n  config: ConfigRow,\n  limit = 20,\n  refreshPublishState = true,",
    );
    expect(rawSource).toContain(
      "if (synced.productId && refreshPublishState)",
    );
  });

  it("continues without optional custom-field metadata when Spree definitions fail", async () => {
    const f = fixture();
    f.spreeRequest.mockRejectedValue(new Error("Spree 500 custom fields"));
    const defs = await f.api.definitions({});
    expect(defs.size).toBe(0);
  });

  it("archives merged draft products instead of deleting them", async () => {
    const f = fixture();
    f.spreeRequest.mockImplementation(async (_config, method) =>
      method === "GET"
        ? { id: "prod_old", status: "draft", tags: ["devir-group"] }
        : { id: "prod_old", status: "archived" });
    await f.api.retireReplacementSource({}, "prod_old", "prod_new");
    expect(f.spreeRequest.mock.calls.some(call => call[1] === "DELETE")).toBe(false);
    expect(f.spreeRequest).toHaveBeenCalledWith(
      {},
      "PATCH",
      "/products/prod_old",
      expect.objectContaining({ status: "archived" }),
    );
  });

  it("does not draft a product merely because TcgFactory reports unavailable", async () => {
    const query = {
      update: () => query,
      eq: () => query,
      select: async () => ({ data: [{ variant_id: "variant_fixture" }], error: null }),
    };
    const f = fixture({
      supabase: { from: () => query },
      loadCatalogVariant: async () => ({ product: {}, variant: {} }),
      reconcileCatalogVariant: async () => ({ productId: "prod_fixture" }),
    });
    await f.api.reconcileUnavailableTcgFactoryProduct(
      {},
      "supplier_fixture",
      { availability: "unavailable", sourceUrl: "https://tcgfactory.com/product-fixture" },
      "run_fixture",
      [],
      new Map(),
    );
    expect(f.spreeRequest).not.toHaveBeenCalled();
  });

  it("requeues only expired processing jobs", async () => {
    const calls: Array<[string, unknown]> = [];
    const query = {
      update: (value: unknown) => { calls.push(["update", value]); return query; },
      eq: (key: string, value: unknown) => { calls.push([key, value]); return query; },
      lt: (key: string, value: unknown) => { calls.push([`lt:${key}`, value]); return query; },
      // biome-ignore lint/suspicious/noThenProperty: Models a PostgREST update query.
      then: (resolve: (value: unknown) => void) => resolve({ error: null }),
    };
    const f = fixture({ supabase: { from: () => query } });
    await f.api.recoverExpiredCycleJobs("cycle_fixture");
    expect(calls).toContainEqual(["cycle_id", "cycle_fixture"]);
    expect(calls).toContainEqual(["status", "processing"]);
    expect(calls.some(([key]) => key === "lt:updated_at")).toBe(true);
    expect(calls[0][1]).toEqual(expect.objectContaining({ status: "pending", error: null }));
  });
});

describe("Devir availability parsing", () => {
  it.each([
    "En reposición",
    "Reposición",
    "Agotado",
    "Sin stock",
    "No disponible",
    "No está disponible",
  ])("treats %s as unavailable even when Magento marks the stock node available", (label) => {
    const f = fixture();
    expect(
      f.api.parseAvailability(
        `<div class="stock available"><span>Disponibilidad:</span> ${label}</div>`,
      ),
    ).toEqual(expect.objectContaining({ availability: "unavailable" }));
  });

  it("keeps explicit Devir preorder sellable as preorder", () => {
    const f = fixture();
    expect(
      f.api.parseAvailability(
        '<div class="stock available"><span>Disponibilidad:</span> Pre reserva</div>',
      ),
    ).toEqual(expect.objectContaining({ availability: "preorder" }));
  });

  it("keeps genuinely available Devir stock available", () => {
    const f = fixture();
    expect(
      f.api.parseAvailability(
        '<div class="stock available"><span>Disponibilidad:</span> Disponible</div>',
      ),
    ).toEqual(expect.objectContaining({ availability: "available" }));
  });
});

describe("Devir inventory boundaries", () => {
  it.each([12, -2])("does not replay aggregate stock %s while updating availability", async (quantity) => {
    const f = fixture();
    f.spreeRequest.mockResolvedValue({ backorderable: true, preorderable: false });
    await f.api.patchVariantInventory({}, "product_1", "variant_target", quantity, true, false, null);
    for (const call of f.spreeRequest.mock.calls.filter(call => call[1] !== "GET")) {
      expect(JSON.stringify(call[3])).not.toMatch(/count_on_hand|stock_levels|stock_items/);
    }
  });
  it("initializes zero inventory only for an explicitly new variant", async () => {
    const f = fixture();
    f.spreeRequest.mockResolvedValue({ backorderable: true, preorderable: false });
    await f.api.patchVariantInventory({}, "product_1", "variant_new", 0, true, false, null, true);
    expect(f.spreeRequest.mock.calls[0][3].stock_levels).toEqual([{ stock_location_id: "sl_1", count_on_hand: 0, backorderable: true }]);
  });
  it("never initializes a new variant with invented or invalid stock", async () => {
    const f = fixture();
    f.spreeRequest.mockResolvedValue({ backorderable: true, preorderable: false });
    for (const quantity of [12, -2, Number.NaN]) {
      await expect(f.api.patchVariantInventory({}, "product_1", "variant_new", quantity, true, false, null, true)).rejects.toThrow("cero");
    }
    expect(f.spreeRequest).not.toHaveBeenCalled();
  });
  it("does not confirm preorder when the backend ignores that flag", async () => {
    const f = fixture();
    f.spreeRequest.mockResolvedValue({ backorderable: true, preorderable: false });
    await expect(f.api.patchVariantInventory({}, "product_1", "variant_target", 0, true, true, null)).rejects.toThrow("confirm");
  });
  it("rejects a variant response that still has the wrong availability after fallback", async () => {
    const f = fixture();
    f.spreeRequest.mockImplementation(async (_config, _method, path: string) =>
      path.startsWith("/stock_items") ? { data: [{ ...stock, backorderable: true }] } : { backorderable: false, preorderable: false });
    await expect(f.api.patchVariantInventory({}, "product_1", "variant_target", 0, true, false, null)).rejects.toThrow("confirm");
  });
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
  it("treats a missing stock row as safely non-backorderable when no supplier is selected", async () => {
    const f = fixture();
    f.spreeRequest.mockResolvedValue({ data: [] });
    expect(
      await f.api.setVariantBackorderability(
        {},
        "product_1",
        "variant_target",
        false,
      ),
    ).toBe(0);
    expect(f.spreeRequest.mock.calls.every(call => call[1] === "GET")).toBe(true);
  });

  it("initializes only zero inventory when supplier backorder is required and Spree confirms zero", async () => {
    const f = fixture();
    let initialized = false;
    f.spreeRequest.mockImplementation(async (_config, method, path, body) => {
      if (path.startsWith("/stock_items")) {
        return {
          data: initialized
            ? [{
                id: "si_new",
                variant_id: "variant_target",
                stock_location_id: "sl_1",
                count_on_hand: 0,
                backorderable: true,
              }]
            : [],
        };
      }
      if (method === "GET") {
        return { total_on_hand: 0, backorderable: false };
      }
      initialized = true;
      expect(body.stock_levels ?? body.stock_items).toEqual([
        {
          stock_location_id: "sl_1",
          count_on_hand: 0,
          backorderable: true,
        },
      ]);
      return { total_on_hand: 0, backorderable: true };
    });
    expect(
      await f.api.setVariantBackorderability(
        {},
        "product_1",
        "variant_target",
        true,
      ),
    ).toBe(1);
  });

  it("refuses to create a stock row when Spree reports non-zero aggregate stock", async () => {
    const f = fixture();
    f.spreeRequest.mockImplementation(async (_config, method, path) => {
      if (path.startsWith("/stock_items")) return { data: [] };
      if (method === "GET") return { total_on_hand: 2, backorderable: false };
      throw new Error("unexpected write");
    });
    await expect(
      f.api.setVariantBackorderability(
        {},
        "product_1",
        "variant_target",
        true,
      ),
    ).rejects.toThrow("verificablemente cero");
    expect(f.spreeRequest.mock.calls.every(call => call[1] === "GET")).toBe(true);
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

describe("Devir complete-crawl requirement", () => {
  it("preserves successful completion after every job has finished", async () => {
    const writes: Array<{ table: string; value: Record<string, unknown> }> = [];
    const f = fixture({
      configuredCatalogSupplier: async () => ({ id: "supplier_fixture" }),
      supabase: { from: (table: string) => {
        const query = {
          select: () => query, eq: () => query, neq: () => query, or: () => query, in: () => query,
          update: (value: Record<string, unknown>) => { writes.push({ table, value }); return query; },
          // biome-ignore lint/suspicious/noThenProperty: Models a completed crawl with no missing rows.
          then: (resolve: (value: unknown) => void) => resolve({ count: 0, error: null, data: [] }),
        };
        return query;
      } },
    });
    await f.api.finishCycle({ interval_hours: 6 }, "cycle_fixture");
    expect(writes).toContainEqual({ table: "devir_sync_cycles", value: expect.objectContaining({ status: "success" }) });
    expect(writes).toContainEqual({ table: "catalog_suppliers", value: expect.objectContaining({ last_completed_run_id: "cycle_fixture" }) });
  });
  it.each(["pending", "processing"])("waits without retiring offers when a job is %s", async (status) => {
    const writes = vi.fn();
    const query = {
      select: () => query, eq: () => query, neq: () => query, in: () => query,
      // biome-ignore lint/suspicious/noThenProperty: Models a PostgREST count query.
      then: (resolve: (value: unknown) => void) => resolve({ count: 1, error: null, data: [{ status }] }),
    };
    const f = fixture({ supabase: { from: () => ({ ...query, update: writes }) } });
    expect(await f.api.finishCycle({ interval_hours: 6 }, "cycle_fixture")).toBe(false);
    expect(writes).not.toHaveBeenCalled();
  });
  it("schedules the next cycle after failed jobs without inferring missing supply", async () => {
    const writes: Array<{ table: string; value: Record<string, unknown> }> = [];
    const f = fixture({ supabase: { from: (table: string) => {
      let count = 0;
      const query = {
        select: () => query, neq: () => { count = 1; return query; },
        in: () => query,
        eq: (key: string, value: string) => { if (key === "status" && value === "error") count = 1; return query; },
        update: (value: Record<string, unknown>) => { writes.push({ table, value }); return query; },
        // biome-ignore lint/suspicious/noThenProperty: Models a crawl with one failed terminal job.
        then: (resolve: (value: unknown) => void) => resolve({ count, error: null, data: [] }),
      };
      return query;
    } } });
    expect(await f.api.finishCycle({ interval_hours: 6 }, "failed_cycle")).toBe(true);
    expect(writes.map(write => write.table)).not.toContain("devir_sync_catalog");
    expect(writes.map(write => write.table)).not.toContain("catalog_supplier_offers");
    expect(writes).toContainEqual({ table: "devir_sync_config", value: expect.objectContaining({ phase: "idle", active_cycle_id: null, last_error: "1 jobs terminaron con error" }) });
    expect(writes.find(write => write.table === "catalog_suppliers")?.value.last_completed_run_id).toBeUndefined();
  });
  it("does not infer absence if the job count cannot be read", async () => {
    const writes = vi.fn();
    const query = {
      select: () => query, eq: () => query, neq: () => query, in: () => query,
      // biome-ignore lint/suspicious/noThenProperty: Models a PostgREST count query.
      then: (resolve: (value: unknown) => void) => resolve({ count: null, error: new Error("database unavailable") }),
    };
    const f = fixture({ supabase: { from: () => ({ ...query, update: writes }) } });
    await expect(f.api.finishCycle({}, "cycle_fixture")).rejects.toThrow("database unavailable");
    expect(writes).not.toHaveBeenCalled();
  });
});
