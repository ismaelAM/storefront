import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import {
  getStripePaymentIntent,
  placeAuthorizedStripePaymentInSpree,
  reconcileStripeCancellationToSpree,
  reconcileStripePaymentToSpree,
} from "@/lib/payments/stripe-live";

function verifyStripeSignature(payload: string, header: string, secret: string) {
  const parts = header.split(",");
  const timestamp = parts
    .find((part) => part.startsWith("t="))
    ?.slice(2);
  const signatures = parts
    .filter((part) => part.startsWith("v1="))
    .map((part) => part.slice(3));

  if (!timestamp || signatures.length === 0) return false;
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > 300) {
    return false;
  }

  const expected = createHmac("sha256", secret)
    .update(`${timestamp}.${payload}`)
    .digest("hex");

  return signatures.some((signature) => {
    const left = Buffer.from(signature);
    const right = Buffer.from(expected);
    return left.length === right.length && timingSafeEqual(left, right);
  });
}

export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!secret) {
    return NextResponse.json(
      { error: "Stripe webhook not configured" },
      { status: 503 },
    );
  }

  const signature = request.headers.get("stripe-signature");
  const payload = await request.text();
  if (!signature || !verifyStripeSignature(payload, signature, secret)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  let event: {
    type?: unknown;
    data?: { object?: { id?: unknown } };
  };
  try {
    event = JSON.parse(payload);
    if (!event || typeof event.type !== "string") {
      return NextResponse.json({ error: "Invalid event" }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: "Invalid event" }, { status: 400 });
  }

  const relevantPaymentIntentEvent = [
    "payment_intent.amount_capturable_updated",
    "payment_intent.succeeded",
    "payment_intent.canceled",
  ].includes(event.type);

  if (relevantPaymentIntentEvent) {
    const paymentIntentId = event.data?.object?.id;
    if (typeof paymentIntentId !== "string" || !paymentIntentId) {
      return NextResponse.json({ error: "Missing payment intent" }, { status: 400 });
    }
    try {
      // Always branch on Stripe's current authoritative state rather than the
      // event name. This makes delayed/out-of-order webhook delivery harmless.
      const intent = await getStripePaymentIntent(paymentIntentId);
      if (intent.status === "requires_capture") {
        await placeAuthorizedStripePaymentInSpree(intent);
      } else if (intent.status === "succeeded") {
        await reconcileStripePaymentToSpree(intent);
      } else if (intent.status === "canceled") {
        await reconcileStripeCancellationToSpree(intent);
      }
    } catch (error) {
      console.error("Stripe webhook reconciliation failed", error);
      return NextResponse.json({ error: "Reconciliation failed" }, { status: 500 });
    }
  }

  return NextResponse.json({ received: true });
}
