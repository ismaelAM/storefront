// @vitest-environment node
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";
import * as publication from "../../supabase/functions/_shared/catalog-publish-policy";

const source = ts.createSourceFile(
  "index.ts",
  readFileSync("supabase/functions/devir-sync/index.ts", "utf8"),
  ts.ScriptTarget.Latest,
  true,
);
const code = ts.transpileModule(
  source.statements
    .filter(
      (node) =>
        ts.isFunctionDeclaration(node) &&
        ["syncProductToSpree", "syncHomePreorderMembership"].includes(
          node.name?.text ?? "",
        ),
    )
    .map((node) => node.getText(source))
    .join("\n"),
  { compilerOptions: { target: ts.ScriptTarget.ES2022 } },
).outputText;

function fixture(
  status: string | null | undefined,
  mode = "supplier_or_physical",
  rejected = false,
  create = false,
) {
  const native: Record<string, unknown> = {
    id: "product",
    name: "Game",
    status,
    tags: ["catalog-managed", "catalog-ready", "offer-date:2026-11-10"],
    preorder: false,
    purchasable: true,
  };
  const variant = { id: "variant", sku: "sku", price: 20, total_on_hand: 0 };
  const request = vi.fn(
    async (
      _config: object,
      method: string,
      path: string,
      patch?: Record<string, unknown>,
    ) => {
      if (path.includes("/variants")) return variant;
      if (method === "PATCH" || method === "POST") Object.assign(native, patch);
      return structuredClone(native);
    },
  );
  const repairChannel = vi.fn(async () => {});
  const reconcileFulfillment = vi.fn(async () => {
    // Aggregate native flags become current only after fulfillment reconciliation.
    native.preorder = true;
    native.purchasable = true;
    return 1;
  });
  const run = runInNewContext(`${code}; syncProductToSpree`, {
    ...publication,
    isExcludedCatalogLanguage: () => false,
    categoryKey: () => "games",
    categoryForKey: (items: unknown[]) => items[0],
    categoryMargin: async () => 0.1,
    commercialPricingProfile: () => ({ code: "game" }),
    DEFAULT_CATEGORY_MARGINS: {},
    commercialTargetMargin: () => 0.1,
    competitivePricing: () => ({
      retail: 20,
      vatRate: 0.21,
      ruleSource: "managed",
    }),
    shippingDefaults: () => ({}),
    isPack: () => false,
    isCatalanCatalogProduct: () => false,
    groupingInfo: () => ({ itemKind: "standalone" }),
    languageGroupingInfo: () => null,
    findSpreeProduct: async () => null,
    checkpointCatalogSpreeMapping: async () => {},
    productFields: async () => [],
    adoptPublishedCatalogReview: async () => null,
    variantPrice: () => 20,
    nativePatchMatches: () => true,
    upsertBasePrice: async () => {},
    STANDARD_EEA_CARD_RATE: 0.015,
    STANDARD_EEA_CARD_FIXED_EUR: 0.25,
    upsertProductFields: async () => {},
    upsertVariantProvenance: async () => {},
    humanizeReviewReasons: () => "review",
    syncBackorderability: reconcileFulfillment,
    TCGFACTORY_SUPPLIER_CODE: "tcgfactory",
    syncImages: async () => 0,
    spreeRequest: request,
    spreeList: async () => [variant],
    ensureProductsInDefaultChannel: repairChannel,
  });
  const context = {
    supplier: { code: "supplier", config: {} },
    offer: { currency: "EUR" },
    offers: [],
    canonicalSku: "sku",
    productName: "Game",
    options: {},
    reviewDecision: rejected ? "rejected" : "pending",
    fulfillmentMode: mode,
    lastAutoPrice: 20,
    ...(create
      ? {}
      : { existingProduct: structuredClone(native), existingVariant: variant }),
  };
  return {
    native,
    request,
    repairChannel,
    reconcileFulfillment,
    run: () =>
      run(
        {},
        {
          sku: "sku",
          name: "Game",
          url: "https://supplier.test/game",
          purchasePrice: 10,
          imageUrls: ["https://supplier.test/image.jpg"],
          availability: "preorder",
          releaseDate: null,
        },
        [{ id: "games" }],
        new Map(),
        context,
      ),
    statusWrites: () =>
      request.mock.calls.filter(
        (call) =>
          call[1] === "PATCH" &&
          call[2] === "/products/product" &&
          call[3]?.status !== undefined,
      ),
  };
}

describe("product status reconciliation avoids redundant native writes", () => {
  it("keeps an active status and refreshes aggregate preorder state before repairing membership and channel", async () => {
    const f = fixture("active");
    await f.run();
    expect(f.statusWrites()).toEqual([]);
    expect(f.request).toHaveBeenCalledWith(
      {},
      "GET",
      "/products/product",
      undefined,
    );
    expect(f.native.tags).toEqual([
      "catalog-managed",
      "catalog-ready",
      "offer-date:2026-11-10",
      "devir-preorder",
    ]);
    expect(f.repairChannel).toHaveBeenCalledExactlyOnceWith({}, ["product"]);
    expect(f.reconcileFulfillment).toHaveBeenCalledOnce();
  });

  it.each([
    "draft",
    "archived",
    null,
    undefined,
  ])("still activates a product whose native status is %s", async (status) => {
    const f = fixture(status);
    await f.run();
    expect(
      f.statusWrites().filter((call) => call[3]?.status === "active"),
    ).toHaveLength(1);
    expect(f.native.status).toBe("active");
    expect(f.repairChannel).toHaveBeenCalledOnce();
  });

  it("publishes a newly created draft", async () => {
    const f = fixture("draft", "supplier_or_physical", false, true);
    await f.run();
    expect(
      f.statusWrites().filter((call) => call[3]?.status === "active"),
    ).toHaveLength(1);
    expect(f.native.status).toBe("active");
  });

  it.each([
    "active",
    "draft",
  ])("drafts a rejected %s product only once and preserves its latest review tags", async (status) => {
    const f = fixture(status, "supplier_or_physical", true);
    await f.run();
    expect(f.statusWrites()).toHaveLength(1);
    expect(f.native.status).toBe("draft");
    expect(f.native.tags).toContain("catalog-review");
    expect(f.native.tags).not.toContain("catalog-ready");
    expect(f.native.tags).not.toContain("devir-preorder");
    expect(f.repairChannel).not.toHaveBeenCalled();
  });

  it.each([
    "active",
    "draft",
  ])("keeps disabled fulfillment drafted from %s", async (status) => {
    const f = fixture(status, "disabled");
    await f.run();
    expect(
      f
        .statusWrites()
        .filter((call) => Object.keys(call[3] ?? {}).length === 1),
    ).toHaveLength(status === "active" ? 1 : 0);
    expect(f.native.status).toBe("draft");
    expect(f.repairChannel).not.toHaveBeenCalled();
  });

  it("propagates a failed final native refresh for retry instead of repairing from a stale snapshot", async () => {
    const f = fixture("active");
    f.request.mockImplementationOnce(async () => {
      throw new Error("native unavailable");
    });
    await expect(f.run()).rejects.toThrow("native unavailable");
    expect(f.repairChannel).not.toHaveBeenCalled();
  });
});
