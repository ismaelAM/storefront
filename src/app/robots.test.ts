import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/store", () => ({ getStoreUrl: () => "https://store.example" }));
vi.mock("./sitemap", () => ({
  generateSitemaps: async () => [{ id: 0 }, { id: 1 }],
}));

import robots from "./robots";

describe("crawler access", () => {
  it("lets crawlers read noindex on public account, cart and checkout pages", async () => {
    const result = await robots();
    const rules = result.rules as Array<{
      userAgent: string;
      disallow?: string[];
    }>;
    const disallowed =
      rules.find(({ userAgent }) => userAgent === "*")?.disallow ?? [];
    expect(
      disallowed.some((path) =>
        /account|cart|checkout|order-placed|confirm-payment/.test(path),
      ),
    ).toBe(false);
    expect(result.sitemap).toEqual([
      "https://store.example/sitemap/0.xml",
      "https://store.example/sitemap/1.xml",
    ]);
    expect(disallowed).toContain("/*?*filter*=*");
  });
});
