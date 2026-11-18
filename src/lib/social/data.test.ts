import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
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
  getClient: () => ({ products: { list: mocks.list } }),
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
    expect(mocks.list).not.toHaveBeenCalled();
    expect(mocks.build).not.toHaveBeenCalled();
  });
  it("reads precisely the twelve selected products in one fresh Spree request", async () => {
    const ids = mocks.state.active_products.map(({ productId }) => productId);
    const products = ids.map((id) => ({ id }));
    mocks.list.mockResolvedValue({ data: products });
    await getDailySocialOffers();
    expect(mocks.build.mock.calls[0][1]).toBe(products);
    expect(mocks.list).toHaveBeenCalledExactlyOnceWith({
      id_in: ids,
      limit: 12,
      expand: ["variants", "default_variant"],
      fields: ["id", "name", "slug", "purchasable", "tags", "default_variant_id", "thumbnail_url"],
    }, { country: "es", locale: "es", headers: { "Cache-Control": "no-cache" } });
  });

  it.each(["missing", "unexpected", "duplicate"])(
    "stops before publication if the response has a %s product", async (mismatch) => {
      const products = mocks.state.active_products.map(({ productId }) => ({ id: productId }));
      if (mismatch === "missing") products.pop();
      if (mismatch === "unexpected") products[0] = { id: "unknown" };
      if (mismatch === "duplicate") products[0] = products[1];
      mocks.list.mockResolvedValue({ data: products });
      await expect(getDailySocialOffers()).rejects.toThrow("catálogo");
      expect(mocks.build).not.toHaveBeenCalled();
    },
  );
  it("does not turn an unavailable backend into an incomplete offer selection", async () => {
    mocks.list.mockRejectedValue(new Error("upstream unavailable"));
    await expect(getDailySocialOffers()).rejects.toThrow("catálogo");
    expect(mocks.build).not.toHaveBeenCalled();
  });
});
