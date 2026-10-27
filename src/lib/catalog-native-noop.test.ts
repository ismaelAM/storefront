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
const code = ts.transpileModule(
  source.statements
    .filter(
      (node) =>
        ts.isFunctionDeclaration(node) &&
        [
          "nativePatchMatches",
          "upsertBasePrice",
          "patchVariantInventory",
        ].includes(node.name?.text ?? ""),
    )
    .map((node) => node.getText(source))
    .join("\n"),
  {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  },
).outputText;
function fixture(prices: object[] = []) {
  const current = {
    id: "variant1",
    track_inventory: true,
    backorderable: true,
    preorderable: false,
    preorder_ships_at: null,
    total_on_hand: 6,
  };
  const request = vi.fn(
    async (
      _config: unknown,
      _method: unknown,
      _path: unknown,
      _body?: Record<string, unknown>,
    ) => ({ ...current }),
  );
  const run = runInNewContext(
    `${code}; ({ upsertBasePrice, patchVariantInventory, matches: typeof nativePatchMatches === 'function' ? nativePatchMatches : () => false })`,
    {
      spreeRequest: request,
      spreeList: async () => prices,
      defaultStockLocationId: async () => "location1",
      setVariantBackorderability: async () => 0,
    },
  );
  return { run, request, current };
}

describe("native synchronization skips only verified no-op writes", () => {
  it("accepts equivalent native decimal values and preorder timestamps", () => {
    const { run } = fixture();
    expect(
      run.matches(
        {
          cost_price: "10.90",
          weight: 1.5,
          preorder_ships_at: "2026-11-01T00:00:00.000Z",
        },
        { cost_price: 10.9, weight: 1.5, preorder_ships_at: "2026-11-01" },
      ),
    ).toBe(true);
  });
  it.each([
    [{}, { preorderable: false }],
    [{ preorderable: "false" }, { preorderable: false }],
    [{ cost_price: null }, { cost_price: 0 }],
    [{ cost_price: " " }, { cost_price: 0 }],
    [{ cost_price: false }, { cost_price: 0 }],
    [{ cost_price: "NaN" }, { cost_price: 0 }],
    [{ preorder_ships_at: "invalid" }, { preorder_ships_at: "invalid" }],
    [{ preorder_ships_at: "2026-11-02" }, { preorder_ships_at: "2026-11-01" }],
  ])("requires a native write for missing, invalid or changed data", (current, patch) => {
    expect(fixture().run.matches(current, patch)).toBe(false);
  });
  it("does not rewrite an identical base price", async () => {
    const f = fixture([
      { id: "price1", amount: "16.50", currency: "EUR", price_list_id: null },
    ]);
    await f.run.upsertBasePrice({}, "variant1", 16.5);
    expect(f.request).not.toHaveBeenCalled();
  });
  it("still creates a missing base price instead of mistaking a promotional price for it", async () => {
    const f = fixture([
      {
        id: "promotion",
        amount: "16.50",
        currency: "EUR",
        price_list_id: "sale1",
      },
    ]);
    await f.run.upsertBasePrice({}, "variant1", 16.5);
    expect(f.request).toHaveBeenCalledWith({}, "POST", "/prices", {
      variant_id: "variant1",
      currency: "EUR",
      amount: 16.5,
    });
  });
  it("writes a changed amount or an explicit comparison-price removal", async () => {
    const f = fixture([
      {
        id: "price1",
        amount: "16.50",
        compare_at_amount: "18.50",
        currency: "EUR",
        price_list_id: null,
      },
    ]);
    await f.run.upsertBasePrice({}, "variant1", 17);
    await f.run.upsertBasePrice({}, "variant1", 16.5, null);
    expect(f.request).toHaveBeenCalledWith({}, "PATCH", "/prices/price1", {
      amount: 17,
    });
    expect(f.request).toHaveBeenCalledWith({}, "PATCH", "/prices/price1", {
      amount: 16.5,
      compare_at_amount: null,
    });
  });
  it("does not rewrite matching fulfillment flags after a fresh native read", async () => {
    const f = fixture();
    expect(
      await f.run.patchVariantInventory(
        {},
        "prod1",
        "variant1",
        6,
        true,
        false,
        null,
        false,
        f.current,
      ),
    ).toEqual(f.current);
    expect(f.request).not.toHaveBeenCalled();
  });
  it("still writes when the identity differs or initialization was requested", async () => {
    const f = fixture();
    await f.run.patchVariantInventory(
      {},
      "prod1",
      "variant1",
      6,
      true,
      false,
      null,
      false,
      { ...f.current, id: "other" },
    );
    await f.run.patchVariantInventory(
      {},
      "prod1",
      "variant1",
      0,
      true,
      false,
      null,
      true,
      f.current,
    );
    expect(f.request).toHaveBeenCalledTimes(2);
    expect(f.request.mock.calls[1]?.[3]).toEqual(
      expect.objectContaining({
        stock_levels: [expect.objectContaining({ count_on_hand: 0 })],
      }),
    );
  });
  it("propagates write failure to the existing retry/checkpoint handling", async () => {
    const f = fixture([
      { id: "price1", amount: "16.50", currency: "EUR", price_list_id: null },
    ]);
    f.request.mockRejectedValueOnce(new Error("native unavailable"));
    await expect(f.run.upsertBasePrice({}, "variant1", 17)).rejects.toThrow(
      "native unavailable",
    );
  });
});
