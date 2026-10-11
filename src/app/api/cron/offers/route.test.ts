import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/social/publication", () => ({
  runDailySocialPublication: vi.fn(async () => ({ status: "prepared" })),
}));

import { runDailySocialPublication } from "@/lib/social/publication";
import { GET } from "./route";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});
describe("secured daily offer cron", () => {
  it("does not prepare without an exact server cron secret", async () => {
    vi.stubEnv("CRON_SECRET", "internal-secret");
    const cases: Record<string, string>[] = [
      {},
      { authorization: "Bearer wrong" },
      { cookie: "bison_shipping_ops=forged" },
    ];
    for (const headers of cases) {
      expect(
        (
          await GET(
            new Request("https://www.bisontcg.com/api/cron/offers", {
              headers,
            }),
          )
        ).status,
      ).toBe(401);
    }
    expect(runDailySocialPublication).not.toHaveBeenCalled();
  });
  it("prepares daily images with the configured bearer and disables caching", async () => {
    vi.stubEnv("CRON_SECRET", "internal-secret");
    const result = await GET(
      new Request("https://www.bisontcg.com/api/cron/offers", {
        headers: { authorization: "Bearer internal-secret" },
      }),
    );
    expect(result.status).toBe(200);
    expect(await result.json()).toEqual({ status: "prepared" });
    expect(result.headers.get("Cache-Control")).toBe("no-store");
  });
});
