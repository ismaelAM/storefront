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
const body =
  source.statements
    .find(
      (node) =>
        ts.isFunctionDeclaration(node) &&
        node.name?.text === "syncHomePreorderMembership",
    )
    ?.getText(source) ?? "async function syncHomePreorderMembership() {}";
const code = ts.transpileModule(body, {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText;
function fixture() {
  const request = vi.fn();
  const sync = runInNewContext(`${code}; syncHomePreorderMembership`, {
    spreeRequest: request,
  });
  return { request, sync };
}
describe("native preorder publication for the existing home selection", () => {
  it("includes a ready supplier preorder without requiring a Devir supplier tag", async () => {
    const f = fixture();
    await f.sync(
      {},
      {
        id: "prod_1",
        status: "active",
        preorder: true,
        purchasable: true,
        tags: ["catalog-ready", "offer-date:2026-10-26"],
      },
    );
    expect(f.request).toHaveBeenCalledWith({}, "PATCH", "/products/prod_1", {
      tags: ["catalog-ready", "offer-date:2026-10-26", "devir-preorder"],
    });
  });
  it.each([
    { status: "draft", preorder: true },
    { status: "active", preorder: false },
    { status: "active", preorder: true, purchasable: false },
    {
      status: "active",
      preorder: true,
      tags: ["catalog-review", "devir-preorder"],
    },
  ])("removes membership when native eligibility ends: %j", async (state) => {
    const f = fixture();
    await f.sync(
      {},
      {
        id: "prod_1",
        purchasable: true,
        tags: ["catalog-ready", "devir-preorder"],
        ...state,
      },
    );
    expect(f.request).toHaveBeenCalledWith({}, "PATCH", "/products/prod_1", {
      tags: (state.tags ?? ["catalog-ready"]).filter(
        (tag) => tag !== "devir-preorder",
      ),
    });
  });
  it("preserves mixed-product membership when Spree reports any sellable preorder, with no redundant write", async () => {
    const f = fixture();
    await f.sync(
      {},
      {
        id: "prod_1",
        status: "active",
        preorder: true,
        purchasable: true,
        tags: ["devir-preorder", "daily-offer"],
      },
    );
    expect(f.request).not.toHaveBeenCalled();
  });
});
