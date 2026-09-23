import { beforeEach, describe, expect, it, vi } from "vitest";

const mockClient = {
  orders: { get: vi.fn() },
  carts: {
    get: vi.fn(),
    list: vi.fn(),
    complete: vi.fn(),
    paymentSessions: {
      create: vi.fn(),
      complete: vi.fn(),
    },
  },
};

vi.mock("@/lib/spree", () => ({
  getClient: () => mockClient,
  getClientForSurface: () => mockClient,
  cacheTagSuffix: () => "",
  DEFAULT_SURFACE: "dtc",
  isWholesaleEnabled: vi.fn().mockReturnValue(false),
  getCartToken: vi.fn().mockResolvedValue("order-token-123"),
  getCartId: vi.fn().mockResolvedValue("cart-1"),
  getAccessToken: vi.fn().mockResolvedValue(undefined),
  setCartCookies: vi.fn(),
  clearCartCookies: vi.fn(),
  getCartOptions: vi.fn().mockResolvedValue({
    spreeToken: "order-token-123",
    token: undefined,
  }),
  requireCartId: vi.fn().mockResolvedValue("cart-1"),
}));

vi.mock("next/cache", () => ({
  updateTag: vi.fn(),
}));

import {
  completeCheckoutOrder,
  completeCheckoutPaymentSession,
  confirmPaymentAndCompleteCart,
  createCheckoutPaymentSession,
} from "@/lib/data/payment";

const mockSession = {
  id: "session-1",
  status: "pending",
  external_data: { client_secret: "pi_secret_123" },
};

const mockOrder = {
  id: "cart-1",
  number: "R100",
  current_step: "complete",
  completed_at: "2026-09-23T00:00:00Z",
};

describe("payment server actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockClient.orders.get.mockResolvedValue(null);
  });

  describe("createCheckoutPaymentSession", () => {
    it("creates a session for the requested checkout when the cookie points elsewhere", async () => {
      mockClient.carts.paymentSessions.create.mockResolvedValueOnce(mockSession);
      await createCheckoutPaymentSession("cart-previous", "pm-1");
      expect(mockClient.carts.paymentSessions.create).toHaveBeenCalledWith("cart-previous", { payment_method_id: "pm-1" }, expect.any(Object));
    });

    it("returns success with session", async () => {
      mockClient.carts.paymentSessions.create.mockResolvedValue(mockSession);

      const result = await createCheckoutPaymentSession("cart-1", "pm-1");

      expect(mockClient.carts.paymentSessions.create).toHaveBeenCalledWith(
        "cart-1",
        { payment_method_id: "pm-1" },
        { spreeToken: "order-token-123", token: undefined },
      );
      expect(result).toEqual({ success: true, session: mockSession });
    });

    it("passes external_data when provided", async () => {
      mockClient.carts.paymentSessions.create.mockResolvedValue(mockSession);

      await createCheckoutPaymentSession("cart-1", "pm-1", {
        stripe_payment_method_id: "spm_123",
      });

      expect(mockClient.carts.paymentSessions.create).toHaveBeenCalledWith(
        "cart-1",
        {
          payment_method_id: "pm-1",
          external_data: { stripe_payment_method_id: "spm_123" },
        },
        { spreeToken: "order-token-123", token: undefined },
      );
    });

    it("returns error on failure", async () => {
      mockClient.carts.paymentSessions.create.mockRejectedValue(
        new Error("Gateway unavailable"),
      );

      const result = await createCheckoutPaymentSession("cart-1", "pm-1");

      expect(result).toEqual({
        success: false,
        error: "Gateway unavailable",
      });
    });
  });

  describe("completeCheckoutPaymentSession", () => {
    it("returns success with session", async () => {
      const completedSession = { ...mockSession, status: "completed" };
      mockClient.carts.paymentSessions.complete.mockResolvedValue(
        completedSession,
      );

      const result = await completeCheckoutPaymentSession(
        "cart-1",
        "session-1",
      );

      expect(mockClient.carts.paymentSessions.complete).toHaveBeenCalledWith(
        "cart-1",
        "session-1",
        undefined,
        { spreeToken: "order-token-123", token: undefined },
      );
      expect(result).toEqual({ success: true, session: completedSession });
    });

    it("returns error on failure", async () => {
      mockClient.carts.paymentSessions.complete.mockRejectedValue(
        new Error("Session expired"),
      );

      const result = await completeCheckoutPaymentSession(
        "cart-1",
        "session-1",
      );

      expect(result).toEqual({ success: false, error: "Session expired" });
    });
  });

  describe("completeCheckoutOrder", () => {
    it("returns success with order", async () => {
      mockClient.carts.complete.mockResolvedValue(mockOrder);

      const result = await completeCheckoutOrder("cart-1");

      expect(mockClient.carts.complete).toHaveBeenCalledWith("cart-1", {
        spreeToken: "order-token-123",
        token: undefined,
      });
      expect(result).toEqual({ success: true, order: mockOrder });
    });

    it("does not report a forbidden checkout as completed without an order", async () => {
      const spreeError = Object.assign(new Error("Not authorized"), {
        status: 403,
      });
      mockClient.carts.complete.mockRejectedValue(spreeError);

      const result = await completeCheckoutOrder("cart-1");

      expect(result).toEqual({ success: false, error: "Not authorized" });
    });

    it("does not report a validation failure as completed without an order", async () => {
      const spreeError = Object.assign(new Error("Unprocessable Content"), {
        status: 422,
      });
      mockClient.carts.complete.mockRejectedValue(spreeError);

      const result = await completeCheckoutOrder("cart-1");

      expect(result).toEqual({ success: false, error: "Unprocessable Content" });
    });

    it.each([403, 409, 422])("recovers a concurrently completed order after HTTP %s", async (status) => {
      mockClient.carts.complete.mockRejectedValue(Object.assign(new Error("Conflict"), { status }));
      mockClient.orders.get.mockResolvedValue(mockOrder);
      expect(await completeCheckoutOrder("cart-1")).toEqual({ success: true, order: mockOrder });
    });

    it("rejects an order that is still in checkout", async () => {
      mockClient.carts.complete.mockRejectedValue(Object.assign(new Error("Payment required"), { status: 422 }));
      mockClient.orders.get.mockResolvedValue({ id: "cart-1", completed_at: null });
      expect(await completeCheckoutOrder("cart-1")).toEqual({ success: false, error: "Payment required" });
    });

    it("returns error on non-403 failure", async () => {
      mockClient.carts.complete.mockRejectedValue(
        new Error("Payment required"),
      );

      const result = await completeCheckoutOrder("cart-1");

      expect(result).toEqual({ success: false, error: "Payment required" });
    });

    it("returns fallback message for non-Error throws", async () => {
      mockClient.carts.complete.mockRejectedValue("unexpected");

      const result = await completeCheckoutOrder("cart-1");

      expect(result).toEqual({
        success: false,
        error: "Failed to complete order",
      });
    });
  });

  describe("confirmPaymentAndCompleteCart", () => {
    it("confirms the returning checkout's session when another cart is in the cookie", async () => {
      mockClient.carts.get.mockResolvedValueOnce({ id: "cart-previous", current_step: "payment" });
      mockClient.carts.paymentSessions.complete.mockResolvedValueOnce({ status: "completed" });
      mockClient.carts.complete.mockResolvedValueOnce({ ...mockOrder, id: "cart-previous" });
      expect((await confirmPaymentAndCompleteCart("cart-previous", "session-old")).success).toBe(true);
      expect(mockClient.carts.paymentSessions.complete).toHaveBeenCalledWith("cart-previous", "session-old", undefined, expect.any(Object));
    });

    it("passes cartId to getCart for explicit lookup", async () => {
      mockClient.carts.get.mockResolvedValue({
        id: "cart-1",
        current_step: "complete",
      });

      await confirmPaymentAndCompleteCart("cart-1", "session-1");

      expect(mockClient.carts.get).toHaveBeenCalledWith("cart-1", {
        spreeToken: "order-token-123",
        token: undefined,
      });
    });

    it("succeeds when cart is already complete", async () => {
      mockClient.carts.get.mockResolvedValue({
        id: "cart-1",
        current_step: "complete",
      });

      const result = await confirmPaymentAndCompleteCart("cart-1", "session-1");

      expect(result).toEqual({
        success: true,
        order: { id: "cart-1", current_step: "complete" },
      });
      expect(mockClient.carts.paymentSessions.complete).not.toHaveBeenCalled();
      expect(mockClient.carts.complete).not.toHaveBeenCalled();
    });

    it("completes payment session then completes the order", async () => {
      mockClient.carts.get.mockResolvedValue({
        id: "cart-1",
        current_step: "payment",
      });
      mockClient.carts.paymentSessions.complete.mockResolvedValue({
        id: "session-1",
        status: "completed",
      });
      mockClient.carts.complete.mockResolvedValue(mockOrder);

      const result = await confirmPaymentAndCompleteCart("cart-1", "session-1");

      expect(mockClient.carts.paymentSessions.complete).toHaveBeenCalled();
      expect(mockClient.carts.complete).toHaveBeenCalledWith("cart-1", {
        spreeToken: "order-token-123",
        token: undefined,
      });
      expect(result).toEqual({ success: true, order: mockOrder });
    });

    it("returns error when payment session fails", async () => {
      mockClient.carts.get.mockResolvedValue({
        id: "cart-1",
        current_step: "payment",
      });
      mockClient.carts.paymentSessions.complete.mockResolvedValue({
        id: "session-1",
        status: "failed",
      });

      const result = await confirmPaymentAndCompleteCart("cart-1", "session-1");

      expect(result).toEqual({
        success: false,
        error: "Payment was not successful. Please try again.",
      });
      expect(mockClient.carts.complete).not.toHaveBeenCalled();
    });

    it("skips session completion when no session ID provided", async () => {
      mockClient.carts.get.mockResolvedValue({
        id: "cart-1",
        current_step: "payment",
      });
      mockClient.carts.complete.mockResolvedValue(mockOrder);

      const result = await confirmPaymentAndCompleteCart("cart-1");

      expect(mockClient.carts.paymentSessions.complete).not.toHaveBeenCalled();
      expect(mockClient.carts.complete).toHaveBeenCalledWith("cart-1", {
        spreeToken: "order-token-123",
        token: undefined,
      });
      expect(result).toEqual({ success: true, order: mockOrder });
    });

    it("returns an error when neither cart nor completed order can be verified", async () => {
      mockClient.carts.get.mockRejectedValue(new Error("Not found"));

      const result = await confirmPaymentAndCompleteCart("cart-1", "session-1");

      expect(mockClient.carts.complete).not.toHaveBeenCalled();
      expect(result.success).toBe(false);
    });

    it("returns error when complete throws non-403 error", async () => {
      mockClient.carts.get.mockResolvedValue({
        id: "cart-1",
        current_step: "payment",
      });
      mockClient.carts.complete.mockRejectedValue(
        new Error("Order cannot be completed"),
      );

      const result = await confirmPaymentAndCompleteCart("cart-1");

      expect(result).toEqual({
        success: false,
        error: "Order cannot be completed",
      });
    });

    it("preserves a 403 from completion when no completed order exists", async () => {
      mockClient.carts.get.mockResolvedValue({
        id: "cart-1",
        current_step: "payment",
      });
      const spreeError = Object.assign(new Error("Not authorized"), {
        status: 403,
      });
      mockClient.carts.complete.mockRejectedValue(spreeError);

      const result = await confirmPaymentAndCompleteCart("cart-1");

      expect(result).toEqual({ success: false, error: "Not authorized" });
    });

    it("does not turn an unavailable cart into a successful purchase", async () => {
      mockClient.carts.get.mockRejectedValue("unexpected");

      const result = await confirmPaymentAndCompleteCart("cart-1");

      expect(result.success).toBe(false);
    });

    it("recovers a verified order completed by the webhook", async () => {
      mockClient.carts.get.mockRejectedValue(Object.assign(new Error("Cart completed"), { status: 404 }));
      mockClient.orders.get.mockResolvedValue(mockOrder);
      expect(await confirmPaymentAndCompleteCart("cart-1")).toEqual({ success: true, order: mockOrder });
    });
  });
});
