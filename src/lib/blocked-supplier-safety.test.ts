// @vitest-environment node
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";
import { catalogReviewFingerprint } from "../../supabase/functions/_shared/catalog-publish-policy";
import { mapTcgFactoryAvailability } from "../../supabase/functions/_shared/tcgfactory-adapter";
import { parseTcgFactoryPublicProduct } from "../../supabase/functions/_shared/tcgfactory-web";

const url = "https://tcgfactory.com/es/distribucion/display.html";
describe("Blocked supplier products never become saleable", () => {
  it.each(["Bloqueado", "Bloqueada", "Producto bloqueado", "Preventa - Bloqueado", "Blocked"])("rejects the supplier label %s", label => {
    expect(mapTcgFactoryAvailability(label)).toBe("unavailable");
  });
  it.each(["Preventa", "Disponible"])("a primary blocked control beats technical-sheet %s", status => {
    const html = `<h1>Display</h1><div class="product-add-to-cart"><button disabled>Bloqueado</button></div><dl><dt>Estado de producto:</dt><dd>${status}</dd></dl>`;
    expect(parseTcgFactoryPublicProduct(html, url).availability).toBe("unavailable");
  });
  it.each(["Bloqueado", "Venta bloqueada"])("reads the actual supplier input label %s", label => {
    const html = `<h1>Display</h1><input class="btn btn-primary show-warning" type="button" value='${label}'><dl><dt>Estado de producto:</dt><dd>Preventa</dd></dl>`;
    expect(parseTcgFactoryPublicProduct(html, url).availability).toBe("unavailable");
  });
  it("excludes the account-specific TCG+ purchase restriction", () => {
    const html = `<h1>OP-17</h1><input class="btn btn-primary show-warning" type="button" value="Solo tiendas TCG+"><dl><dt>Estado de producto:</dt><dd>Preventa</dd></dl>`;
    expect(parseTcgFactoryPublicProduct(html, url).availability).toBe("unavailable");
  });
  it("ignores blocked recommendations and navigation while reading the actual product language", () => {
    const html = `<header>Idioma:<div>Español</div><a>Bloqueados</a></header><h1>OP-17 Inglés</h1><dl><dt>Idioma:</dt><dd>Inglés</dd><dt>Estado de producto:</dt><dd>Disponible</dd></dl><article class="product-miniature"><button disabled>Bloqueado</button></article>`;
    const product = parseTcgFactoryPublicProduct(html, url);
    expect(product.availability).toBe("available");
    expect(product.options.idioma).toBe("Inglés");
  });
});

describe("Native enforcement of canonical product rejection", () => {
  it.each([
    ["rejected", "supplier_or_physical"],
    ["pending", "disabled"],
  ])("drafts %s / %s products even without an eligible supplier offer", async (decision, mode) => {
    const source = ts.createSourceFile("index.ts", readFileSync("supabase/functions/devir-sync/index.ts", "utf8"), ts.ScriptTarget.Latest, true);
    const code = ts.transpileModule(source.statements.filter(n => ts.isFunctionDeclaration(n) && ["reconcileCatalogVariantUnlocked", "enforceVariantFulfillmentFlags"].includes(n.name?.text ?? "")).map(n => n.getText(source)).join("\n"), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
    const requests: Array<{ path: string; body: Record<string, unknown> }> = [];
    const run = runInNewContext(`${code}; reconcileCatalogVariantUnlocked`, {
      chooseCatalogOffer: async () => ({ selected: null, selectedSupplier: null, offers: [] }),
      catalogSpreeMapping: async () => ({ product: { id: "prod_op17", status: "active", tags: [] }, variant: { id: "variant_op17" } }),
      syncBackorderability: async () => 0, syncApprovedSupplierPackChildren: async () => 0,
      upsertVariantProvenance: async () => {}, syncHomePreorderMembership: async () => {},
      spreeRequest: async (_config: unknown, _method: string, path: string, body: Record<string, unknown>) => {
        requests.push({ path, body }); return { id: "prod_op17", ...body };
      },
    });
    const result = await run({}, { product: { id: "cat_op17", spree_product_id: "prod_op17", review_decision: decision }, variant: { id: "cat_variant", spree_variant_id: "variant_op17", fulfillment_mode: mode } }, [], new Map());
    expect(requests).toContainEqual({ path: "/products/prod_op17", body: { status: "draft" } });
    expect(requests).toContainEqual({ path: "/products/prod_op17/variants/variant_op17", body: expect.objectContaining({ preorderable: false, track_inventory: true }) });
    expect(requests.some(r => "count_on_hand" in r.body)).toBe(false);
    expect(result.review).toBe(decision === "rejected");
  });
  it("reconciles every canonical variant even when no legacy Devir catalog row exists", async () => {
    const product = { id: "cat_op17", spree_product_id: "prod_op17", name: "OP17", review_decision: "pending" };
    const variants = [{ id: "cat_variant", fulfillment_mode: "supplier_or_physical" }];
    const source = ts.createSourceFile("index.ts", readFileSync("supabase/functions/devir-sync/index.ts", "utf8"), ts.ScriptTarget.Latest, true);
    const code = ts.transpileModule(source.statements.filter(n => ts.isFunctionDeclaration(n) && ["operatorAction"].includes(n.name?.text ?? "")).map(n => n.getText(source)).join("\n"), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
    const reconcile = vi.fn(async (_config: unknown, _variant: unknown, _categories: unknown, _defs: unknown) => ({}));
    const run = runInNewContext(`${code}; operatorAction`, {
      json: (body: unknown, status = 200) => Response.json(body, { status }),
      operatorAuthorized: async () => true,
      currentCatalogReviewReasonsForSpreeProduct: async () => new Set(), catalogReviewFingerprint,
      markCatalogProductDirty: async () => {},
      preparePublishBatch: async () => ({ processed_products: 0 }),
      spreeCategories: async () => [], definitions: async () => new Map(),
      loadCatalogVariant: async (id: string) => variants.find(v => v.id === id),
      reconcileCatalogVariant: reconcile,
      supabase: { from: (table: string) => {
        const data = () => table === "catalog_products" ? product : variants;
        const q = {
          select: () => q, eq: () => q, order: () => q,
          update: (patch: object) => { if (table === "catalog_products") Object.assign(product, patch); else variants.forEach(v => Object.assign(v, patch)); return q; },
          maybeSingle: async () => ({ data: data(), error: null }), single: async () => ({ data: data(), error: null }),
          // biome-ignore lint/suspicious/noThenProperty: models the actual database boundary.
          then: (resolve: (value: unknown) => void) => resolve({ data: data(), error: null }),
        }; return q;
      } },
    });
    const result = await run("catalog-review-reject", new Request("https://worker.invalid"), {}, { catalogProductId: "cat_op17", fulfillmentMode: "disabled" });
    expect(result.status).toBe(200);
    expect(reconcile).toHaveBeenCalledOnce();
    expect(reconcile.mock.calls[0][1]).toMatchObject({ id: "cat_variant", fulfillment_mode: "disabled" });
  });
});
