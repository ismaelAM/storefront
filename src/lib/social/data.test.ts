import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  build: vi.fn(),
  state: {
    day_key: "2026-11-07",
    active_products: Array.from({ length: 12 }, (_, i) => ({
      productId: `p${i}`,
    })),
  },
}));
vi.mock("@/lib/spree/config", () => ({
  getClient: () => ({ products: { get: mocks.get } }),
}));
vi.mock("./offers", () => ({ buildSocialOffers: mocks.build }));
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

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});
describe("fresh publication catalogue reads", () => {
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
