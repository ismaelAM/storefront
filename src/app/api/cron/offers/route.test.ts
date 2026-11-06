import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/social/publication", () => ({
  runDailySocialPublication: vi.fn(async () => ({ status: "prepared" })),
}));

import { runDailySocialPublication } from "@/lib/social/publication";
import { GET } from "./route";

afterEach(() => {
  vi.useRealTimers();
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
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-07T04:01:00Z"));
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
  it.each([
    "2026-11-07T03:01:00Z",
    "2026-07-07T04:01:00Z",
  ])("skips the unused DST slot without touching the catalogue: %s", async (now) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(now));
    vi.stubEnv("CRON_SECRET", "internal-secret");
    const result = await GET(
      new Request("https://www.bisontcg.com/api/cron/offers", {
        headers: { authorization: "Bearer internal-secret" },
      }),
    );
    expect(await result.json()).toMatchObject({ status: "outside_window" });
    expect(runDailySocialPublication).not.toHaveBeenCalled();
  });
  it("uses the summer slot at 05:01 Madrid", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-07T03:01:00Z"));
    vi.stubEnv("CRON_SECRET", "internal-secret");
    await GET(
      new Request("https://www.bisontcg.com/api/cron/offers", {
        headers: { authorization: "Bearer internal-secret" },
      }),
    );
    expect(runDailySocialPublication).toHaveBeenCalledOnce();
  });
  it("retains later recovery when the 05h attempts could not finish", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-07T08:15:00Z"));
    vi.stubEnv("CRON_SECRET", "internal-secret");
    await GET(
      new Request("https://www.bisontcg.com/api/cron/offers", {
        headers: { authorization: "Bearer internal-secret" },
      }),
    );
    expect(runDailySocialPublication).toHaveBeenCalledOnce();
  });
});
