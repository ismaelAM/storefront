import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  build: vi.fn(),
  state: {
    day_key: "2026-11-07",
    spree_price_list_id: "pl_today",
    last_rotated_at: "2026-11-07T04:00:40Z" as string | null,
    last_error: null as string | null,
    active_products: Array.from({ length: 12 }, (_, i) => ({
      productId: `p${i}`,
    })),
  },
}));
vi.mock("@/lib/spree/config", () => ({
  getClient: () => ({ products: { get: mocks.get } }),
}));
vi.mock("./offers", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./offers")>()),
  buildSocialOffers: mocks.build,
}));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: mocks.state }) }),
        in: async () => ({ data: [] }),
      }),
    }),
  }),
}));

import { getDailySocialOffers } from "./data";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-07T12:00:00Z"));
  mocks.state.day_key = "2026-11-07";
  mocks.state.last_rotated_at = "2026-11-07T04:00:40Z";
  mocks.state.last_error = null;
});
afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});
describe("fresh publication catalogue reads", () => {
  it.each([
    "stale",
    "pending",
    "failed",
  ])("avoids backend reads when the daily rotation is %s", async (status) => {
    if (status === "stale") mocks.state.day_key = "2026-11-06";
    if (status === "pending") mocks.state.last_rotated_at = null;
    if (status === "failed") mocks.state.last_error = "rotation unavailable";
    await expect(getDailySocialOffers()).rejects.toThrow("rotación");
    expect(mocks.get).not.toHaveBeenCalled();
    expect(mocks.build).not.toHaveBeenCalled();
  });
  it("bounds simultaneous Spree reads to two while retaining all twelve offers", async () => {
    vi.useFakeTimers();
    let active = 0;
    let peak = 0;
    mocks.get.mockImplementation(async (id) => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 10));
      active--;
      return { id };
    });
    const result = getDailySocialOffers();
    await vi.runAllTimersAsync();
    await result;
    expect(peak).toBeLessThanOrEqual(2);
    expect(mocks.build.mock.calls[0][1]).toHaveLength(12);
    expect(mocks.get).toHaveBeenCalledWith("p0", expect.anything(), {
      country: "es",
      locale: "es",
    });
  });
  it("does not turn an unavailable backend into an incomplete offer selection", async () => {
    mocks.get.mockRejectedValue(new Error("upstream unavailable"));
    await expect(getDailySocialOffers()).rejects.toThrow("catálogo");
    expect(mocks.build).not.toHaveBeenCalled();
  });
});
