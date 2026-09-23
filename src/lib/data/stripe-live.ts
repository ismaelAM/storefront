"use server";

import { getCheckoutOrder } from "@/lib/data/checkout";
import { actionResult } from "@/lib/data/utils";
import {
  createOrUpdateStripePaymentIntent,
  getStripePaymentIntent,
  reconcileStripePaymentToSpree,
} from "@/lib/payments/stripe-live";

function amountInMinorUnits(total: string | number | null | undefined): number {
  const amount = Number(total);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("El total del carrito no es cobrable");
  }
  return Math.round(amount * 100);
}

export async function createStripeLiveIntent(
  cartId: string,
  paymentIntentId?: string | null,
) {
  return actionResult(async () => {
    const cart = await getCheckoutOrder(cartId);
    if (!cart || cart.id !== cartId || cart.current_step === "complete") {
      throw new Error("Carrito no válido para pago");
    }

    const intent = await createOrUpdateStripePaymentIntent({
      cartId,
      amount: amountInMinorUnits(cart.amount_due ?? cart.total),
      currency: cart.currency,
      email: cart.email,
      paymentIntentId,
    });

    if (!intent.client_secret) {
      throw new Error("Stripe no devolvió client_secret");
    }

    return {
      paymentIntentId: intent.id,
      clientSecret: intent.client_secret,
      status: intent.status,
    };
  }, "No se pudo iniciar el pago con Stripe");
}

export async function finalizeStripeLivePayment(
  cartId: string,
  paymentIntentId: string,
) {
  return actionResult(async () => {
    const cart = await getCheckoutOrder(cartId);
    if (!cart || cart.id !== cartId) {
      throw new Error("No se pudo validar el pedido");
    }

    const intent = await getStripePaymentIntent(paymentIntentId);
    if (intent.metadata.spree_cart_id !== cartId) {
      throw new Error("El pago no pertenece a este pedido");
    }

    // Reconciliation validates the authoritative Admin order and its recorded
    // payments. The storefront balance may already be zero after a webhook.
    const order = await reconcileStripePaymentToSpree(intent);
    return { order };
  }, "No se pudo reconciliar el pago con Spree");
}
