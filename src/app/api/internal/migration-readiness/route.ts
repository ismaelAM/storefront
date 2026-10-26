import { createHmac, timingSafeEqual } from "node:crypto";

// Read-only, fixed-provider probe. No credentials or provider error bodies are
// returned, and no email, PaymentIntent, charge or customer is created.
export async function GET(request: Request): Promise<Response> {
  if (!authorized(request)) return unauthorized();
  const [stripe, email] = await Promise.all([
    stripeReadiness(),
    emailReadiness(),
  ]);
  return Response.json(
    { stripe, email },
    { headers: { "cache-control": "no-store" } },
  );
}

function authorized(request: Request): boolean {
  const secret = process.env.SPREE_WEBHOOK_SECRET;
  const supplied = request.headers.get("authorization") ?? "";
  const expected = secret
    ? `Bearer ${createHmac("sha256", secret).update("bison-migration-readiness-v1").digest("hex")}`
    : "";
  if (
    !expected ||
    !/^Bearer [0-9a-f]{64}$/.test(supplied) ||
    !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))
  ) {
    return false;
  }
  return true;
}

function unauthorized() {
  return Response.json(
    { error: "Unauthorized" },
    { status: 401, headers: { "cache-control": "no-store" } },
  );
}

// Authorized migration only: existing runtime credentials go server to server
// to the fixed owned Spree host. Callers cannot supply credentials or a URL.
export async function POST(request: Request): Promise<Response> {
  if (!authorized(request)) return unauthorized();
  if ((await request.text()) !== "{}")
    return Response.json({ error: "Unexpected request body" }, { status: 400 });
  const stripe = await stripeReadiness();
  const publishableKey =
    process.env.STRIPE_PUBLISHABLE_KEY?.trim() ||
    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.trim();
  if (!stripe.ready || !publishableKey?.match(/^pk_live_[A-Za-z0-9_]+$/)) {
    return Response.json({ connected: false }, { status: 503 });
  }
  try {
    const response = await fetch(
      "https://project-7ck7q.vercel.app/internal/bison-payment/connect",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${createHmac("sha256", process.env.SPREE_WEBHOOK_SECRET!).update("bison-email-http-v1").digest("hex")}`,
        },
        body: JSON.stringify({
          secret_key: process.env.STRIPE_SECRET_KEY?.trim(),
          publishable_key: publishableKey,
        }),
        cache: "no-store",
        signal: AbortSignal.timeout(90_000),
      },
    );
    if (!response.ok)
      return Response.json({ connected: false }, { status: 503 });
    const value = await response.json();
    if (
      value.connected !== true ||
      value.account_matches !== true ||
      typeof value.native_payment_method_id !== "string" ||
      !/^pm_[A-Za-z0-9]+$/.test(value.native_payment_method_id)
    )
      return Response.json({ connected: false }, { status: 503 });
    return Response.json(
      {
        connected: true,
        nativePaymentMethodId: value.native_payment_method_id,
      },
      { headers: { "cache-control": "no-store" } },
    );
  } catch {
    return Response.json({ connected: false }, { status: 503 });
  }
}

async function stripeReadiness() {
  const result = { ready: false, accountMatches: false, chargesEnabled: false };
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key?.startsWith("sk_live_")) return result;
  try {
    const response = await fetch("https://api.stripe.com/v1/account", {
      headers: { authorization: `Bearer ${key}` },
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) return result;
    const account = await response.json();
    result.accountMatches = account.id === "acct_1UDiVZHU3Etzdhlg";
    result.chargesEnabled = account.charges_enabled === true;
    result.ready = result.accountMatches && result.chargesEnabled;
  } catch {
    /* Return status only; provider errors can contain private data. */
  }
  return result;
}

async function emailReadiness() {
  const result = { ready: false, provider: "gmail" };
  const {
    EMAIL_PROVIDER,
    EMAIL_FROM,
    GMAIL_CLIENT_ID,
    GMAIL_CLIENT_SECRET,
    GMAIL_REFRESH_TOKEN,
  } = process.env;
  if (
    EMAIL_PROVIDER?.trim().toLowerCase() !== "gmail" ||
    !EMAIL_FROM ||
    !GMAIL_CLIENT_ID ||
    !GMAIL_CLIENT_SECRET ||
    !GMAIL_REFRESH_TOKEN
  )
    return result;
  try {
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: GMAIL_CLIENT_ID,
        client_secret: GMAIL_CLIENT_SECRET,
        refresh_token: GMAIL_REFRESH_TOKEN,
        grant_type: "refresh_token",
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) return result;
    const payload = await response.json();
    result.ready =
      typeof payload.access_token === "string" &&
      payload.access_token.length > 0;
  } catch {
    /* A failed refresh needs owner attention, never disclose its body. */
  }
  return result;
}
