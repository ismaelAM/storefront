// @vitest-environment node
import { AsyncLocalStorage } from "node:async_hooks";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { afterEach, describe, expect, it, vi } from "vitest";
import { dailyOfferSelectionComplete } from "../../supabase/functions/_shared/daily-offer-selection";

const source = ts.createSourceFile(
  "index.ts",
  readFileSync("supabase/functions/devir-sync/index.ts", "utf8"),
  ts.ScriptTarget.Latest,
  true,
);
const names = [
  "finishTcgFactoryCrawl",
  "syncDeferred",
  "isSyncDeferred",
  "canStartSyncWork",
  "fetchSyncText",
  "waitSyncRetry",
  "spreeRequest",
  "processCategories",
  "scheduledTcgFactoryTick",
  "runtimeMaintenanceTick",
  "dueDailyOfferMaintenanceTick",
  "tcgFactoryTick",
  "tcgFactoryItemFailureDisposition",
  "tcgFactoryTextFetch",
  "tcgFactoryLogin",
  "reconcileCatalogVariant",
  "processProducts",
  "syncDatabaseFetch",
  "json",
  "retireMissingDevirOffers",
  "validateSpreeAdminKey",
  "completeCatalogSupplierRun",
  "reconcileCompletedSupplierVariants",
  "dailyOfferPrice",
  "rotateDailyOffersUnlocked",
  "resumeDailyOfferRotation",
];
const code = ts.transpileModule(
  source.statements
    .filter(
      (node) =>
        ts.isFunctionDeclaration(node) && names.includes(node.name?.text ?? ""),
    )
    .map((node) => node.getText(source))
    .join("\n"),
  { compilerOptions: { target: ts.ScriptTarget.ES2022 } },
).outputText;
function fixture(overrides: Record<string, unknown> = {}, entry = false) {
  const entryCode = entry
    ? ts.transpileModule(source.statements.at(-1)?.getText(source) ?? "", {
        compilerOptions: { target: ts.ScriptTarget.ES2022 },
      }).outputText
    : "";
  const syncRuntime = new AsyncLocalStorage();
  let handler: (request: Request) => Promise<Response>;
  const api = runInNewContext(
    `${code}; Object.assign(globalThis, __overrides); ${entryCode}; ({ handler: globalThis.__handler, runtime: syncRuntime, syncDatabaseFetch: typeof syncDatabaseFetch === "function" ? syncDatabaseFetch : undefined, spreeRequest, processCategories, scheduledTcgFactoryTick, maintenance: typeof runtimeMaintenanceTick === 'function' ? runtimeMaintenanceTick : undefined, tcgFactoryTick, tcgFactoryTextFetch, tcgFactoryLogin, reconcileCatalogVariant, processProducts, retireMissingDevirOffers, validateSpreeAdminKey, completeCatalogSupplierRun, rotateDailyOffersUnlocked })`,
    {
      normalizeSupplierCode: (value: string) => value,
      dailyOfferSelectionComplete,
      loadDailyOfferRefresh: async () => [],
      Request,
      Response,
      AbortController,
      URL,
      URLSearchParams,
      Date,
      crypto,
      setTimeout,
      clearTimeout,
      console,
      dailyOfferState: async () => ({
        day_key: "fixture-day",
        last_rotated_at: "done",
        active_products: [
          "tcg",
          "juegos-de-mesa",
          "accesorios",
          "merchandising",
        ].flatMap((category) =>
          Array.from({ length: 3 }, (_, i) => ({
            productId: category + i,
            variantId: category + i,
            category,
            amount: 10,
            compareAtAmount: 12,
          })),
        ),
      }),
      madridCommercialDay: () => ({ dayKey: "fixture-day", saturday: false }),
      ...overrides,
      __overrides: overrides,
      syncRuntime,
      Deno: {
        serve: (callback: typeof handler) => {
          handler = callback;
        },
      },
    },
  );
  api.handler = handler!;
  return api;
}
afterEach(() => vi.useRealTimers());
const config = {
  spree_admin_api_key: "fixture_key",
  spree_api_url: "https://fixture.invalid",
  request_budget: { deadline_at: 100 },
};

describe("Worker invocation budget", () => {
  it.each([
    "headers",
    "body",
  ])("defers a stalled %s before the invocation deadline", async (phase) => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const api = fixture({
      fetch: async () =>
        phase === "headers"
          ? new Promise(() => {})
          : { text: () => new Promise(() => {}) },
    });
    let outcome = "pending";
    const request = api.spreeRequest(config, "GET", "/products").then(
      () => {
        outcome = "success";
      },
      (error: Error) => {
        outcome = error.name;
      },
    );
    await vi.advanceTimersByTimeAsync(101);
    expect(outcome).toBe("SyncDeferred");
    await request;
  });
  it("does not sleep beyond its remaining budget for Retry-After", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const api = fixture({
      fetch: async () =>
        Response.json({}, { status: 429, headers: { "retry-after": "3600" } }),
    });
    let outcome = "pending";
    const request = api.spreeRequest(config, "GET", "/products").then(
      () => {
        outcome = "success";
      },
      (error: Error) => {
        outcome = error.name;
      },
    );
    await vi.advanceTimersByTimeAsync(101);
    expect(outcome).toBe("SyncDeferred");
    await request;
  });
  it("keeps concurrent request budgets independent", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const api = fixture({
      fetch: async () =>
        new Promise((resolve) =>
          setTimeout(() => resolve(Response.json({ done: true })), 80),
        ),
    });
    let shortOutcome = "pending";
    const short = api
      .spreeRequest(
        { ...config, request_budget: { deadline_at: 40 } },
        "GET",
        "/short",
      )
      .catch((error: Error) => {
        shortOutcome = error.name;
      });
    const long = api.spreeRequest(config, "GET", "/long");
    await vi.advanceTimersByTimeAsync(101);
    expect(shortOutcome).toBe("SyncDeferred");
    expect(await long).toEqual({ done: true });
    await short;
  });
  it("requeues a deferred category without marking a validation error", async () => {
    const writes: Record<string, unknown>[] = [];
    const query = {
      select: () => query,
      eq: () => query,
      order: () => query,
      limit: async () => ({
        data: [
          {
            id: 1,
            attempts: 0,
            url: "https://fixture.invalid/category",
            page: 1,
          },
        ],
        error: null,
      }),
      update: (value: Record<string, unknown>) => {
        writes.push(value);
        return query;
      },
      // biome-ignore lint/suspicious/noThenProperty: Fixture implements a Supabase thenable query.
      then: (resolve: (value: unknown) => void) => resolve({ error: null }),
    };
    const error = Object.assign(new Error("budget"), { name: "SyncDeferred" });
    const api = fixture({
      recoverExpiredCycleJobs: async () => {},
      supabase: { from: () => query },
      devirFetch: async () => {
        throw error;
      },
    });
    await api.processCategories({ batch_size: 1 }, "cycle");
    expect(writes.map((row) => row.status)).toEqual(["processing", "pending"]);
  });
  it("does not poison supplier state when a tick yields its budget", async () => {
    const error = Object.assign(new Error("budget"), { name: "SyncDeferred" });
    const api = fixture({
      tcgFactoryTick: async () => {
        throw error;
      },
    });
    expect(await api.scheduledTcgFactoryTick({})).toEqual({
      status: "deferred",
      reason: "request_budget",
    });
  });
});

describe("Fair maintenance and checkpoint cleanup", () => {
  it("gives only the daily lane 70 seconds and persists the next turn before deferral", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
    const deadlines: number[] = [];
    const turns: number[] = [];
    const query = {
      update: (row: { maintenance_turn: number }) => {
        turns.push(row.maintenance_turn);
        return query;
      },
      eq: async () => ({ error: null }),
    };
    const record = async (cfg: typeof config) => {
      deadlines.push(cfg.request_budget.deadline_at);
      expect(turns).toHaveLength(deadlines.length);
      if (deadlines.length === 4)
        throw Object.assign(new Error("budget"), { name: "SyncDeferred" });
      return {};
    };
    const api = fixture({
      supabase: { from: () => query },
      reconcileStaleCatalogBatch: record,
      reconcilePhysicalOnlyCatalogBatch: record,
      refreshHumanReviewMarkersBatch: record,
      rotateDailyOffers: record,
    });
    for (let turn = 0; turn < 4; turn++)
      await api.maintenance({
        maintenance_turn: turn,
        request_budget: { deadline_at: 95_000 },
      });
    expect(deadlines).toEqual([26_000, 26_000, 26_000, 71_000]);
    expect(turns).toEqual([1, 2, 3, 0]);
    expect(
      await api.maintenance({
        maintenance_turn: 3,
        request_budget: { deadline_at: 50_000 },
      }),
    ).toEqual({ lane: "daily", result: {} });
    expect(deadlines.at(-1)).toBe(50_000);
  });
  it("rotates exactly one bounded maintenance lane before supplier work", async () => {
    const calls: string[] = [];
    let turn = 0;
    const query = {
      update: (row: { maintenance_turn: number }) => {
        turn = row.maintenance_turn;
        return query;
      },
      eq: async () => ({ error: null }),
    };
    const api = fixture({
      supabase: { from: () => query },
      reconcileStaleCatalogBatch: async () => {
        calls.push("stale");
        return {};
      },
      reconcilePhysicalOnlyCatalogBatch: async () => {
        calls.push("physical");
        return {};
      },
      refreshHumanReviewMarkersBatch: async () => {
        calls.push("review");
        return {};
      },
      rotateDailyOffers: async () => {
        calls.push("daily");
        return {};
      },
    });
    for (let i = 0; i < 4; i++)
      await api.maintenance({ maintenance_turn: turn });
    expect(calls).toEqual(["stale", "physical", "review", "daily"]);
    expect(turn).toBe(0);
  });
  it("releases a product lock when reconciliation exhausts the budget", async () => {
    const calls: string[] = [];
    const error = Object.assign(new Error("budget"), { name: "SyncDeferred" });
    const api = fixture({
      supabase: {
        rpc: async (name: string) => {
          calls.push(name);
          return { data: true, error: null };
        },
      },
      loadCatalogVariant: async () => ({}),
      reconcileCatalogVariantUnlocked: async () => {
        throw error;
      },
    });
    await expect(
      api.reconcileCatalogVariant(
        {},
        { product: { id: "product" }, variant: { id: "variant" } },
        [],
        new Map(),
      ),
    ).rejects.toMatchObject({ name: "SyncDeferred" });
    expect(calls).toEqual([
      "catalog_claim_product_sync",
      "catalog_release_product_sync",
    ]);
  });
});

function activeWorkerFixture(
  overrides: Record<string, unknown> = {},
  enabled = true,
) {
  const trace: string[] = [];
  const writes: Record<string, unknown>[] = [];
  const query = {
    select: () => query,
    eq: () => query,
    update: (row: Record<string, unknown>) => {
      writes.push(row);
      return query;
    },
    single: async () => ({
      data: {
        ...config,
        enabled,
        phase: "products",
        active_cycle_id: "cycle",
        session_state: {},
        worker_token_hash: "hash",
        last_supplier_tick: "tcgfactory",
      },
      error: null,
    }),
    // biome-ignore lint/suspicious/noThenProperty: Fixture implements a Supabase thenable query.
    then: (resolve: (value: unknown) => void) => resolve({ error: null }),
  };
  const api = fixture(
    {
      supabase: {
        from: () => query,
        rpc: async (name: string) => {
          trace.push(name);
          return { data: true, error: null };
        },
      },
      sha256: async () => "hash",
      crypto: { randomUUID: () => "lock" },
      reconcileStaleCatalogBatch: async () => {
        trace.push("stale");
        return {};
      },
      processDevirCycleTick: async () => {
        trace.push("devir");
        return Response.json({ ok: true });
      },
      ...overrides,
    },
    true,
  );
  return {
    api,
    trace,
    writes,
    invoke: () =>
      api.handler(
        new Request("https://fixture.invalid", {
          method: "POST",
          headers: { "x-devir-worker-token": "token" },
          body: "{}",
        }),
      ),
  };
}

describe("Due daily offers during an active supplier crawl", () => {
  it.each([
    {
      day_key: "yesterday",
      last_rotated_at: "done",
      spree_price_list_id: "old-list",
    },
    {
      day_key: "fixture-day",
      last_rotated_at: null,
      spree_price_list_id: "pending-list",
    },
  ])("runs an overdue or pending rotation before stale and supplier work", async (state) => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const f = activeWorkerFixture({
      dailyOfferState: async () => state,
      rotateDailyOffers: async (cfg: typeof config) => {
        f.trace.push("daily");
        expect(cfg.request_budget.deadline_at).toBe(70_000);
        return { status: "rotated" };
      },
    });
    expect((await f.invoke()).status).toBe(200);
    expect(f.trace).toEqual([
      "devir_sync_acquire_lock",
      "daily",
      "stale",
      "devir",
      "devir_sync_release_lock",
    ]);
    expect(f.writes).toContainEqual({ last_supplier_tick: "devir" });
  });
  it("bypasses completed offers on the current day", async () => {
    const f = activeWorkerFixture({
      rotateDailyOffers: async () => {
        throw new Error("must not repeat daily offers");
      },
    });
    expect((await f.invoke()).status).toBe(200);
    expect(f.trace).toContain("devir");
  });
  it("continues supplier work and releases the lock after repeated daily-only budget yields", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const f = activeWorkerFixture({
      dailyOfferState: async () => ({
        day_key: "fixture-day",
        last_rotated_at: "done",
        active_products: [],
      }),
      rotateDailyOffers: async () => {
        f.trace.push("daily");
        vi.advanceTimersByTime(70_000);
        throw Object.assign(new Error("budget"), { name: "SyncDeferred" });
      },
    });
    for (let i = 0; i < 2; i++) {
      expect((await f.invoke()).status).toBe(200);
    }
    expect(f.trace).toEqual([
      "devir_sync_acquire_lock",
      "daily",
      "devir",
      "devir_sync_release_lock",
      "devir_sync_acquire_lock",
      "daily",
      "devir",
      "devir_sync_release_lock",
    ]);
  });
  it("uses the reserved time for TCGFactory rather than a second maintenance pass when Devir is disabled", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const f = activeWorkerFixture(
      {
        dailyOfferState: async () => null,
        rotateDailyOffers: async () => {
          vi.advanceTimersByTime(70_000);
          throw Object.assign(new Error("budget"), { name: "SyncDeferred" });
        },
        runtimeMaintenanceTick: async () => {
          throw new Error("must preserve supplier reserve");
        },
        scheduledTcgFactoryTick: async () => {
          f.trace.push("tcgfactory");
          return { status: "refreshing_offers" };
        },
      },
      false,
    );
    expect((await f.invoke()).status).toBe(200);
    expect(f.trace).toEqual([
      "devir_sync_acquire_lock",
      "tcgfactory",
      "devir_sync_release_lock",
    ]);
  });
  it("reserves 20 seconds for supplier work and does not start a crawl with an exhausted budget", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const f = activeWorkerFixture({
      sha256: async () => {
        vi.setSystemTime(30_000);
        return "hash";
      },
      dailyOfferState: async () => null,
      rotateDailyOffers: async (cfg: typeof config) => {
        expect(cfg.request_budget.deadline_at).toBe(75_000);
        vi.setSystemTime(75_000);
        return { status: "rotated" };
      },
      reconcileStaleCatalogBatch: async () => {
        vi.setSystemTime(90_000);
        return {};
      },
    });
    expect(await (await f.invoke()).json()).toMatchObject({
      ok: true,
      status: "deferred",
    });
    expect(f.trace).not.toContain("devir");
    expect(f.writes).toEqual([]);
  });
});

function discoveryFixture(stalledUrl?: string, failure = "budget") {
  let blocked = true;
  const writes: Record<string, unknown>[] = [];
  const started: string[] = [];
  let inFlight = 0;
  let maximum = 0;
  let completed = 0;
  const state = {
    supplier_id: "supplier",
    run_id: "run",
    section: "tcg",
    page: 1,
    item_offset: 0,
    status: "running",
    discovered_items: 0,
    processed_items: 0,
    failed_items: 0,
    refresh_turn: 0,
  };
  const query = {
    select: () => query,
    eq: () => query,
    maybeSingle: async () => ({ data: { ...state }, error: null }),
    update: (row: Record<string, unknown>) => {
      writes.push(row);
      return query;
    },
    upsert: (row: Record<string, unknown>) => {
      writes.push(row);
      return query;
    },
    // biome-ignore lint/suspicious/noThenProperty: Fixture implements a Supabase thenable query.
    then: (resolve: (value: unknown) => void) => resolve({ error: null }),
  };
  const urls = Array.from(
    { length: 6 },
    (_, i) => `https://fixture.invalid/${i}`,
  );
  const api = fixture({
    supabase: { from: () => query },
    TCGFACTORY_CATALOG_SECTIONS: [
      { key: "tcg", url: "https://fixture.invalid/listing" },
    ],
    TCGFACTORY_SUPPLIER_CODE: "tcgfactory",
    tcgFactorySupplierRow: async () => ({
      id: "supplier",
      enabled: true,
      config: { sections: ["tcg"] },
      stale_after_hours: 24,
    }),
    tcgFactoryCredentialsConfigured: async () => true,
    tcgFactoryLogin: async () => ({}),
    tcgFactoryTextFetch: async (url: string) => {
      if (url.endsWith("listing")) return { html: "listing" };
      started.push(url);
      inFlight++;
      maximum = Math.max(maximum, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 10));
      inFlight--;
      if (url === stalledUrl && blocked) {
        blocked = false;
        throw failure === "budget"
          ? Object.assign(new Error("budget"), { name: "SyncDeferred" })
          : new Error(
              "El producto cat_1 está siendo sincronizado por otro worker",
            );
      }
      return { html: "product" };
    },
    parseTcgFactoryListing: () => ({
      productUrls: urls,
      totalPages: 1,
      totalItems: 6,
    }),
    parseTcgFactoryPublicProduct: (_html: string, url: string) => ({
      sourceUrl: url,
      availability: "available",
      reference: url,
      referencePriceNet: 20,
    }),
    upsertTcgFactoryDiscovery: async () => {},
    spreeCategories: async () => [],
    definitions: async () => new Map(),
    safeTcgFactoryB2bPrice: () => 10,
    tcgFactoryMinimumOrderQuantity: () => null,
    parseTcgFactoryMinimumOrderQuantity: () => null,
    tcgFactoryCatalogItem: () => ({}),
    ingestCatalogItem: async () => {},
    completeCatalogSupplierRun: async () => {
      completed++;
      return {};
    },
  });
  return {
    api,
    writes,
    started,
    maximum: () => maximum,
    completed: () => completed,
    state,
  };
}

describe("Supplier discovery replay", () => {
  it("runs three discoveries at a time and checkpoints completed groups", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const f = discoveryFixture();
    const promise = f.api.tcgFactoryTick(
      { request_budget: { deadline_at: 95_000 } },
      true,
    );
    await vi.advanceTimersByTimeAsync(1000);
    expect((await promise).status).toBe("complete");
    expect(f.maximum()).toBe(3);
    expect(
      f.writes.some((row) => row.item_offset === 3 && row.status === "running"),
    ).toBe(true);
    expect(f.completed()).toBe(1);
  });
  it.each([
    "budget",
    "lock",
  ])("replays an unfinished discovery after %s without retiring a partial crawl", async (failure) => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const f = discoveryFixture("https://fixture.invalid/1", failure);
    const promise = f.api.tcgFactoryTick(
      { request_budget: { deadline_at: 95_000 } },
      true,
    );
    await vi.advanceTimersByTimeAsync(1000);
    const result = await promise;
    expect(result.status).toBe("running");
    expect(result.failed).toBe(0);
    expect(result.nextOffset).toBe(1);
    expect(
      f.writes.filter((row) => row.status === "running").at(-1)?.item_offset,
    ).toBe(1);
    expect(f.completed()).toBe(0);
    expect(f.started.some((url) => url.endsWith("/3"))).toBe(false);
    f.state.item_offset = 1;
    f.state.discovered_items = 1;
    f.state.processed_items = 1;
    const replay = f.api.tcgFactoryTick(
      { request_budget: { deadline_at: 95_000 } },
      true,
    );
    await vi.advanceTimersByTimeAsync(1000);
    expect((await replay).status).toBe("complete");
    expect(f.started.filter((url) => url.endsWith("/0"))).toHaveLength(2);
    expect(f.started.filter((url) => url.endsWith("/2"))).toHaveLength(4);
    expect(f.completed()).toBe(1);
  });
});

describe("Entry and database cleanup budgets", () => {
  it("keeps lock release available after the work deadline", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const calls: string[] = [];
    const query = {
      select: () => query,
      eq: () => query,
      update: () => query,
      // biome-ignore lint/suspicious/noThenProperty: Fixture implements a Supabase thenable query.
      then: (resolve: (value: unknown) => void) => resolve({ error: null }),
      single: async () => ({
        data: {
          ...config,
          enabled: true,
          phase: "products",
          active_cycle_id: "cycle",
          session_state: {},
          worker_token_hash: "hash",
          last_supplier_tick: "tcgfactory",
        },
        error: null,
      }),
    };
    const api = fixture(
      {
        supabase: {
          from: () => query,
          rpc: async (name: string) => {
            calls.push(name);
            return { data: true, error: null };
          },
        },
        sha256: async () => "hash",
        reconcileStaleCatalogBatch: async () => ({}),
        processDevirCycleTick: async (cfg: typeof config) => {
          expect(cfg.request_budget.deadline_at).toBe(95_000);
          expect(api.runtime.getStore()).toEqual({
            database_budget: { deadline_at: 115_000 },
          });
          vi.setSystemTime(95_000);
          throw Object.assign(new Error("budget"), { name: "SyncDeferred" });
        },
        crypto: { randomUUID: () => "lock" },
      },
      true,
    );
    const response = await api.handler(
      new Request("https://fixture.invalid", {
        method: "POST",
        headers: { "x-devir-worker-token": "token" },
        body: "{}",
      }),
    );
    expect(await response.json()).toEqual({
      ok: true,
      status: "deferred",
      reason: "request_budget",
    });
    expect(calls).toEqual([
      "devir_sync_acquire_lock",
      "devir_sync_release_lock",
    ]);
    expect(api.runtime.getStore()).toBeUndefined();
  });
  it("isolates concurrent database deadlines and bounds stalled response bodies", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const api = fixture({
      fetch: async () => ({ text: () => new Promise(() => {}) }),
    });
    const short = api.runtime.run(
      { database_budget: { deadline_at: 40 } },
      () =>
        api
          .syncDatabaseFetch("https://fixture.invalid/short")
          .catch((error: Error) => error.name),
    );
    const long = api.runtime.run(
      { database_budget: { deadline_at: 100 } },
      () =>
        api
          .syncDatabaseFetch("https://fixture.invalid/long")
          .catch((error: Error) => error.name),
    );
    await vi.advanceTimersByTimeAsync(41);
    expect(await short).toBe("SyncDeferred");
    expect(vi.getTimerCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(60);
    expect(await long).toBe("SyncDeferred");
    expect(api.runtime.getStore()).toBeUndefined();
  });
});

describe("Devir retirement replay", () => {
  it("counts a completed crawl once when reconciliation defers and resumes", async () => {
    const legacy = {
      supplier_sku: "sku",
      missing_cycles: 1,
      spree_product_id: "product",
      spree_variant_id: "variant",
    };
    const offer = {
      id: "offer",
      supplier_sku: "sku",
      external_variant_id: "sku",
      variant_id: "variant",
      missing_runs: 1,
      active: true,
    };
    const variant = {
      id: "variant",
      selected_offer_id: "offer" as string | null,
    };
    let closed = false,
      closures = 0,
      reconciliationAttempts = 0;
    let pending = ["variant"];
    const writes: Record<string, unknown>[] = [];
    const api = fixture({
      configuredCatalogSupplier: async () => ({ id: "supplier" }),
      spreeCategories: async () => [],
      definitions: async () => new Map(),
      loadCatalogVariant: async () => ({ product: { id: "product" }, variant }),
      markCatalogProductDirty: async () => {},
      preparePublishBatch: async () => {},
      reconcileCatalogVariant: async () => {
        if (reconciliationAttempts++ === 0) {
          variant.selected_offer_id = null;
          throw Object.assign(new Error("budget"), { name: "SyncDeferred" });
        }
        variant.selected_offer_id = null;
        return {};
      },
      supabase: {
        rpc: async (name: string) => {
          if (name === "catalog_ack_supplier_run_reconciliation") {
            pending = [];
            return { data: true, error: null };
          }
          closures++;
          if (!closed) {
            offer.missing_runs++;
            offer.active = false;
            closed = true;
          }
          return { data: { variantIds: pending }, error: null };
        },
        from: (table: string) => {
          let selected = false,
            rangeOffset = 0;
          const query = {
            select: () => {
              selected = true;
              return query;
            },
            eq: () => query,
            or: () => query,
            in: () => query,
            not: () => query,
            gte: () => query,
            order: () => query,
            range: (offset: number) => {
              rangeOffset = offset;
              return query;
            },
            update: (row: Record<string, unknown>) => {
              writes.push(row);
              if (table === "devir_sync_catalog" && "supplier_status" in row)
                Object.assign(legacy, row);
              return query;
            },
            // biome-ignore lint/suspicious/noThenProperty: Fixture implements a Supabase thenable query.
            then: (resolve: (value: unknown) => void) =>
              resolve({
                error: null,
                data:
                  !selected || rangeOffset > 0
                    ? []
                    : table === "devir_sync_catalog"
                      ? [legacy]
                      : table === "catalog_variants"
                        ? variant.selected_offer_id
                          ? [variant]
                          : []
                        : [offer],
              }),
          };
          return query;
        },
      },
    });
    await expect(
      api.retireMissingDevirOffers({}, "cycle"),
    ).rejects.toMatchObject({ name: "SyncDeferred" });
    await api.retireMissingDevirOffers({}, "cycle");
    expect(closures).toBe(2);
    expect(reconciliationAttempts).toBe(2);
    expect(pending).toEqual([]);
    expect(offer.missing_runs).toBe(2);
    expect(legacy.missing_cycles).toBe(2);
    expect(writes.some((row) => "count_on_hand" in row)).toBe(false);
  });
});

describe("Authenticated supplier request deadlines", () => {
  it("bounds the login POST body with the invocation budget", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const api = fixture({
      TCGFACTORY_BASE_URL: "https://fixture.invalid",
      TCGFACTORY_USER_AGENT: "fixture",
      htmlAttribute: () => null,
      tcgFactoryLoginFields: () => ({}),
      tcgCookieHeader: () => "",
      tcgFactoryTextFetch: async () => ({
        html: "",
        session: {},
        finalUrl: "https://fixture.invalid",
      }),
      fetch: async () => ({ text: () => new Promise(() => {}) }),
    });
    const promise = api
      .tcgFactoryLogin(
        { email: "fixture", password: "fixture" },
        { deadline_at: 100 },
      )
      .catch((error: Error) => error.name);
    await vi.advanceTimersByTimeAsync(101);
    expect(await promise).toBe("SyncDeferred");
  });
  it.each([
    "headers",
    "body",
  ])("bounds a stalled supplier %s", async (phase) => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const api = fixture({
      TCGFACTORY_USER_AGENT: "fixture",
      fetch: async () =>
        phase === "headers"
          ? new Promise(() => {})
          : { text: () => new Promise(() => {}) },
    });
    const promise = api
      .tcgFactoryTextFetch("https://fixture.invalid", undefined, {
        deadline_at: 100,
      })
      .catch((error: Error) => error.name);
    await vi.advanceTimersByTimeAsync(101);
    expect(await promise).toBe("SyncDeferred");
  });
});

describe("Bootstrap request budget", () => {
  it("bounds a stalled Spree authentication body", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const api = fixture({
      fetch: async () => ({ ok: true, text: () => new Promise(() => {}) }),
    });
    const promise = api
      .validateSpreeAdminKey("https://fixture.invalid", "sk_fixture", {
        deadline_at: 100,
      })
      .catch((error: Error) => error.name);
    await vi.advanceTimersByTimeAsync(101);
    expect(await promise).toBe("SyncDeferred");
  });
});

describe("Pending daily offer rotation", () => {
  it("resumes the tracked list after activation yields without creating another list", async () => {
    const state = {
      id: "primary",
      day_key: "2026-10-10",
      spree_price_list_id: "list",
      special: true,
      last_rotated_at: null,
      active_products: [
        {
          productId: "product",
          hadSale: false,
          hadFeatured: false,
          profile: "fixture",
        },
      ],
    };
    const commands: string[] = [];
    let blocked = true;
    const query = {
      eq: () => query,
      update: (row: Record<string, unknown>) => {
        Object.assign(state, row);
        return query;
      },
      // biome-ignore lint/suspicious/noThenProperty: Fixture implements a Supabase thenable query.
      then: (resolve: (value: unknown) => void) => resolve({ error: null }),
    };
    const api = fixture({
      dailyOfferState: async () => state,
      madridCommercialDay: () => ({ dayKey: "2026-10-10", saturday: true }),
      supabase: { from: () => query },
      spreeRequest: async (_config: object, method: string, path: string) => {
        commands.push(method + " " + path);
        if (path.endsWith("/product") && blocked) {
          blocked = false;
          throw Object.assign(new Error("budget"), { name: "SyncDeferred" });
        }
        return { tags: [] };
      },
    });
    await expect(api.rotateDailyOffersUnlocked({})).rejects.toMatchObject({
      name: "SyncDeferred",
    });
    expect(state.last_rotated_at).toBeNull();
    expect((await api.rotateDailyOffersUnlocked({})).status).toBe("rotated");
    expect(state.last_rotated_at).not.toBeNull();
    expect(
      commands.filter(
        (command) => command === "PATCH /price_lists/list/activate",
      ),
    ).toHaveLength(2);
    expect(commands.some((command) => command === "POST /price_lists")).toBe(
      false,
    );
  });
});

describe("Completion queue and enqueue deferral", () => {
  it("acknowledges retirement only after publication succeeds", async () => {
    let pending = ["variant"];
    let blocked = true;
    const trace: string[] = [];
    const api = fixture({
      configuredCatalogSupplier: async () => ({ id: "supplier" }),
      spreeCategories: async () => [],
      definitions: async () => new Map(),
      loadCatalogVariant: async () => ({}),
      reconcileCatalogVariant: async () => {
        trace.push("reconcile");
        return { productId: "product" };
      },
      markCatalogProductDirty: async () => {
        trace.push("dirty");
      },
      preparePublishBatch: async () => {
        trace.push("publish");
        if (blocked) {
          blocked = false;
          throw Object.assign(new Error("budget"), { name: "SyncDeferred" });
        }
      },
      supabase: {
        rpc: async (name: string) => {
          if (name === "catalog_complete_supplier_run")
            return { data: { variantIds: pending }, error: null };
          trace.push("ack");
          pending = [];
          return { data: true, error: null };
        },
      },
    });
    await expect(
      api.completeCatalogSupplierRun(
        {},
        { supplierCode: "tcgfactory", runId: "run" },
      ),
    ).rejects.toMatchObject({ name: "SyncDeferred" });
    expect(pending).toEqual(["variant"]);
    await api.completeCatalogSupplierRun(
      {},
      { supplierCode: "tcgfactory", runId: "run" },
    );
    expect(trace).toEqual([
      "reconcile",
      "dirty",
      "publish",
      "reconcile",
      "dirty",
      "publish",
      "ack",
    ]);
  });
  it("drains an already closed TCG run before authenticating or ingesting more items", async () => {
    const writes: object[] = [];
    const query = {
      select: () => query,
      eq: () => query,
      maybeSingle: async () => ({
        data: {
          status: "running",
          run_id: "run",
          section: "tcg",
          page: 1,
          item_offset: 6,
        },
        error: null,
      }),
      update: (row: object) => {
        writes.push(row);
        return query;
      },
      // biome-ignore lint/suspicious/noThenProperty: Fixture implements a Supabase thenable query.
      then: (resolve: (value: unknown) => void) => resolve({ error: null }),
    };
    const api = fixture({
      TCGFACTORY_SUPPLIER_CODE: "tcgfactory",
      TCGFACTORY_CATALOG_SECTIONS: [{ key: "tcg" }],
      tcgFactorySupplierRow: async () => ({
        id: "supplier",
        enabled: true,
        last_completed_run_id: "run",
        config: { sections: ["tcg"] },
      }),
      tcgFactoryCredentialsConfigured: async () => {
        throw new Error("must not authenticate a closed run");
      },
      completeCatalogSupplierRun: async () => ({}),
      supabase: { from: () => query },
    });
    expect((await api.tcgFactoryTick({})).status).toBe("complete");
    expect(writes).toContainEqual(
      expect.objectContaining({ status: "idle", run_id: null }),
    );
  });
  it("requeues the category if the product enqueue returns a database timeout", async () => {
    const writes: Record<string, unknown>[] = [];
    const query = {
      select: () => query,
      eq: () => query,
      order: () => query,
      limit: async () => ({
        data: [
          {
            id: 1,
            attempts: 0,
            url: "https://fixture.invalid/category",
            page: 1,
          },
        ],
        error: null,
      }),
      update: (row: Record<string, unknown>) => {
        writes.push(row);
        return query;
      },
      upsert: async () => ({ error: { message: "SyncDeferred: budget" } }),
      // biome-ignore lint/suspicious/noThenProperty: Fixture implements a Supabase thenable query.
      then: (resolve: (value: unknown) => void) => resolve({ error: null }),
    };
    const api = fixture({
      recoverExpiredCycleJobs: async () => {},
      supabase: { from: () => query },
      devirFetch: async () => "fixture",
      productLinks: () => ["https://fixture.invalid/product"],
    });
    await api.processCategories({ batch_size: 1, max_pages: 10 }, "cycle");
    expect(writes.map((row) => row.status)).toEqual(["processing", "pending"]);
    expect(writes.at(-1)).toMatchObject({ error: null, attempts: 0 });
  });
});
