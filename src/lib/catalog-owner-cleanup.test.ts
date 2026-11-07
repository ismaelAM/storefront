// @vitest-environment node
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";
import { isExcludedCatalogLanguage } from "../../supabase/functions/_shared/devir-catalog-policy";
import {
  catalogReviewFingerprint,
  shouldRequireCatalogReview,
} from "../../supabase/functions/_shared/catalog-publish-policy";

const source = ts.createSourceFile(
  "index.ts",
  readFileSync("supabase/functions/devir-sync/index.ts", "utf8"),
  ts.ScriptTarget.Latest,
  true,
);
const names = [
  "reconcileCatalogVariantUnlocked",
  "catalogSpreeMapping",
  "enforceVariantFulfillmentFlags",
  "refreshHumanReviewMarkersBatch",
  "catalogGroupOwnerCleanupBlocked",
  "repairExistingMangaGroup",
  "rebuildMangaGroup",
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

function fixture(
  decision: string,
  note: string | null | undefined,
  nativeDeleted = false,
) {
  const requests: Array<{
    method: string;
    path: string;
    body?: Record<string, unknown>;
  }> = [];
  const choose = vi.fn(async () => ({
    selected: null,
    selectedSupplier: null,
    offers: [],
  }));
  const run = runInNewContext(`${code}; reconcileCatalogVariantUnlocked`, {
    isExcludedCatalogLanguage,
    chooseCatalogOffer: choose,
    syncBackorderability: async () => 0,
    syncApprovedSupplierPackChildren: async () => 0,
    upsertVariantProvenance: async () => {},
    syncHomePreorderMembership: async () => {},
    spreeRequest: async (
      _config: object,
      method: string,
      path: string,
      body?: Record<string, unknown>,
    ) => {
      requests.push({ method, path, body });
      if (nativeDeleted) throw new Error("Spree HTTP 404: deleted by owner");
      return path.includes("/variants/")
        ? { id: "native-variant" }
        : { id: "native-product", status: "active", tags: [], ...body };
    },
  });
  const resolution = {
    product: {
      id: "canonical-product",
      name: "Juego Español",
      category_key: "juegos-de-mesa/general",
      spree_product_id: "native-product",
      review_decision: decision,
      review_note: note,
    },
    variant: {
      id: "canonical-variant",
      name: "Estándar",
      canonical_sku: "game",
      option_values: {},
      spree_variant_id: "native-variant",
      fulfillment_mode: "supplier_or_physical",
    },
  };
  return {
    run: () => run({}, resolution, [], new Map()),
    choose,
    requests,
    resolution,
  };
}

describe("owner cleanup rejection before native catalog reconciliation", () => {
  it.each([
    "owner-unpublished-cleanup:2026-11-07",
    "owner-unpublished-cleanup:2026-11-08: batch 2",
  ])("does not select supply or read/write a deleted native product for %s", async (note) => {
    const f = fixture("rejected", note, true);
    const before = structuredClone(f.resolution);
    await expect(f.run()).resolves.toEqual({
      productId: null,
      variantId: null,
      images: 0,
      review: true,
      reviewReasons: ["owner_unpublished_cleanup"],
      backorderItems: 0,
      lastAutoPrice: null,
      selectedSupplierCode: null,
    });
    expect(f.choose).not.toHaveBeenCalled();
    expect(f.requests).toEqual([]);
    expect(f.resolution).toEqual(before);
  });

  it.each([
    ["approved", "owner-unpublished-cleanup:2026-11-07"],
    ["pending", "owner-unpublished-cleanup:2026-11-07"],
    ["rejected", "Rechazado por el propietario: pack sin dividir"],
    ["rejected", "owner-unpublished-cleanup"],
    ["rejected", "Referencia a owner-unpublished-cleanup:2026-11-07"],
    ["rejected", null],
    ["rejected", undefined],
  ])("preserves ordinary native reconciliation for decision=%s note=%s", async (decision, note) => {
    const f = fixture(decision, note);
    const result = await f.run();
    expect(f.choose).toHaveBeenCalledExactlyOnceWith(f.resolution.variant);
    expect(f.requests).toContainEqual({
      method: "GET",
      path: "/products/native-product",
      body: undefined,
    });
    expect(f.requests).toContainEqual({
      method: "GET",
      path: "/products/native-product/variants/native-variant",
      body: undefined,
    });
    expect(f.requests).toContainEqual({
      method: "PATCH",
      path: "/products/native-product/variants/native-variant",
      body: {
        track_inventory: true,
        preorderable: false,
        preorder_ships_at: null,
      },
    });
    expect(f.requests.some((request) => request.body?.status === "draft")).toBe(
      decision === "rejected",
    );
    expect(result).toMatchObject({
      productId: "native-product",
      variantId: "native-variant",
      review: decision === "rejected",
    });
    expect(
      f.requests.some(
        (request) => request.body && "count_on_hand" in request.body,
      ),
    ).toBe(false);
  });
});

function markerFixture(
  policies: Array<{
    spree_product_id: string;
    review_decision: string;
    review_note?: string | null;
  }>,
) {
  const legacy = policies.map((policy) => ({
    spree_product_id: policy.spree_product_id,
    review_marker_version: null as string | null,
  }));
  const requests: Array<{ method: string; path: string }> = [];
  const definitions = vi.fn(async () => new Map());
  const reasonReads: string[] = [];
  const supabase = {
    from: (table: string) => {
      let patch: Record<string, unknown> | undefined;
      let wantedIds: string[] | undefined;
      const q = {
        select: () => q,
        not: () => q,
        or: () => q,
        order: () => q,
        eq: (key: string, value: string) => {
          if (key === "spree_product_id") wantedIds = [value];
          return q;
        },
        in: (_key: string, values: string[]) => {
          wantedIds = values;
          return q;
        },
        update: (value: Record<string, unknown>) => {
          patch = value;
          return q;
        },
        limit: async (limit: number) => ({
          data: legacy
            .filter((row) => row.review_marker_version !== "review_test")
            .slice(0, limit),
          count: legacy.filter(
            (row) => row.review_marker_version !== "review_test",
          ).length,
          error: null,
        }),
        // biome-ignore lint/suspicious/noThenProperty: Models canonical reads and legacy marker updates.
        then: (resolve: (value: unknown) => void) => {
          if (patch)
            legacy
              .filter(
                (row) => !wantedIds || wantedIds.includes(row.spree_product_id),
              )
              .forEach((row) => Object.assign(row, patch));
          resolve({
            data:
              table === "catalog_products"
                ? policies.filter(
                    (row) =>
                      !wantedIds || wantedIds.includes(row.spree_product_id),
                  )
                : [],
            error: null,
          });
        },
      };
      return q;
    },
  };
  const run = runInNewContext(`${code}; refreshHumanReviewMarkersBatch`, {
    supabase,
    HUMAN_REVIEW_MARKER_VERSION: "review_test",
    definitions,
    currentCatalogReviewReasonsForSpreeProduct: async (id: string) => {
      reasonReads.push(id);
      return new Set(["product_image_missing"]);
    },
    spreeRequest: async (
      _config: object,
      method: string,
      path: string,
      body?: Record<string, unknown>,
    ) => {
      requests.push({ method, path });
      if (path.includes("deleted"))
        throw new Error("Spree HTTP 404: deleted by owner");
      return { id: path.split("/")[2], status: "active", tags: [], ...body };
    },
    adoptPublishedCatalogReview: async () => null,
    shouldRequireCatalogReview,
    catalogReviewFingerprint,
    upsertProductFields: async () => {},
    humanizeReviewReasons: () => "Review required",
  });
  return { run: () => run({}, 5), requests, definitions, reasonReads, legacy };
}

describe("review marker maintenance after owner cleanup", () => {
  it("checkpoints deleted cleanup products without reading Spree and does not retry them", async () => {
    const f = markerFixture([
      {
        spree_product_id: "deleted-product",
        review_decision: "rejected",
        review_note: "owner-unpublished-cleanup:2026-11-07",
      },
    ]);
    await expect(f.run()).resolves.toEqual({ processed: 1, remaining: 0 });
    expect(f.requests).toEqual([]);
    expect(f.reasonReads).toEqual([]);
    expect(f.definitions).not.toHaveBeenCalled();
    expect(f.legacy[0].review_marker_version).toBe("review_test");
    expect(await f.run()).toEqual({ processed: 0, remaining: 0 });
    expect(f.requests).toEqual([]);
  });
  it.each([
    ["approved", "owner-unpublished-cleanup:2026-11-07"],
    ["pending", "owner-unpublished-cleanup:2026-11-07"],
    ["rejected", "Owner rejected an unsafe supplier pack"],
    ["rejected", null],
  ])("continues native marker maintenance for decision=%s note=%s", async (decision, note) => {
    const f = markerFixture([
      {
        spree_product_id: "ordinary-product",
        review_decision: decision,
        review_note: note,
      },
    ]);
    expect(await f.run()).toEqual({ processed: 1, remaining: 0 });
    expect(f.requests).toContainEqual({
      method: "GET",
      path: "/products/ordinary-product",
    });
    expect(f.reasonReads).toEqual(["ordinary-product"]);
  });
  it("finishes ordinary review work in a mixed batch containing deleted cleanup products", async () => {
    const f = markerFixture([
      {
        spree_product_id: "deleted-product",
        review_decision: "rejected",
        review_note: "owner-unpublished-cleanup:2026-11-07",
      },
      { spree_product_id: "ordinary-product", review_decision: "pending" },
    ]);
    expect(await f.run()).toEqual({ processed: 2, remaining: 0 });
    expect(f.requests.some((request) => request.path.includes("deleted"))).toBe(
      false,
    );
    expect(f.reasonReads).toEqual(["ordinary-product"]);
    expect(
      f.legacy.every((row) => row.review_marker_version === "review_test"),
    ).toBe(true);
  });
});

function mangaFixture(
  entry: "repairExistingMangaGroup" | "rebuildMangaGroup",
  decision: string,
  note: string,
  reachCreation = false,
) {
  const rows = [
    {
      supplier_sku: "vol-1",
      group_name: "Serie",
      variant_position: 1,
      spree_product_id: "deleted-product",
    },
    {
      supplier_sku: "vol-2",
      group_name: "Serie",
      variant_position: 2,
      spree_product_id: "ordinary-product",
    },
  ];
  const nativeCalls: string[] = [];
  const stop = new Error("native boundary reached");
  const run = runInNewContext(`${code}; ${entry}`, {
    supabase: {
      from: (table: string) => {
        let productIds: string[] = [];
        const query = {
          select: () => query,
          eq: () => query,
          order: () => query,
          in: (_column: string, ids: string[]) => {
            productIds = ids;
            return query;
          },
          // biome-ignore lint/suspicious/noThenProperty: Models legacy group and canonical policy reads.
          then: (resolve: (value: unknown) => void) =>
            resolve({
              data:
                table === "devir_sync_catalog"
                  ? rows
                  : [
                      {
                        spree_product_id: "deleted-product",
                        review_decision: decision,
                        review_note: note,
                      },
                    ].filter((row) =>
                      productIds.includes(row.spree_product_id),
                    ),
              error: null,
            }),
        };
        return query;
      },
    },
    catalogRowProduct: (row: unknown) => row,
    categoryKey: () => "manga-comic",
    variantEdition: () => null,
    categoryForKey: (categories: unknown[]) => categories[0],
    spreeList: async () => {
      nativeCalls.push("GET search");
      if (!reachCreation) throw stop;
      return [];
    },
    spreeCategories: async () => {
      nativeCalls.push("GET categories");
      if (!reachCreation) throw stop;
      return [{ id: "manga" }];
    },
    spreeRequest: async (_config: object, method: string, path: string) => {
      nativeCalls.push(`${method} ${path}`);
      throw stop;
    },
  });
  return { run: () => run({}, "manga-series"), nativeCalls, rows, stop };
}

describe.each([
  "repairExistingMangaGroup",
  "rebuildMangaGroup",
] as const)("owner cleanup during %s", (entry) => {
  it("skips a mixed group before any native read, creation or remapping when one member was removed", async () => {
    const f = mangaFixture(
      entry,
      "rejected",
      "owner-unpublished-cleanup:2026-11-07",
    );
    const before = structuredClone(f.rows);
    expect(await f.run()).toEqual({
      ok: true,
      group_key: "manga-series",
      skipped: "owner_unpublished_cleanup",
    });
    expect(f.nativeCalls).toEqual([]);
    expect(f.rows).toEqual(before);
  });
  it.each([
    ["approved", "owner-unpublished-cleanup:2026-11-07"],
    ["pending", "owner-unpublished-cleanup:2026-11-07"],
    ["rejected", "Owner rejected an unsafe pack"],
  ])("retains existing native repair behavior for decision=%s note=%s", async (decision, note) => {
    const f = mangaFixture(entry, decision, note);
    await expect(f.run()).rejects.toBe(f.stop);
    expect(f.nativeCalls).toEqual([
      entry === "repairExistingMangaGroup" ? "GET search" : "GET categories",
    ]);
  });
});

it("retains the repair-to-rebuild creation path for an ordinary group", async () => {
  const f = mangaFixture("repairExistingMangaGroup", "pending", "", true);
  await expect(f.run()).rejects.toBe(f.stop);
  expect(f.nativeCalls).toEqual([
    "GET search",
    "GET categories",
    "POST /products",
  ]);
});
