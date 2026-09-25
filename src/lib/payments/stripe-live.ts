import "server-only";

const STRIPE_API = "https://api.stripe.com/v1";
const EXTERNAL_PAYMENT_METHOD_ID =
  process.env.SPREE_STRIPE_EXTERNAL_PAYMENT_METHOD_ID ?? "pm_8aKR0I7fEb";

export const MANUAL_CAPTURE_THRESHOLD_MINOR_UNITS = 50_000;

export function requiresManualStripeCapture(
  amount: number,
  currency: string,
): boolean {
  return (
    currency.toLowerCase() === "eur" &&
    amount > MANUAL_CAPTURE_THRESHOLD_MINOR_UNITS
  );
}

interface StripePaymentIntent {
  id: string;
  client_secret: string | null;
  status: string;
  amount: number;
  currency: string;
  metadata: Record<string, string>;
  capture_method?: string;
}

function stripeSecret(): string {
  const value = process.env.STRIPE_SECRET_KEY?.trim();
  if (!value || !value.startsWith("sk_live_")) {
    throw new Error("STRIPE_SECRET_KEY live no está configurada");
  }
  return value;
}

function spreeAdminKey(): string {
  // Order operations need order scopes; the Devir key may only allow catalog access.
  const value =
    process.env.SPREE_ADMIN_API_KEY?.trim() ||
    process.env.DEVIR_B2B_SPREE_ADMIN_API_KEY?.trim();
  if (!value || !value.startsWith("sk_")) {
    throw new Error("Falta la Secret API Key Admin de Spree");
  }
  return value;
}

function spreeApiUrl(): string {
  return (
    process.env.SPREE_API_URL?.trim() ||
    process.env.DEVIR_B2B_SPREE_API_URL?.trim() ||
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
  const manualReview = requiresManualStripeCapture(
    params.amount,
    params.currency,
  );

  body.set("amount", String(params.amount));
  body.set("currency", params.currency.toLowerCase());
  body.set("automatic_payment_methods[enabled]", "true");
  if (manualReview) body.set("capture_method", "manual");
  body.set("metadata[spree_cart_id]", params.cartId);
  body.set("metadata[source]", "bisontcg-storefront");
  body.set("metadata[manual_review]", manualReview ? "true" : "false");

  if (params.paymentIntentId) {
    const existing = await getStripePaymentIntent(params.paymentIntentId);
    if (existing.metadata.spree_cart_id !== params.cartId) {
      throw new Error("PaymentIntent no pertenece a este carrito");
    }
    if (["succeeded", "canceled", "requires_capture"].includes(existing.status)) {
      return existing;
    }
    // Preserve Stripe's normal automatic_async behavior below the threshold.
    // Only switch modes when the cart crosses the 500 EUR boundary.
    if (!manualReview && existing.capture_method === "manual") {
      body.set("capture_method", "automatic_async");
    }
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
  // parameters. v3 also avoids collisions with keys already cached by Stripe
  // under the previous request shape.
  const created = await stripeRequest<StripePaymentIntent>(
    "POST",
    "/payment_intents",
    body,
    `bisontcg:v3:${params.cartId}:${params.amount}:${params.currency.toLowerCase()}`,
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
  idempotencyKey?: string,
): Promise<T> {
  const response = await fetch(`${spreeApiUrl()}/api/v3/admin${path}`, {
    method,
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      "x-spree-api-key": spreeAdminKey(),
      ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
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
  amount_due?: string | number | null;
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

async function getOrCreateSpreePaymentForStripe(
  paymentIntent: StripePaymentIntent,
): Promise<{ order: AdminOrder; payment: AdminPayment }> {
  const cartId = paymentIntent.metadata.spree_cart_id;
  if (!cartId) throw new Error("PaymentIntent sin spree_cart_id");

  const order = await spreeAdminRequest<AdminOrder>(
    "GET",
    `/orders/${encodeURIComponent(cartId)}`,
  );

  if (
    !order.currency ||
    order.currency.toLowerCase() !== paymentIntent.currency.toLowerCase()
  ) {
    throw new Error("La moneda de Stripe no coincide con el pedido de Spree");
  }

  if (["canceled", "cancelled"].includes(order.status ?? order.state ?? "")) {
    throw new Error("El pedido está cancelado; el cobro requiere revisión");
  }

  const recordedIntentId = order.metadata?.stripe_payment_intent_id;
  if (recordedIntentId && recordedIntentId !== paymentIntent.id) {
    throw new Error("El pedido ya está vinculado a otro pago de Stripe");
  }

  const paymentsResponse = await spreeAdminRequest<{ data?: AdminPayment[] }>(
    "GET",
    `/orders/${encodeURIComponent(cartId)}/payments?limit=100`,
  );
  const activeExternalPayments = (paymentsResponse.data ?? []).filter(
    (payment) =>
      (payment.payment_method_id === EXTERNAL_PAYMENT_METHOD_ID ||
        payment.payment_method?.id === EXTERNAL_PAYMENT_METHOD_ID) &&
      ["checkout", "pending", "processing", "completed"].includes(
        payment.status ?? payment.state ?? "",
      ),
  );

  const recordedPaymentId = order.metadata?.stripe_spree_payment_id;
  let recordedPayment =
    activeExternalPayments.length === 1 ? activeExternalPayments[0] : undefined;

  // Amount alone cannot identify a charge. Legacy records must link the
  // intent on the order; new records also persist Spree's exact payment ID.
  if (
    activeExternalPayments.length > 0 ||
    recordedIntentId ||
    recordedPaymentId
  ) {
    if (
      recordedIntentId !== paymentIntent.id ||
      !recordedPayment ||
      (recordedPaymentId && recordedPaymentId !== recordedPayment.id) ||
      Math.round(Number(recordedPayment.amount) * 100) !== paymentIntent.amount
    ) {
      throw new Error("No se pudo identificar de forma inequívoca el pago de Spree");
    }
  }

  // amount_due includes gift cards and store credit. Once this payment has
  // settled, add it back only for validation of a replay of the same charge.
  const due = Number(order.amount_due ?? order.total);
  const settled =
    (recordedPayment?.status ?? recordedPayment?.state) === "completed";
  const expectedAmount =
    Math.round(due * 100) +
    (order.amount_due != null && settled ? paymentIntent.amount : 0);
  if (
    !Number.isFinite(due) ||
    !Number.isSafeInteger(paymentIntent.amount) ||
    paymentIntent.amount <= 0 ||
    expectedAmount !== paymentIntent.amount
  ) {
    throw new Error("El importe de Stripe no coincide con el pedido de Spree");
  }

  if (!recordedPayment) {
    recordedPayment = await spreeAdminRequest<AdminPayment>(
      "POST",
      `/orders/${encodeURIComponent(cartId)}/payments`,
      {
        payment_method_id: EXTERNAL_PAYMENT_METHOD_ID,
        amount: (paymentIntent.amount / 100).toFixed(2),
      },
      `bisontcg:stripe-payment:${cartId}:${paymentIntent.id}`,
    );
  }

  if (!recordedPayment.id) {
    throw new Error("Spree no devolvió un identificador de pago");
  }

  if (
    recordedIntentId !== paymentIntent.id ||
    recordedPaymentId !== recordedPayment.id ||
    order.metadata?.stripe_payment_status !== paymentIntent.status
  ) {
    await spreeAdminRequest("PATCH", `/orders/${encodeURIComponent(cartId)}`, {
      metadata: {
        ...(order.metadata ?? {}),
        stripe_payment_intent_id: paymentIntent.id,
        stripe_spree_payment_id: recordedPayment.id,
        stripe_payment_status: paymentIntent.status,
      },
    });
  }

  return { order, payment: recordedPayment };
}

/**
 * Places an order after Stripe has authorized a >500 EUR charge.
 * The authorization is not captured yet: the order is placed with payment
 * pending so stock is reserved while the merchant reviews it in Stripe.
 */
export async function placeAuthorizedStripePaymentInSpree(
  paymentIntent: StripePaymentIntent,
): Promise<AdminOrder> {
  if (paymentIntent.status !== "requires_capture") {
    throw new Error(
      `Stripe PaymentIntent no está pendiente de captura: ${paymentIntent.status}`,
    );
  }
  if (paymentIntent.metadata.manual_review !== "true") {
    throw new Error("PaymentIntent pendiente de captura sin revisión manual");
  }

  const { order } = await getOrCreateSpreePaymentForStripe(paymentIntent);
  if (order.status === "complete" || order.state === "complete") return order;

  const cartId = paymentIntent.metadata.spree_cart_id;
  return spreeAdminRequest<AdminOrder>(
    "PATCH",
    `/orders/${encodeURIComponent(cartId)}/complete`,
    { payment_pending: true, notify_customer: true },
  );
}

export async function reconcileStripePaymentToSpree(
  paymentIntent: StripePaymentIntent,
): Promise<AdminOrder> {
  if (paymentIntent.status !== "succeeded") {
    throw new Error(
      `Stripe PaymentIntent aún no está pagado: ${paymentIntent.status}`,
    );
  }

  const { order, payment } =
    await getOrCreateSpreePaymentForStripe(paymentIntent);
  const cartId = paymentIntent.metadata.spree_cart_id;

  if (order.status === "complete" || order.state === "complete") {
    const paymentStatus = payment.status ?? payment.state;
    if (paymentStatus !== "completed") {
      await spreeAdminRequest(
        "PATCH",
        `/orders/${encodeURIComponent(cartId)}/payments/${encodeURIComponent(payment.id)}/capture`,
      );
    }
    return spreeAdminRequest<AdminOrder>(
      "GET",
      `/orders/${encodeURIComponent(cartId)}`,
    );
  }

  return spreeAdminRequest<AdminOrder>(
    "PATCH",
    `/orders/${encodeURIComponent(cartId)}/complete`,
    { payment_pending: false, notify_customer: true },
  );
}

/**
 * Mirrors a Stripe authorization cancellation back into Spree. Captured money
 * is never refunded here; this path is only for a canceled uncaptured hold.
 */
export async function reconcileStripeCancellationToSpree(
  paymentIntent: StripePaymentIntent,
): Promise<AdminOrder> {
  if (paymentIntent.status !== "canceled") {
    throw new Error(
      `Stripe PaymentIntent no está cancelado: ${paymentIntent.status}`,
    );
  }

  const cartId = paymentIntent.metadata.spree_cart_id;
  if (!cartId) throw new Error("PaymentIntent sin spree_cart_id");

  const order = await spreeAdminRequest<AdminOrder>(
    "GET",
    `/orders/${encodeURIComponent(cartId)}`,
  );
  if (["canceled", "cancelled"].includes(order.status ?? order.state ?? "")) {
    return order;
  }

  // Ignore abandoned/unplaced PaymentIntents. Only a PaymentIntent that was
  // persisted onto the order by the authorization flow may cancel that order.
  if (order.metadata?.stripe_payment_intent_id !== paymentIntent.id) {
    return order;
  }

  await spreeAdminRequest("PATCH", `/orders/${encodeURIComponent(cartId)}`, {
    metadata: {
      ...(order.metadata ?? {}),
      stripe_payment_status: "canceled",
    },
  });

  return spreeAdminRequest<AdminOrder>(
    "PATCH",
    `/orders/${encodeURIComponent(cartId)}/cancel`,
    {
      refund_payments: false,
      notify_customer: true,
      cancel_note: "Stripe authorization canceled before capture",
    },
  );
}
