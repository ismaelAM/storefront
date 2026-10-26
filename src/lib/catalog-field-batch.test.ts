// @vitest-environment node
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { describe, expect, it } from "vitest";
const source = ts.createSourceFile(
  "index.ts",
  readFileSync("supabase/functions/devir-sync/index.ts", "utf8"),
  ts.ScriptTarget.Latest,
  true,
);
const body = source.statements
  .find(
    (n) =>
      ts.isFunctionDeclaration(n) && n.name?.text === "upsertProductFields",
  )!
  .getText(source);
const code = ts.transpileModule(body, {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText;
const config = { spree_api_url: "https://project-7ck7q.vercel.app" };
function fixture(fail = false) {
  const stored = new Map<string, unknown>([["manual", "keep"]]);
  let writes = 0;
  const apply = (entry: {
    id?: string;
    custom_field_definition_id?: string;
    value: unknown;
  }) => stored.set(entry.id ?? entry.custom_field_definition_id!, entry.value);
  const write = async (
    _config: object,
    method: string,
    path: string,
    payload: {
      custom_fields?: Array<{
        id?: string;
        custom_field_definition_id?: string;
        value: unknown;
      }>;
      value?: unknown;
      custom_field_definition_id?: string;
    },
  ) => {
    if (fail) throw Error("native validation failed");
    if (++writes > 2)
      throw Error("request budget exhausted before inventory reconciliation");
    if (path === "/products/prod_1" && method === "PATCH") {
      payload.custom_fields!.forEach(apply);
      return {};
    }
    const id = path.split("/").at(-1)!;
    apply({
      id: method === "PATCH" ? id : undefined,
      custom_field_definition_id: payload.custom_field_definition_id,
      value: payload.value,
    });
    return { id: payload.custom_field_definition_id };
  };
  const sync = runInNewContext(`${code}; upsertProductFields`, {
    spreeRequest: write,
    productFields: async () => [],
  });
  return { sync, stored, writes: () => writes };
}
describe("private catalog metadata within the inventory request budget", () => {
  it("persists a complete product's metadata without spending the inventory budget on individual fields", async () => {
    const f = fixture();
    const defs = new Map(
      Array.from({ length: 25 }, (_, i) => [
        `catalog.field_${i}`,
        { id: `def_${i}` },
      ]),
    );
    const values = Object.fromEntries(
      Array.from({ length: 25 }, (_, i) => [
        `catalog.field_${i}`,
        `value-${i}`,
      ]),
    );
    await f.sync(config, "prod_1", defs, values, []);
    expect(f.stored.size).toBe(26);
    expect(f.stored.get("def_24")).toBe("value-24");
    expect(f.stored.get("manual")).toBe("keep");
    expect(f.writes()).toBe(1);
  });
  it("keeps false and zero values, skips unchanged or unknown fields and preserves manual metadata", async () => {
    const f = fixture();
    const defs = new Map([
      ["catalog.enabled", { id: "def_enabled" }],
      ["catalog.quantity", { id: "def_quantity" }],
      ["catalog.same", { id: "def_same" }],
    ]);
    await f.sync(
      config,
      "prod_1",
      defs,
      {
        "catalog.enabled": false,
        "catalog.quantity": 0,
        "catalog.same": "kept",
        "catalog.unknown": "ignore",
      },
      [{ id: "cf_same", key: "catalog.same", value: "kept" }],
    );
    expect([...f.stored.entries()]).toEqual([
      ["manual", "keep"],
      ["def_enabled", false],
      ["def_quantity", 0],
    ]);
  });
  it("propagates native validation failures without reporting metadata success", async () => {
    const f = fixture(true);
    await expect(
      f.sync(
        config,
        "prod_1",
        new Map([["catalog.enabled", { id: "def_enabled" }]]),
        { "catalog.enabled": true },
        [],
      ),
    ).rejects.toThrow("native validation failed");
    expect(f.stored.size).toBe(1);
  });
});
