import { beforeEach, describe, expect, it, vi } from "vitest";

const sdk = vi.hoisted(() => ({ get: vi.fn(), list: vi.fn() }));
vi.mock("@/lib/spree", () => ({
  DEFAULT_SURFACE: "dtc",
  getCartOptions: async () => ({ spreeToken: "authorized-guest" }),
  getClient: () => ({ customer: { orders: { list: sdk.list } } }),
  getClientForSurface: () => ({ orders: { get: sdk.get } }),
  withAuthRefresh: async (fn: (options: object) => unknown) => fn({ token: "customer-jwt" }),
}));

import { getOrder, getOrders } from "../orders";
const order = { id: "or_1", number: "R123", payment_status: "paid", amount_due: "0.00", completed_at: "2026-10-13T21:31:00Z", fulfillments: [{ id: "ful_1", status: "shipped" }] };

describe("customer order completion reads", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("SPREE_API_URL", "https://shop.example.test");
    vi.stubEnv("SPREE_ADMIN_API_KEY", "sk_test_shipping");
    sdk.get.mockResolvedValue(order);
    sdk.list.mockResolvedValue({ data: [order], meta: { count: 1 } });
  });

  it("adds only the completion flag after Store API authorization", async () => {
    const fetcher = vi.fn(async () => Response.json({ data: [
      { key: "bisontcg.order_completed", field_type: "boolean", value: true },
      { key: "private.internal", value: "must-not-reach-customer" },
    ] }));
    vi.stubGlobal("fetch", fetcher);
    expect(await getOrder("or_1")).toEqual({ ...order, manually_completed: true });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("does not use Admin credentials to bypass a rejected customer order", async () => {
    sdk.get.mockRejectedValue(Object.assign(new Error("Forbidden"), { status: 403 }));
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await getOrder("or_1")).toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
    log.mockRestore();
  });

  it("keeps order history available if the optional Admin lookup fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({}, { status: 503 })));
    const result = await getOrders();
    expect(result).toMatchObject({ data: [order], meta: { count: 1 } });
  });

  it("does not add an Admin lookup to a newly completed checkout awaiting dispatch", async () => {
    const pending = { ...order, fulfillments: [{ id: "ful_1", status: "pending" }] };
    sdk.get.mockResolvedValue(pending);
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    expect(await getOrder("or_1")).toBe(pending);
    expect(fetcher).not.toHaveBeenCalled();
  });
});
