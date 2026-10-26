// @vitest-environment node
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const src = ts.createSourceFile(
  "index.ts",
  readFileSync("supabase/functions/devir-sync/index.ts", "utf8"),
  ts.ScriptTarget.Latest,
  true,
);
const code = ts.transpileModule(
  src.statements
    .filter(
      (n) =>
        ts.isFunctionDeclaration(n) &&
        ["processProducts", "canStartSyncWork"].includes(n.name?.text ?? ""),
    )
    .map((n) => n.getText(src))
    .join("\n"),
  { compilerOptions: { target: ts.ScriptTarget.ES2022 } },
).outputText;
function fixture(deferFirst = false, failClaim = false, visibleFirst = false) {
  let clock = 0,
    active = 0,
    maximum = 0;
  const completed: number[] = [];
  const pending: number[] = [];
  const jobs = Array.from({ length: 9 }, (_, i) => ({
    id: i + 1,
    attempts: 0,
    url: `url-${i + 1}`,
    recovery_priority: visibleFirst && i === 8 ? 100 : 0,
  }));
  const supabase = {
    from: (table: string) => {
      let write: Record<string, unknown> | undefined;
      const ordering: Array<{
        key: "id" | "recovery_priority";
        ascending: boolean;
      }> = [];
      const q = {
        select: () => q,
        eq: asyncOrQuery,
        in: () => q,
        order: (
          key: "id" | "recovery_priority",
          options?: { ascending?: boolean },
        ) => {
          ordering.push({ key, ascending: options?.ascending !== false });
          return q;
        },
        limit: async (count: number) => ({
          data: [...jobs]
            .sort((a, b) => {
              for (const order of ordering) {
                const delta = a[order.key] - b[order.key];
                if (delta) return order.ascending ? delta : -delta;
              }
              return 0;
            })
            .slice(0, count),
          error: null,
        }),
        update: (value: Record<string, unknown>) => {
          write = value;
          return q;
        },
        upsert: async () => ({ error: null }),
      };
      function asyncOrQuery(key: string, id: number) {
        if (!write) return q;
        if (key === "id" && table === "devir_sync_jobs") {
          if (failClaim && id === 1 && write.status === "processing")
            return Promise.resolve({ error: new Error("claim failed") });
          if (write.status === "done") completed.push(id);
          if (write.status === "pending") pending.push(id);
        }
        return Promise.resolve({ error: null });
      }
      return q;
    },
  };
  const process = runInNewContext(`${code}; processProducts`, {
    supabase,
    Date: class extends Date {
      static now() {
        return clock;
      }
    },
    recoverExpiredCycleJobs: async () => {},
    spreeCategories: async () => [],
    definitions: async () => new Map(),
    devirFetch: async (_c: object, url: string) => url,
    parseProduct: (_html: string, url: string) => ({
      sku: url,
      imageUrls: [],
      availability: "available",
    }),
    sha256: async () => "",
    groupingInfo: () => ({}),
    isPack: () => false,
    devirCatalogItem: (x: unknown) => x,
    languageGroupingInfo: () => null,
    isSyncDeferred: (e: Error) => e.message === "deferred",
    ingestCatalogItem: async (_c: object, p: { sku: string }) => {
      const end = clock + 10_000;
      active++;
      maximum = Math.max(maximum, active);
      await Promise.resolve();
      clock = Math.max(clock, end);
      active--;
      if (deferFirst && p.sku === "url-1") throw Error("deferred");
      return {
        synced: {
          productId: p.sku,
          variantId: p.sku,
          lastAutoPrice: 20,
          images: 0,
          review: false,
          backorderItems: 1,
        },
      };
    },
  });
  return {
    run: () =>
      process(
        {
          batch_size: visibleFirst ? 3 : 9,
          request_budget: { deadline_at: 36_000 },
        },
        "cycle",
      ),
    completed,
    pending,
    maximum: () => maximum,
  };
}
describe("Devir inventory progress under a fixed external-work budget", () => {
  it("refreshes explicitly prioritized visible fiches before the older backlog within the same batch cap", async () => {
    const f = fixture(false, false, true);
    await f.run();
    expect(f.completed.sort()).toEqual([1, 2, 9]);
  });
  it("finishes sibling checkpoints before returning a failed claim to the worker lock owner", async () => {
    const f = fixture(false, true);
    await expect(f.run()).rejects.toThrow("claim failed");
    expect(f.completed.sort()).toEqual([2, 3]);
  });
  it("finishes nine independent fiches inside three network windows instead of abandoning most of the batch", async () => {
    const f = fixture();
    const result = await f.run();
    expect(result.processed).toBe(9);
    expect(f.completed.sort()).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(f.maximum()).toBeLessThanOrEqual(3);
  });
  it("requeues a budget yield, checkpoints finished siblings and stops starting new groups", async () => {
    const f = fixture(true);
    await f.run();
    expect(f.pending).toEqual([1]);
    expect(f.completed.sort()).toEqual([2, 3]);
  });
});
