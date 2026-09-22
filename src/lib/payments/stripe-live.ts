import "server-only";

const STRIPE_API = "https://api.stripe.com/v1";
const EXTERNAL_PAYMENT_METHOD_ID =
  process.env.SPREE_STRIPE_EXTERNAL_PAYMENT_METHOD_ID ?? "pm_8aKR0I7fEb";

interface StripePaymentIntent {
  id: string;
  client_secret: string | null;
  status: string;
  amount: number;
  currency: string;
  metadata: Record<string, string>;
}

function stripeSecret(): string {
  const value = process.env.STRIPE_SECRET_KEY?.trim();
  if (!value || !value.startsWith("sk_live_")) {
    throw new Error("STRIPE_SECRET_KEY live no está configurada");
  }
  return value;
}

function spreeAdminKey(): string {
  const value =
    process.env.DEVIR_B2B_SPREE_ADMIN_API_KEY?.trim() ||
    process.env.SPREE_ADMIN_API_KEY?.trim();
  if (!value || !value.startsWith("sk_")) {
    throw new Error("Falta la Secret API Key Admin de Spree");
  }
  return value;
}

function spreeApiUrl(): string {
  return (
    process.env.DEVIR_B2B_SPREE_API_URL?.trim() ||
    process.env.SPREE_API_URL?.trim() ||
    "https://bisontcg.spree.sh"
  ).replace(/\/$/, "");
}

async function stripeRequest<T>(
  method: string,
  path: string,
  body?: URLSearchParams,
  idempotencyKey?: string,
): Promise<T> {
  const response = await fetch(`${STRIPE_API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${stripeSecret()}`,
      ...(body ? { "content-type": "application/x-www-form-urlencoded" } : {}),
      ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
    },
    ...(body ? { body: body.toString() } : {}),
    cache: "no-store",
  });
  const payload = (await response.json()) as T & {
    error?: { message?: string };
  };
  if (!response.ok) {
    throw new Error(payload.error?.message ?? `Stripe HTTP ${response.status}`);
  }
  return payload;
}

export async function getStripePaymentIntent(
  paymentIntentId: string,
): Promise<StripePaymentIntent> {
  return stripeRequest<StripePaymentIntent>(
    "GET",
    `/payment_intents/${encodeURIComponent(paymentIntentId)}`,
  );
}

export async function createOrUpdateStripePaymentIntent(params: {
  cartId: string;
  amount: number;
  currency: string;
  email?: string | null;
  paymentIntentId?: string | null;
}): Promise<StripePaymentIntent> {
  const body = new URLSearchParams();
  body.set("amount", String(params.amount));
  body.set("currency", params.currency.toLowerCase());
  body.set("automatic_payment_methods[enabled]", "true");
  body.set("metadata[spree_cart_id]", params.cartId);
  body.set("metadata[source]", "bisontcg-storefront");

  if (params.paymentIntentId) {
    const existing = await getStripePaymentIntent(params.paymentIntentId);
    if (existing.metadata.spree_cart_id !== params.cartId) {
      throw new Error("PaymentIntent no pertenece a este carrito");
    }
    if (["succeeded", "canceled"].includes(existing.status)) return existing;
    if (params.email) body.set("receipt_email", params.email);
    return stripeRequest<StripePaymentIntent>(
      "POST",
      `/payment_intents/${encodeURIComponent(params.paymentIntentId)}`,
      body,
    );
  }

  // Keep the idempotent create request limited to stable parameters. The
  // checkout email can appear/change after the first render; including it in
  // this request made Stripe reject a replay of the same key with different
  // parameters. v2 also avoids collisions with keys already cached by Stripe
  // under the previous request shape.
  const created = await stripeRequest<StripePaymentIntent>(
    "POST",
    "/payment_intents",
    body,
    `bisontcg:v2:${params.cartId}:${params.amount}:${params.currency.toLowerCase()}`,
  );

  if (!params.email) return created;

  const emailBody = new URLSearchParams();
  emailBody.set("receipt_email", params.email);
  return stripeRequest<StripePaymentIntent>(
    "POST",
    `/payment_intents/${encodeURIComponent(created.id)}`,
    emailBody,
  );
}

async function spreeAdminRequest<T>(
  method: string,
  path: string,
  body?: Record<string, unknown>,
): Promise<T> {
  const response = await fetch(`${spreeApiUrl()}/api/v3/admin${path}`, {
    method,
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      "x-spree-api-key": spreeAdminKey(),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    cache: "no-store",
  });
  const text = await response.text();
  let payload: unknown = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = text;
    }
  }
  if (!response.ok) {
    throw new Error(
      `Spree Admin HTTP ${response.status}: ${typeof payload === "string" ? payload.slice(0, 300) : JSON.stringify(payload).slice(0, 300)}`,
    );
  }
  return payload as T;
}

interface AdminOrder {
  id: string;
  status?: string;
  state?: string;
  total?: string | number;
  currency?: string;
  metadata?: Record<string, unknown>;
}

interface AdminPayment {
  id: string;
  amount?: string | number;
  status?: string;
  state?: string;
  payment_method?: { id?: string; name?: string };
  payment_method_id?: string;
}

export async function reconcileStripePaymentToSpree(
  paymentIntent: StripePaymentIntent,
): Promise<AdminOrder> {
  const cartId = paymentIntent.metadata.spree_cart_id;
  if (!cartId) throw new Error("PaymentIntent sin spree_cart_id");
  if (paymentIntent.status !== "succeeded") {
    throw new Error(
      `Stripe PaymentIntent aún no está pagado: ${paymentIntent.status}`,
    );
  }

  const order = await spreeAdminRequest<AdminOrder>(
    "GET",
    `/orders/${encodeURIComponent(cartId)}`,
  );

  const orderTotal = Number(order.total);
  const expectedAmount = Math.round(orderTotal * 100);
  if (!Number.isFinite(orderTotal) || expectedAmount !== paymentIntent.amount) {
    throw new Error("El importe de Stripe no coincide con el pedido de Spree");
  }
  if (
    order.currency &&
    order.currency.toLowerCase() !== paymentIntent.currency.toLowerCase()
  ) {
    throw new Error("La moneda de Stripe no coincide con el pedido de Spree");
  }

  const paymentsResponse = await spreeAdminRequest<{ data?: AdminPayment[] }>(
    "GET",
    `/orders/${encodeURIComponent(cartId)}/payments?limit=100`,
  );
  const alreadyRecorded = (paymentsResponse.data ?? []).some(
    (payment) =>
      payment.payment_method_id === EXTERNAL_PAYMENT_METHOD_ID ||
      payment.payment_method?.id === EXTERNAL_PAYMENT_METHOD_ID ||
      payment.payment_method?.name === "Stripe Live External",
  );

  if (!alreadyRecorded) {
    await spreeAdminRequest(
      "POST",
      `/orders/${encodeURIComponent(cartId)}/payments`,
      {
        payment_method_id: EXTERNAL_PAYMENT_METHOD_ID,
        amount: (paymentIntent.amount / 100).toFixed(2),
      },
    );
  }

  await spreeAdminRequest("PATCH", `/orders/${encodeURIComponent(cartId)}`, {
    metadata: {
      ...(order.metadata ?? {}),
      stripe_payment_intent_id: paymentIntent.id,
      stripe_payment_status: paymentIntent.status,
    },
  });

  if (order.status === "complete" || order.state === "complete") return order;

  return spreeAdminRequest<AdminOrder>(
    "PATCH",
    `/orders/${encodeURIComponent(cartId)}/complete`,
    { payment_pending: false, notify_customer: true },
  );
}
