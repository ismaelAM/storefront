// @vitest-environment node
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";

const source = ts.createSourceFile(
  "worker.ts",
  readFileSync("supabase/functions/devir-sync/index.ts", "utf8"),
  ts.ScriptTarget.Latest,
  true,
);
const code = ts.transpileModule(
  source.statements
    .filter(
      (node) =>
        ts.isFunctionDeclaration(node) &&
        node.name?.text === "acquireDailyOfferRotationLock",
    )
    .map((node) => node.getText(source))
    .join("\n"),
  { compilerOptions: { target: ts.ScriptTarget.ES2022 } },
).outputText;
function fixture(data: string | null, error: Error | null = null) {
  const rpc = vi.fn(async () => ({ data, error }));
  const acquire = runInNewContext(`${code}; acquireDailyOfferRotationLock`, {
    crypto: { randomUUID: () => "lease-token" },
    supabase: { rpc },
  });
  return { acquire, rpc };
}
describe("shared rotation/publication lock", () => {
  it("uses the database claim that serializes rotation with active social leases", async () => {
    const f = fixture("lease-token");
    expect(await f.acquire()).toBe("lease-token");
    expect(f.rpc).toHaveBeenCalledExactlyOnceWith(
      "acquire_daily_offer_rotation",
      { p_token: "lease-token" },
    );
  });
  it("does not acquire a lock when the publication owns or already sent the offer day", async () => {
    expect(await fixture(null).acquire()).toBeNull();
  });
  it("fails closed on a database error", async () => {
    const error = new Error("database unavailable");
    await expect(fixture(null, error).acquire()).rejects.toBe(error);
  });
});
