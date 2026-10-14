import { describe, expect, it } from "vitest";
import { canCompleteOrder, isOrderCompleted } from "./order-completion";

const paidOrder = {
  completed_at: "2026-10-13T21:31:00Z",
  payment_status: "paid",
  amount_due: "0.00",
  fulfillments: [{ status: "shipped" }],
};

describe("manual order completion", () => {
  it("keeps a dispatched order open until the merchant explicitly completes it", () => {
    expect(isOrderCompleted(paidOrder)).toBe(false);
    expect(isOrderCompleted({ ...paidOrder, manually_completed: true })).toBe(true);
    expect(isOrderCompleted({ ...paidOrder, manually_completed: false })).toBe(false);
  });

  it.each([
    { payment_status: "balance_due" },
    { amount_due: "1.00" },
    { amount_due: null },
    { completed_at: null },
    { status: "canceled" },
    { fulfillments: [] },
    { fulfillments: [{ status: "canceled" }] },
    { fulfillments: [{ status: "shipped" }, { status: "pending" }] },
    { fulfillments: [{ status: "ready" }] },
    { fulfillments: [{ status: "backorder" }] },
  ])("does not complete an ineligible order: %j", (change) => {
    const order = { ...paidOrder, ...change, manually_completed: true };
    expect(canCompleteOrder(order)).toBe(false);
    expect(isOrderCompleted(order)).toBe(false);
  });

  it("ignores canceled parcels when the remaining parcels have been fulfilled", () => {
    expect(canCompleteOrder({ ...paidOrder, fulfillments: [
      { status: "canceled" }, { status: "shipped" }, { status: "delivered" },
    ] })).toBe(true);
  });
});
