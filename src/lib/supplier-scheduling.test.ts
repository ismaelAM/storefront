// @vitest-environment node
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";

const source = ts.createSourceFile("index.ts", readFileSync("supabase/functions/devir-sync/index.ts", "utf8"), ts.ScriptTarget.Latest, true);
const bodies = source.statements.filter(node =>
  (ts.isExpressionStatement(node) && node.getText(source).startsWith("Deno.serve(")) ||
  (ts.isFunctionDeclaration(node) && node.name?.text === "scheduledTcgFactoryTick"),
).map(node => node.getText(source)).join("\n");
const code = ts.transpileModule(bodies, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;

function fixture(minute: number, tcgError = false, lastSupplier = "devir", skippedItems = 0) {
  let handler!: (req: Request) => Promise<Response>;
  const turns: string[] = [];
  const writes: object[] = [];
  const tcg = vi.fn(async () => { turns.push("tcg"); if (tcgError) throw new Error("Supplier unavailable"); return { status: "running", skipped: skippedItems }; });
  const devir = vi.fn(async () => { turns.push("devir"); return Response.json({ ok: true, phase: "products" }); });
  const guard = vi.fn(async () => { turns.push("guard"); });
  const config = { last_supplier_tick: lastSupplier, enabled: true, active_cycle_id: "cycle_1", phase: "products", session_state: {}, worker_token_hash: "fixture_hash", spree_admin_api_key: "fixture_key" };
  const query = {
    select: () => query, eq: () => query, update: (body: object) => { writes.push(body); Object.assign(config, body); return query; },
    single: async () => ({ data: config, error: null }),
    // biome-ignore lint/suspicious/noThenProperty: Models a PostgREST update.
    then: (resolve: (value: unknown) => void) => resolve({ error: null }),
  };
  runInNewContext(code, {
    Deno: { serve: (callback: typeof handler) => { handler = callback; } },
    Date: class extends Date { static now() { return new Date(`2026-10-09T17:0${minute}:00Z`).getTime(); } },
    crypto: { randomUUID: () => "lock_fixture" }, console,
    supabase: { from: () => query, rpc: async () => ({ data: true, error: null }) },
    sha256: async () => "fixture_hash",
    json: (body: unknown, status = 200) => Response.json(body, { status }),
    reconcileStaleCatalogBatch: guard,
    tcgFactoryTick: tcg, processDevirCycleTick: devir,
    tcgFactorySupplierRow: async () => ({ id: "supplier_tcg" }),
  });
  return { handler, tcg, devir, turns, writes };
}

describe("scheduled supplier fairness", () => {
  it("runs TCG Factory during an active Devir crawl on its reserved turn", async () => {
    const f = fixture(0);
    const response = await f.handler(new Request("https://worker.invalid", { method: "POST", headers: { "x-devir-worker-token": "fixture_token" }, body: "{}" }));
    expect(response.status).toBe(200);
    expect(f.turns).toEqual(["guard", "tcg"]);
    expect(f.writes).toContainEqual(expect.objectContaining({ last_supplier_tick: "tcgfactory" }));
  });
  it("keeps the TCG turn when individual dead links were skipped successfully", async () => {
    const f = fixture(0, false, "devir", 2);
    await f.handler(new Request("https://worker.invalid", { method: "POST", headers: { "x-devir-worker-token": "fixture_token" }, body: "{}" }));
    expect(f.turns).toEqual(["guard", "tcg"]);
  });
  it("gives Devir the next unlocked turn even when a long TCG tick skipped an odd cron minute", async () => {
    const f = fixture(0, false, "tcgfactory");
    await f.handler(new Request("https://worker.invalid", { method: "POST", headers: { "x-devir-worker-token": "fixture_token" }, body: "{}" }));
    expect(f.turns).toEqual(["guard", "devir"]);
  });
  it("continues Devir when TCG Factory fails instead of poisoning its cycle", async () => {
    const f = fixture(0, true);
    const response = await f.handler(new Request("https://worker.invalid", { method: "POST", headers: { "x-devir-worker-token": "fixture_token" }, body: "{}" }));
    expect(response.status).toBe(200);
    expect(f.turns).toEqual(["guard", "tcg", "devir"]);
  });
});
