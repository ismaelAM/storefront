import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ intent: vi.fn(), reconcile: vi.fn() }));
vi.mock("@/lib/payments/stripe-live", () => ({
  getStripePaymentIntent: mocks.intent,
  reconcileStripePaymentToSpree: mocks.reconcile,
}));
import { POST } from "./route";

const secret = "whsec_local_test_only";
const event = { type: "payment_intent.succeeded", data: { object: { id: "pi_test" } } };

function signedRequest(body = JSON.stringify(event), ageSeconds = 0) {
  const timestamp = Math.floor(Date.now() / 1000) - ageSeconds;
  const signature = createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
  return new Request("http://localhost/api/payments/stripe/webhook", {
    method: "POST", body, headers: { "stripe-signature": `t=${timestamp},v1=${signature}` },
  });
}

describe("Stripe webhook boundary", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", secret);
    mocks.intent.mockResolvedValue({ id: "pi_test", status: "succeeded" });
    mocks.reconcile.mockResolvedValue({ id: "order-1" });
  });
  afterEach(() => vi.unstubAllEnvs());

  it("returns 503 when the signing secret is absent", async () => {
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "");
    expect((await POST(signedRequest())).status).toBe(503);
    expect(mocks.intent).not.toHaveBeenCalled();
  });

  it("rejects an unsigned request without contacting payment providers", async () => {
    expect((await POST(new Request("http://localhost", { method: "POST", body: JSON.stringify(event) }))).status).toBe(400);
    expect(mocks.intent).not.toHaveBeenCalled();
  });

  it("rejects tampering and stale signatures", async () => {
    const request = signedRequest();
    expect((await POST(new Request(request, { body: JSON.stringify({ ...event, type: "tampered" }) }))).status).toBe(400);
    expect((await POST(signedRequest(undefined, 301))).status).toBe(400);
    expect(mocks.intent).not.toHaveBeenCalled();
  });

  it("fetches the authoritative intent before reconciling a signed event", async () => {
    expect((await POST(signedRequest())).status).toBe(200);
    expect(mocks.intent).toHaveBeenCalledWith("pi_test");
    expect(mocks.reconcile).toHaveBeenCalledWith({ id: "pi_test", status: "succeeded" });
  });

  it("returns a retryable failure when reconciliation fails", async () => {
    mocks.reconcile.mockRejectedValueOnce(new Error("Temporary Spree outage"));
    expect((await POST(signedRequest())).status).toBe(500);
  });

  it("acknowledges unrelated signed events without a payment mutation", async () => {
    const response = await POST(signedRequest(JSON.stringify({ type: "account.updated" })));
    expect(response.status).toBe(200);
    expect(mocks.reconcile).not.toHaveBeenCalled();
  });

  it.each(["{", "null", JSON.stringify({ type: "payment_intent.succeeded", data: { object: {} } })])("rejects malformed signed payload %s", async body => {
    expect((await POST(signedRequest(body))).status).toBe(400);
    expect(mocks.intent).not.toHaveBeenCalled();
  });
});
