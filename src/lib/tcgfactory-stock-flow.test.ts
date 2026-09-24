// @vitest-environment node
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";
import { shouldAutoPublishCatalogProduct } from "../../supabase/functions/_shared/catalog-publish-policy";

const source = ts.createSourceFile("index.ts", readFileSync("supabase/functions/devir-sync/index.ts", "utf8"), ts.ScriptTarget.Latest, true);
const names = ["tcgFactoryTick", "reconcileUnavailableTcgFactoryProduct"];
const code = ts.transpileModule(source.statements.filter(node => ts.isFunctionDeclaration(node) && names.includes(node.name?.text ?? "")).map(node => node.getText(source)).join("\n"), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;

function fixture(physicalStock = 0, otherSupplier = false, publicAvailable = false) {
  const writes: Array<{ table: string; body: Record<string, unknown>; filters: Array<[string, unknown]> }> = [];
  const reconcile = vi.fn(async () => ({ productId: "prod_1" }));
  const spreeRequest = vi.fn(async () => ({}));
  const ingest = vi.fn();
  const state = { status: "running", run_id: "run_1", page: 1, item_offset: 0, processed_items: 1, discovered_items: 1, failed_items: 0 };
  const product = { sourceUrl: "https://tcgfactory.com/es/distribucion/fundas.html", externalVariantId: "ean_1", availability: "unavailable", reportedAvailability: "Restock" };
  let parsedDetails = 0;
  const supabase = { from: (table: string) => {
    let write: typeof writes[number] | undefined;
    const q = {
      select: () => q,
      eq: (key: string, value: unknown) => { write?.filters.push([key, value]); return q; },
      update: (body: Record<string, unknown>) => { write = { table, body, filters: [] }; writes.push(write); return q; },
      maybeSingle: async () => ({ data: state, error: null }),
      // biome-ignore lint/suspicious/noThenProperty: Models the PostgREST update returning affected variants.
      then: (resolve: (value: unknown) => void) => resolve({ data: table === "catalog_supplier_offers" ? [{ variant_id: "cat_1" }] : null, error: null }),
    };
    return q;
  } };
  const tick = runInNewContext(`${code}; tcgFactoryTick`, {
    supabase, console, URL, shouldAutoPublishCatalogProduct,
    tcgFactorySupplierRow: async () => ({ id: "supplier_tcg", enabled: true }),
    tcgFactoryCredentialsConfigured: async () => true,
    tcgFactoryLogin: async () => ({}),
    tcgFactoryTextFetch: async () => ({ html: "fixture" }),
    parseTcgFactoryListing: () => ({ productUrls: [product.sourceUrl], totalPages: 2 }),
    parseTcgFactoryPublicProduct: () => publicAvailable && parsedDetails++ === 0 ? { ...product, availability: "available", reportedAvailability: "Disponible" } : product,
    upsertTcgFactoryDiscovery: async () => {},
    TCGFACTORY_ACCESSORIES_URL: "https://tcgfactory.com/es/distribucion-accesorios",
    spreeCategories: async () => [], definitions: async () => new Map(),
    ingestCatalogItem: ingest,
    loadCatalogVariant: async () => ({}), reconcileCatalogVariant: reconcile,
    spreeListAll: async () => [{ id: "variant_1", total_on_hand: physicalStock }],
    selectedSupplyForSpreeVariant: async () => ({ supplier_code: otherSupplier ? "devir" : null, availability: otherSupplier ? "available" : null, fulfillment_mode: "supplier_or_physical" }),
    spreeRequest,
  }) as (config: object) => Promise<Record<string, unknown>>;
  return { tick, writes, reconcile, spreeRequest, ingest };
}

describe("TcgFactory restock transition", () => {
  it("honors restock in the authenticated page even if the public page still says available", async () => {
    const f = fixture(0, false, true);
    const result = await f.tick({});
    expect(result.failed).toBe(0);
    expect(f.reconcile).toHaveBeenCalledOnce();
    expect(f.ingest).not.toHaveBeenCalled();
  });
  it("invalidates the existing offer and hides a product without any valid source", async () => {
    const f = fixture();
    const result = await f.tick({});
    expect(result.failed).toBe(0);
    const offerWrite = f.writes.find(write => write.table === "catalog_supplier_offers");
    expect(offerWrite?.body).toMatchObject({ availability: "unavailable", last_seen_run_id: "run_1" });
    expect(offerWrite?.filters).toContainEqual(["supplier_id", "supplier_tcg"]);
    expect(offerWrite?.filters).toContainEqual(["source_url", "https://tcgfactory.com/es/distribucion/fundas.html"]);
    expect(f.reconcile).toHaveBeenCalledOnce();
    expect(f.spreeRequest).toHaveBeenCalledWith({}, "PATCH", "/products/prod_1", { status: "draft" });
    expect(f.ingest).not.toHaveBeenCalled();
  });
  it.each([[1, false], [0, true]] as const)("preserves publication with physical stock %s or another supplier %s", async (physical, other) => {
    const f = fixture(physical, other);
    await f.tick({});
    expect(f.reconcile).toHaveBeenCalledOnce();
    expect(f.spreeRequest).not.toHaveBeenCalled();
  });
});
