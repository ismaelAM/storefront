// @vitest-environment node
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";
import { shouldAutoPublishCatalogProduct } from "../../supabase/functions/_shared/catalog-publish-policy";
import { TCGFACTORY_CATALOG_SECTIONS } from "../../supabase/functions/_shared/tcgfactory-web";

const source = ts.createSourceFile("index.ts", readFileSync("supabase/functions/devir-sync/index.ts", "utf8"), ts.ScriptTarget.Latest, true);
const names = ["tcgFactoryTick", "reconcileUnavailableTcgFactoryProduct"];
const code = ts.transpileModule(source.statements.filter(node => ts.isFunctionDeclaration(node) && names.includes(node.name?.text ?? "")).map(node => node.getText(source)).join("\n"), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;

function fixture(physicalStock = 0, otherSupplier = false, publicAvailable = false, section = "accessories", totalPages = 2, refreshDue = false, settings: { idle?: boolean; failRefresh?: boolean; refreshCount?: number; refreshCursor?: string; slowRefresh?: boolean; failDiscovery?: boolean } = {}) {
  let elapsed = 0;
  let inflight = 0;
  let maxInflight = 0;
  const readsAfter: unknown[] = [];
  const writes: Array<{ table: string; body: Record<string, unknown>; filters: Array<[string, unknown]> }> = [];
  const reconcile = vi.fn(async () => ({ productId: "prod_1" }));
  const spreeRequest = vi.fn(async () => ({}));
  const ingest = vi.fn();
  const state = { status: settings.idle ? "idle" : "running", refresh_turn: 1, refresh_after_id: settings.refreshCursor ?? null, run_id: "run_1", section, page: 1, item_offset: 0, processed_items: 1, discovered_items: 1, failed_items: 0 };
  const product = { sourceUrl: "https://tcgfactory.com/es/distribucion/fundas.html", externalVariantId: "ean_1", availability: "unavailable", reportedAvailability: "Restock" };
  let parsedDetails = 0;
  const fetches: string[] = [];
  const sessions: unknown[] = [];
  const complete = vi.fn(async () => ({}));
  const supabase = { from: (table: string) => {
    let write: typeof writes[number] | undefined;
    let refreshRead = false;
    let afterId: unknown = null;
    const q = {
      select: (fields = "") => { refreshRead = fields === "id,source_url"; return q; },
      in: () => q, lt: () => q, gt: (_key: string, value: unknown) => { afterId = value; readsAfter.push(value); return q; }, not: () => q, order: () => q, limit: () => q,
      eq: (key: string, value: unknown) => { write?.filters.push([key, value]); return q; },
      update: (body: Record<string, unknown>) => { write = { table, body, filters: [] }; writes.push(write); return q; },
      upsert: (body: Record<string, unknown>) => { write = { table, body, filters: [] }; writes.push(write); return q; },
      maybeSingle: async () => ({ data: state, error: null }),
      // biome-ignore lint/suspicious/noThenProperty: Models the PostgREST update returning affected variants.
      then: (resolve: (value: unknown) => void) => resolve({ data: refreshRead ? refreshDue ? afterId ? [] : Array.from({ length: settings.refreshCount ?? 1 }, (_, index) => ({ id: `offer_${index}`, source_url: `${product.sourceUrl}?offer=${index}` })) : [] : table === "catalog_supplier_offers" ? [{ variant_id: "cat_1" }] : null, error: null }),
    };
    return q;
  } };
  const tick = runInNewContext(`${code}; tcgFactoryTick`, {
    supabase, console, URL, shouldAutoPublishCatalogProduct,
    Date: class extends Date { static now() { return new Date("2026-10-09T17:01:00Z").getTime() + elapsed; } },
    tcgFactorySupplierRow: async () => ({ id: "supplier_tcg", enabled: true, stale_after_hours: 8, next_sync_at: settings.idle ? "2026-10-09T22:00:00Z" : null, config: { sections: ["tcg", "board_games", "accessories", "merchandising", "paints"] } }),
    tcgFactoryCredentialsConfigured: async () => true,
    tcgFactoryLogin: async () => ({}),
    tcgFactoryTextFetch: async (url: string, session?: unknown) => { fetches.push(url); sessions.push(session); inflight += 1; maxInflight = Math.max(maxInflight, inflight); await Promise.resolve(); inflight -= 1; if (settings.slowRefresh && url.includes("?offer=")) elapsed += 120_000; if ((settings.failRefresh && url.includes("?offer=")) || (settings.failDiscovery && url.includes("fundas.html"))) throw new Error("TCGFACTORY_B2B_PRICE_MISSING"); return { html: "fixture" }; },
    parseTcgFactoryListing: () => ({ productUrls: [product.sourceUrl], totalPages }),
    parseTcgFactoryPublicProduct: () => publicAvailable && parsedDetails++ === 0 ? { ...product, availability: "available", reportedAvailability: "Disponible" } : product,
    tcgFactoryItemFailureDisposition: () => "fail",
    upsertTcgFactoryDiscovery: async () => {},
    TCGFACTORY_ACCESSORIES_URL: "https://tcgfactory.com/es/distribucion-accesorios",
    TCGFACTORY_CATALOG_SECTIONS,
    TCGFACTORY_SUPPLIER_CODE: "tcgfactory",
    completeCatalogSupplierRun: complete,
    spreeCategories: async () => [], definitions: async () => new Map(),
    ingestCatalogItem: ingest,
    loadCatalogVariant: async () => ({}), reconcileCatalogVariant: reconcile,
    spreeListAll: async () => [{ id: "variant_1", total_on_hand: physicalStock }],
    selectedSupplyForSpreeVariant: async () => ({ supplier_code: otherSupplier ? "devir" : null, availability: otherSupplier ? "available" : null, fulfillment_mode: "supplier_or_physical" }),
    spreeRequest,
  }) as (config: object) => Promise<Record<string, unknown>>;
  return { tick, writes, reconcile, spreeRequest, ingest, fetches, sessions, complete, readsAfter, maxInflight: () => maxInflight };
}

describe("TcgFactory restock transition", () => {
  it("refreshes offers between completed crawls even when full discovery is not due", async () => {
    const f = fixture(0, false, false, "tcg", 2, true, { idle: true });
    expect((await f.tick({})).status).toBe("refreshing_offers");
    expect(f.complete).not.toHaveBeenCalled();
  });
  it("advances a separate refresh cursor past failed fiches without stamping their freshness", async () => {
    const f = fixture(0, false, false, "tcg", 2, true, { failRefresh: true });
    const result = await f.tick({});
    expect(result.failed).toBe(1);
    expect(f.writes.find(write => write.table === "catalog_supplier_crawl_state" && "refresh_after_id" in write.body)?.body).toMatchObject({ refresh_after_id: "offer_0" });
    expect(f.writes.some(write => write.table === "catalog_supplier_offers")).toBe(false);
  });
  it("processes a larger bounded refresh batch without consuming discovery pages", async () => {
    const f = fixture(0, false, false, "tcg", 2, true, { refreshCount: 24 });
    expect((await f.tick({})).refreshed).toBe(24);
    expect(f.maxInflight()).toBe(3);
    expect(f.writes.filter(write => "refresh_after_id" in write.body).map(write => write.body.refresh_after_id)).toEqual(["offer_2", "offer_5", "offer_8", "offer_11", "offer_14", "offer_17", "offer_20", "offer_23"]);
    expect(f.writes.findLast(write => write.table === "catalog_supplier_crawl_state" && "refresh_after_id" in write.body)?.body).toMatchObject({ refresh_after_id: "offer_23" });
    expect(f.complete).not.toHaveBeenCalled();
  });
  it("wraps the maintenance cursor when no more due offers follow it", async () => {
    const f = fixture(0, false, false, "tcg", 2, true, { refreshCursor: "last_offer" });
    expect((await f.tick({})).refreshed).toBe(1);
    expect(f.readsAfter).toEqual(["last_offer"]);
  });
  it("stops refresh chunks at the elapsed-time budget and saves the last attempted offer", async () => {
    const f = fixture(0, false, false, "tcg", 2, true, { refreshCount: 24, slowRefresh: true });
    expect((await f.tick({})).refreshed).toBe(3);
    expect(f.writes.find(write => write.table === "catalog_supplier_crawl_state" && "refresh_after_id" in write.body)?.body).toMatchObject({ refresh_after_id: "offer_2" });
  });
  it("never completes a full crawl containing failed product validation", async () => {
    const f = fixture(0, false, false, "paints", 1, false, { failDiscovery: true });
    expect((await f.tick({})).status).toBe("error");
    expect(f.complete).not.toHaveBeenCalled();
  });
  it("reads the current configured section instead of hardcoding accessories", async () => {
    const f = fixture(0, false, false, "tcg");
    await f.tick({});
    expect(f.fetches[0]).toBe("https://tcgfactory.com/es/trading-card-games");
  });

  it("advances to the next section without completing a partial supplier run", async () => {
    const f = fixture(0, false, false, "tcg", 1);
    await f.tick({});
    expect(f.complete).not.toHaveBeenCalled();
    expect(f.writes.find(write => write.table === "catalog_supplier_crawl_state" && "section" in write.body)?.body).toMatchObject({ section: "board_games", page: 1, item_offset: 0, status: "running" });
  });

  it("completes the supplier run only after the final configured section", async () => {
    const f = fixture(0, false, false, "paints", 1);
    await f.tick({});
    expect(f.complete).toHaveBeenCalledOnce();
  });

  it("refreshes known offers during a long crawl without advancing or completing its section", async () => {
    const f = fixture(0, false, false, "tcg", 2, true);
    const result = await f.tick({});
    expect(result.status).toBe("refreshing_offers");
    expect(f.fetches[0]).toBe("https://tcgfactory.com/es/distribucion/fundas.html?offer=0");
    expect(f.writes.filter(write => write.table === "catalog_supplier_crawl_state").every(write => !("section" in write.body) && !("page" in write.body))).toBe(true);
    expect(f.complete).not.toHaveBeenCalled();
    expect(f.reconcile).toHaveBeenCalledOnce();
  });
  it("honors restock in the authenticated page even if the public page still says available", async () => {
    const f = fixture(0, false, true);
    const result = await f.tick({});
    expect(result.failed).toBe(0);
    expect(f.reconcile).toHaveBeenCalledOnce();
    expect(f.ingest).not.toHaveBeenCalled();
    expect(f.sessions[2]).toEqual({});
  });
  it("invalidates the existing offer without hiding the catalog page", async () => {
    const f = fixture();
    const result = await f.tick({});
    expect(result.failed).toBe(0);
    const offerWrite = f.writes.find(write => write.table === "catalog_supplier_offers");
    expect(offerWrite?.body).toMatchObject({ availability: "unavailable", last_seen_run_id: "run_1" });
    expect(offerWrite?.filters).toContainEqual(["supplier_id", "supplier_tcg"]);
    expect(offerWrite?.filters).toContainEqual(["source_url", "https://tcgfactory.com/es/distribucion/fundas.html"]);
    expect(f.reconcile).toHaveBeenCalledOnce();
    expect(f.spreeRequest).not.toHaveBeenCalled();
    expect(f.ingest).not.toHaveBeenCalled();
  });
  it.each([[1, false], [0, true]] as const)("preserves publication with physical stock %s or another supplier %s", async (physical, other) => {
    const f = fixture(physical, other);
    await f.tick({});
    expect(f.reconcile).toHaveBeenCalledOnce();
    expect(f.spreeRequest).not.toHaveBeenCalled();
  });
});
