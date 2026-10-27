// @vitest-environment node
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";

const source = ts.createSourceFile(
  "index.ts",
  readFileSync("supabase/functions/devir-sync/index.ts", "utf8"),
  ts.ScriptTarget.Latest,
  true,
);
function production(...names: string[]) {
  return ts.transpileModule(
    source.statements
      .filter(
        (node) =>
          ts.isFunctionDeclaration(node) &&
          names.includes(node.name?.text ?? ""),
      )
      .map((node) => node.getText(source))
      .join("\n"),
    {
      compilerOptions: { target: ts.ScriptTarget.ES2022 },
    },
  ).outputText;
}
const config = { spree_api_url: "https://project-7ck7q.vercel.app" };
const selected = {
  supplier: { code: "supplier", name: "Supplier" },
  offer: {
    supplier_sku: "SKU",
    id: "offer1",
    source_url: "https://example.test/1",
    normalized_cost: 10,
    currency: "EUR",
    availability: "available",
  },
};
const offers = [
  {
    id: "offer1",
    supplierCode: "supplier",
    normalizedCost: 10,
    availability: "available",
    lastSeenAt: "2026-10-27T10:00:00Z",
    selected: true,
  },
];

function provenanceFixture(initial?: unknown, supplied = false) {
  let stored = initial;
  const write = vi.fn(async (_config, _method, _path, body) => {
    stored = body.custom_fields[0].value;
    return {};
  });
  const fields = () =>
    stored === undefined
      ? []
      : [
          {
            id: "cf_source",
            key: "sourcing.variant_provenance",
            value: stored,
          },
        ];
  const read = vi.fn(async () => fields());
  const run = runInNewContext(
    `${production("catalogProvenanceSignature", "upsertVariantProvenance", "upsertProductFields")}; upsertVariantProvenance`,
    { productFields: read, spreeRequest: write },
  );
  const sync = (
    selection: unknown = selected,
    incomingOffers: unknown = offers,
  ) =>
    run(
      config,
      "prod1",
      new Map([["sourcing.variant_provenance", { id: "def_source" }]]),
      "variant1",
      "EAN",
      { idioma: "Español" },
      selection,
      incomingOffers,
      supplied ? fields() : undefined,
    );
  return { sync, write, read, stored: () => JSON.parse(String(stored)) };
}

describe("Supabase-managed supplier freshness without timestamp-only Spree writes", () => {
  it("does not rewrite provenance when only refresh timestamps change", async () => {
    const first = provenanceFixture();
    await first.sync();
    const previous = first.stored();
    previous.variants.variant1.selectedSupplier.selectedAt =
      "2026-10-26T10:00:00Z";
    previous.variants.variant1.offers[0].lastSeenAt = "2026-10-26T10:00:00Z";
    const next = provenanceFixture(JSON.stringify(previous));
    await next.sync();
    expect(next.write).not.toHaveBeenCalled();
    expect(next.stored()).toEqual(previous);
  });

  it.each([
    [
      "cost",
      { ...selected, offer: { ...selected.offer, normalized_cost: 11 } },
    ],
    [
      "availability",
      { ...selected, offer: { ...selected.offer, availability: "preorder" } },
    ],
    [
      "supplier",
      { ...selected, supplier: { code: "alternative", name: "Alternative" } },
    ],
    ["expired selection", null],
  ])("still publishes a meaningful %s change and preserves other variants", async (_name, changed) => {
    const first = provenanceFixture();
    await first.sync();
    const previous = first.stored();
    previous.variants.other = {
      canonicalSku: "OTHER",
      options: { color: "red" },
    };
    const next = provenanceFixture(JSON.stringify(previous));
    await next.sync(changed);
    expect(next.write).toHaveBeenCalledTimes(1);
    expect(next.stored().variants.other).toEqual(previous.variants.other);
    expect(
      next.stored().variants.variant1.selectedSupplier?.normalizedCost ?? null,
    ).toBe(changed?.offer.normalized_cost ?? null);
  });

  it("publishes a changed alternative offer even when the chosen supplier stays the same", async () => {
    const first = provenanceFixture();
    await first.sync();
    const next = provenanceFixture(JSON.stringify(first.stored()));
    await next.sync(selected, [
      ...offers,
      { ...offers[0], id: "offer2", normalizedCost: 12, selected: false },
    ]);
    expect(next.write).toHaveBeenCalledTimes(1);
  });

  it("uses the supplied product snapshot without another native read", async () => {
    const f = provenanceFixture(undefined, true);
    await f.sync();
    expect(f.read).not.toHaveBeenCalled();
    expect(f.write).toHaveBeenCalledTimes(1);
  });

  it("propagates a failed write so that the next reconciliation retries it", async () => {
    const f = provenanceFixture();
    f.write.mockRejectedValueOnce(new Error("native unavailable"));
    await expect(f.sync()).rejects.toThrow("native unavailable");
    await f.sync();
    expect(f.write).toHaveBeenCalledTimes(2);
    expect(f.stored().variants.variant1.canonicalSku).toBe("EAN");
  });
});

it("reads existing product metadata once across pricing, review and provenance", async () => {
  const product = { id: "prod1", status: "active", tags: ["catalog-managed"] };
  const currentFields = [
    { id: "manual", key: "manual.keep", value: "operator value" },
  ];
  const read = vi.fn(async () => structuredClone(currentFields));
  const write = vi.fn(async (_config, _method, _path, _body) => product);
  const adopt = vi.fn(async () => null);
  const run = runInNewContext(
    `${production("syncProductToSpree", "upsertProductFields", "upsertVariantProvenance", "catalogProvenanceSignature")}; syncProductToSpree`,
    {
      productFields: read,
      spreeRequest: write,
      adoptPublishedCatalogReview: adopt,
      categoryKey: () => "tcg/mtg",
      categoryForKey: () => ({ id: "cat1" }),
      categoryMargin: async () => 0.1,
      commercialPricingProfile: () => ({ code: "mtg" }),
      DEFAULT_CATEGORY_MARGINS: {},
      commercialTargetMargin: () => 0.1,
      competitivePricing: () => ({
        retail: 20,
        vatRate: 0.21,
        ruleSource: "profile",
      }),
      shippingDefaults: () => ({}),
      isPack: () => false,
      isCatalanCatalogProduct: () => false,
      groupingInfo: () => ({ itemKind: "standalone" }),
      languageGroupingInfo: () => null,
      shouldRequireCatalogReview: () => false,
      effectiveCatalogFulfillmentMode: () => "supplier_or_physical",
      shouldAllowSupplierBackorder: () => true,
      variantPrice: () => 20,
      canWriteManagedCatalogPrice: () => false,
      STANDARD_EEA_CARD_RATE: 0.015,
      STANDARD_EEA_CARD_FIXED_EUR: 0.25,
      catalogReviewFingerprint: () => "none",
      humanizeReviewReasons: () => "",
      syncBackorderability: async () => 0,
      TCGFACTORY_SUPPLIER_CODE: "tcgfactory",
      syncImages: async () => 0,
      shouldAutoPublishCatalogProduct: () => true,
      shouldListCatalogProduct: () => true,
      syncHomePreorderMembership: async () => {},
      ensureProductsInDefaultChannel: async () => {},
    },
  );
  await run(
    config,
    {
      sku: "EAN",
      name: "Display",
      purchasePrice: 10,
      imageUrls: ["image"],
      availability: "available",
    },
    [],
    new Map([["sourcing.variant_provenance", { id: "def_source" }]]),
    {
      catalogProductId: "catprod1",
      catalogVariantId: "catvar1",
      canonicalSku: "EAN",
      options: {},
      ...selected,
      offers,
      existingProduct: product,
      existingVariant: { id: "variant1", sku: "EAN", total_on_hand: 6 },
    },
  );
  expect(read).toHaveBeenCalledTimes(1);
  expect(adopt).toHaveBeenCalledWith(config, product, [], currentFields);
  expect(currentFields[0].value).toBe("operator value");
  expect(
    write.mock.calls.some((call) => "count_on_hand" in (call[3] ?? {})),
  ).toBe(false);
});
