import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  createOrUpdateStripePaymentIntent,
  placeAuthorizedStripePaymentInSpree,
  reconcileStripePaymentToSpree,
} from "./stripe-live";

const intent = {
  id: "pi_paid",
  client_secret: null,
  status: "succeeded",
  amount: 7000,
  currency: "eur",
  metadata: { spree_cart_id: "cart-1" },
};

describe("Stripe reconciliation", () => {
  const fetchMock = vi.fn();
  let order: Record<string, unknown>;
  let payments: Array<Record<string, unknown>>;
  let writes: Array<{ url: string; options: RequestInit }>;

  beforeEach(() => {
    vi.stubEnv("SPREE_ADMIN_API_KEY", "sk_test_admin");
    vi.stubEnv("DEVIR_B2B_SPREE_ADMIN_API_KEY", "");
    vi.stubGlobal("fetch", fetchMock);
    order = { id: "cart-1", status: "cart", total: "100.00", amount_due: "70.00", currency: "EUR", metadata: {} };
    payments = [];
    writes = [];
    fetchMock.mockImplementation(async (url: string, options: RequestInit) => {
      if (options.method === "GET") {
        return Response.json(
          url.includes("/payments?") ? { data: payments } : order,
        );
      }

      writes.push({ url, options });
      const body = options.body ? JSON.parse(String(options.body)) : undefined;

      if (url.endsWith("/payments")) {
        const payment = { id: "py_paid", ...body, status: "checkout" };
        payments.push(payment);
        return Response.json(payment);
      }

      if (url.endsWith("/capture")) {
        const payment = payments.find((candidate) =>
          url.includes(`/payments/${candidate.id}/capture`),
        );
        if (payment) payment.status = "completed";
        order = { ...order, amount_due: "0.00" };
        return Response.json(payment ?? {});
      }

      if (url.endsWith("/complete")) {
        const paymentPending = body?.payment_pending === true;
        order = {
          ...order,
          status: "complete",
          amount_due: paymentPending ? order.amount_due : "0.00",
        };
        if (!paymentPending) {
          payments.forEach((payment) => {
            if (payment.status === "checkout") payment.status = "completed";
          });
        }
      } else if (url.endsWith("/cancel")) {
        order = { ...order, status: "canceled" };
        payments.forEach((payment) => {
          if (payment.status !== "completed") payment.status = "void";
        });
      } else {
        order = { ...order, ...body };
      }
      return Response.json(order);
    });
  });

  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

  it("keeps capture automatic at exactly 500 EUR", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_live_test");
    fetchMock.mockResolvedValueOnce(
      Response.json({
        id: "pi_500",
        client_secret: "secret",
        status: "requires_payment_method",
        amount: 50000,
        currency: "eur",
        metadata: { spree_cart_id: "cart-1", manual_review: "false" },
      }),
    );

    await createOrUpdateStripePaymentIntent({
      cartId: "cart-1",
      amount: 50000,
      currency: "EUR",
    });

    const request = fetchMock.mock.calls[0];
    const body = new URLSearchParams(String(request[1].body));
    expect(body.get("capture_method")).toBeNull();
    expect(body.get("metadata[manual_review]")).toBe("false");
    expect(new Headers(request[1].headers).get("Idempotency-Key")).toContain(
      "bisontcg:v3:",
    );
  });

  it("uses manual capture above 500 EUR", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_live_test");
    fetchMock.mockResolvedValueOnce(
      Response.json({
        id: "pi_501",
        client_secret: "secret",
        status: "requires_payment_method",
        amount: 50001,
        currency: "eur",
        metadata: { spree_cart_id: "cart-1", manual_review: "true" },
      }),
    );

    await createOrUpdateStripePaymentIntent({
      cartId: "cart-1",
      amount: 50001,
      currency: "EUR",
    });

    const body = new URLSearchParams(
      String(fetchMock.mock.calls[0][1].body),
    );
    expect(body.get("capture_method")).toBe("manual");
    expect(body.get("metadata[manual_review]")).toBe("true");
  });

  it("does not apply the EUR threshold to another currency", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_live_test");
    fetchMock.mockResolvedValueOnce(
      Response.json({
        id: "pi_usd",
        client_secret: "secret",
        status: "requires_payment_method",
        amount: 70000,
        currency: "usd",
        metadata: { spree_cart_id: "cart-1", manual_review: "false" },
      }),
    );

    await createOrUpdateStripePaymentIntent({
      cartId: "cart-1",
      amount: 70000,
      currency: "USD",
    });

    const body = new URLSearchParams(
      String(fetchMock.mock.calls[0][1].body),
    );
    expect(body.get("capture_method")).toBeNull();
  });

  it("places >500 EUR authorizations as payment-pending and settles Spree after capture", async () => {
    order = {
      id: "cart-1",
      status: "cart",
      total: "600.00",
      amount_due: "600.00",
      currency: "EUR",
      metadata: {},
    };
    const authorizedIntent = {
      id: "pi_authorized",
      client_secret: null,
      status: "requires_capture",
      amount: 60000,
      currency: "eur",
      metadata: {
        spree_cart_id: "cart-1",
        manual_review: "true",
      },
    };

    await expect(
      placeAuthorizedStripePaymentInSpree(authorizedIntent),
    ).resolves.toMatchObject({ status: "complete" });

    const pendingCompletion = writes.find((write) =>
      write.url.endsWith("/complete"),
    );
    expect(JSON.parse(String(pendingCompletion?.options.body))).toMatchObject({
      payment_pending: true,
    });
    expect(payments[0]).toMatchObject({ status: "checkout" });

    await expect(
      reconcileStripePaymentToSpree({
        ...authorizedIntent,
        status: "succeeded",
      }),
    ).resolves.toMatchObject({ status: "complete" });

    expect(
      writes.some((write) => write.url.endsWith("/payments/py_paid/capture")),
    ).toBe(true);
    expect(payments[0]).toMatchObject({ status: "completed" });
  });

  it("uses the order API configuration instead of a catalog-only Devir key", async () => {
    vi.stubEnv("DEVIR_B2B_SPREE_ADMIN_API_KEY", "sk_catalog_only");
    vi.stubEnv("SPREE_API_URL", "https://orders.spree.invalid");
    vi.stubEnv("DEVIR_B2B_SPREE_API_URL", "https://catalog.spree.invalid");
    const handler = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation(async (url: string, options: RequestInit) => {
      if (new Headers(options.headers).get("x-spree-api-key") !== "sk_test_admin") {
        return Response.json({ error: { code: "access_denied", message: "API key lacks scope: read_orders" } }, { status: 403 });
      }
      return handler(url, options);
    });
    await expect(reconcileStripePaymentToSpree(intent)).resolves.toMatchObject({ status: "complete" });
    expect(writes.every(write => write.url.startsWith("https://orders.spree.invalid/"))).toBe(true);
  });

  it("preserves the legacy fallback when no dedicated admin key is configured", async () => {
    vi.stubEnv("SPREE_ADMIN_API_KEY", "");
    vi.stubEnv("DEVIR_B2B_SPREE_ADMIN_API_KEY", "sk_legacy_full_access");
    await reconcileStripePaymentToSpree(intent);
    expect(new Headers(writes[0].options.headers).get("x-spree-api-key")).toBe("sk_legacy_full_access");
  });

  it("records only the remainder after a gift card and accepts a subsequent webhook replay", async () => {
    expect(await reconcileStripePaymentToSpree(intent)).toMatchObject({ status: "complete" });
    expect(await reconcileStripePaymentToSpree(intent)).toMatchObject({ status: "complete" });
    const creates = writes.filter(write => write.url.endsWith("/payments"));
    expect(creates).toHaveLength(1);
    expect(JSON.parse(String(creates[0].options.body)).amount).toBe("70.00");
    expect(new Headers(creates[0].options.headers).get("Idempotency-Key")).toBeTruthy();
  });

  it("does not mistake a failed payment for a recorded charge", async () => {
    order.total = "70.00";
    payments.push({ id: "py_failed", amount: "70.00", status: "failed", payment_method_id: "pm_8aKR0I7fEb" });
    await reconcileStripePaymentToSpree(intent);
    expect(writes.filter(write => write.url.endsWith("/payments"))).toHaveLength(1);
  });

  it("rejects a mismatched remaining amount without writing to Spree", async () => {
    await expect(reconcileStripePaymentToSpree({ ...intent, amount: 10000 })).rejects.toThrow("importe");
    expect(writes).toEqual([]);
  });

  it("rejects a second Stripe intent for an already reconciled order", async () => {
    order.total = "70.00";
    order.metadata = { stripe_payment_intent_id: "pi_other" };
    await expect(reconcileStripePaymentToSpree(intent)).rejects.toThrow();
    expect(writes).toEqual([]);
  });

  it("rejects an incorrect currency without creating a payment", async () => {
    await expect(reconcileStripePaymentToSpree({ ...intent, currency: "usd" })).rejects.toThrow("moneda");
    expect(writes).toEqual([]);
  });

  it("does not claim an unlinked external payment just because its amount matches", async () => {
    payments.push({ id: "py_unrelated", amount: "70.00", status: "checkout", payment_method_id: "pm_8aKR0I7fEb" });
    await expect(reconcileStripePaymentToSpree(intent)).rejects.toThrow("identificar");
    expect(writes).toEqual([]);
  });

  it("persists the exact Spree payment identity for future replays", async () => {
    await reconcileStripePaymentToSpree(intent);
    expect(order.metadata).toMatchObject({ stripe_payment_intent_id: intent.id, stripe_spree_payment_id: "py_paid" });
  });

  it("does not recreate a recorded charge that was subsequently voided", async () => {
    order.metadata = { stripe_payment_intent_id: intent.id, stripe_spree_payment_id: "py_void" };
    payments.push({ id: "py_void", amount: "70.00", status: "void", payment_method_id: "pm_8aKR0I7fEb" });
    await expect(reconcileStripePaymentToSpree(intent)).rejects.toThrow();
    expect(writes).toEqual([]);
  });

  it("rejects cancelled orders before recording any payment", async () => {
    order.status = "canceled";
    await expect(reconcileStripePaymentToSpree(intent)).rejects.toThrow();
    expect(writes).toEqual([]);
  });
});
