import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  cart: vi.fn(),
  intent: vi.fn(),
  authorize: vi.fn(),
  reconcile: vi.fn(),
}));
vi.mock("@/lib/data/checkout", () => ({ getCheckoutOrder: mocks.cart }));
vi.mock("@/lib/payments/stripe-live", () => ({
  getStripePaymentIntent: mocks.intent,
  placeAuthorizedStripePaymentInSpree: mocks.authorize,
  reconcileStripePaymentToSpree: mocks.reconcile,
  createOrUpdateStripePaymentIntent: vi.fn(),
}));
import { finalizeStripeLivePayment } from "../stripe-live";

beforeEach(() => vi.resetAllMocks());

it("allows the owning customer to confirm after the webhook has settled the balance", async () => {
  mocks.cart.mockResolvedValue({ id: "cart-1", amount_due: "0.00", total: "100.00", currency: "EUR" });
  mocks.intent.mockResolvedValue({ id: "pi_paid", status: "succeeded", amount: 7000, currency: "eur", metadata: { spree_cart_id: "cart-1" } });
  mocks.reconcile.mockResolvedValue({ id: "cart-1", status: "complete" });
  expect(await finalizeStripeLivePayment("cart-1", "pi_paid")).toEqual({ success: true, order: { id: "cart-1", status: "complete" } });
});

it("rejects a payment belonging to another cart before admin reconciliation", async () => {
  mocks.cart.mockResolvedValue({ id: "cart-1", currency: "EUR" });
  mocks.intent.mockResolvedValue({ metadata: { spree_cart_id: "cart-2" } });
  expect((await finalizeStripeLivePayment("cart-1", "pi_other")).success).toBe(false);
  expect(mocks.reconcile).not.toHaveBeenCalled();
});


it("places a manually authorized payment without reconciling it as captured", async () => {
  const authorizedIntent = {
    id: "pi_authorized",
    status: "requires_capture",
    amount: 60000,
    currency: "eur",
    metadata: {
      spree_cart_id: "cart-1",
      manual_review: "true",
    },
  };
  mocks.cart.mockResolvedValue({
    id: "cart-1",
    amount_due: "600.00",
    total: "600.00",
    currency: "EUR",
  });
  mocks.intent.mockResolvedValue(authorizedIntent);
  mocks.authorize.mockResolvedValue({
    id: "cart-1",
    status: "complete",
  });

  expect(
    await finalizeStripeLivePayment("cart-1", authorizedIntent.id),
  ).toEqual({
    success: true,
    order: { id: "cart-1", status: "complete" },
  });
  expect(mocks.authorize).toHaveBeenCalledWith(authorizedIntent);
  expect(mocks.reconcile).not.toHaveBeenCalled();
});
