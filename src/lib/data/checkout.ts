"use server";

import type { AddressParams, Cart } from "@spree/sdk";
import { SpreeError } from "@spree/sdk";
import { updateTag } from "next/cache";
import {
  cacheTagSuffix,
  getCartId,
  getCartOptions,
  getClientForSurface,
  isWholesaleEnabled,
  type Surface,
} from "@/lib/spree";
import { createSupabaseClient } from "@/lib/supabase/server";
import { getCart } from "./cart";
import { getCustomer } from "./customer";
import { getOrder } from "./orders";
import { actionResult, withFallback } from "./utils";
import { getWholesaleChannel } from "./wholesale";

/**
 * Determine which surface a checkout belongs to by matching its cart id against
 * the per-surface cart-id cookie. Cheap and correct for in-session actions,
 * where the cookie is always present. For the offsite-payment return path — where
 * the cookie may be gone — use {@link resolveSurfaceForCartVerified} instead.
 * Defaults to DTC when it matches neither.
 */
export async function resolveSurfaceForCart(cartId: string): Promise<Surface> {
  if (!isWholesaleEnabled()) return "dtc";
  const wholesaleCartId = await getCartId("wholesale");
  return wholesaleCartId === cartId ? "wholesale" : "dtc";
}

/**
 * Result of the verified surface resolution. `"unverified"` is distinct from
 * `"dtc"` on purpose: it means the wholesale check couldn't run to completion
 * (transient fetch/channel failure), so the surface is *unknown*, not confirmed
 * DTC. Callers on the offsite-payment path must fail closed on `"unverified"`
 * rather than routing a possibly-wholesale checkout through the DTC client.
 */
export type VerifiedSurface = Surface | "unverified";

/**
 * Like {@link resolveSurfaceForCart}, but confirms an ambiguous cart against its
 * own `channel_id` rather than trusting the cookie. Used on the offsite-payment
 * return, where the wholesale cart cookie can be dropped during the redirect and
 * a cookie-only check would route a wholesale checkout through the DTC client.
 * The extra fetch only runs when wholesale is enabled and the cookie didn't
 * already resolve the cart.
 *
 * Returns `"unverified"` when the wholesale lookup fails so the caller can fail
 * closed — a transient failure must not be mistaken for a confirmed DTC cart.
 */
export async function resolveSurfaceForCartVerified(
  cartId: string,
): Promise<VerifiedSurface> {
  if (!isWholesaleEnabled()) return "dtc";

  const wholesaleCartId = await getCartId("wholesale");
  if (wholesaleCartId === cartId) return "wholesale";

  // Cookie says DTC or is absent — verify against the cart's channel. Only a
  // *positive* signal decides the surface: a fetched cart whose channel matches
  // wholesale → "wholesale"; a fetched cart whose channel differs → confirmed
  // "dtc". Anything else (fetch threw, cart null, channel null) is "unverified"
  // so the caller fails closed instead of defaulting to DTC.
  try {
    const [cart, channel] = await Promise.all([
      getCart(cartId, "wholesale"),
      getWholesaleChannel(),
    ]);
    if (!cart || !channel) return "unverified";
    if (cart.channel_id == null) return "unverified";
    return cart.channel_id === channel.id ? "wholesale" : "dtc";
  } catch {
    return "unverified";
  }
}

/** Checkout cache tag, segmented per surface. */
function checkoutTag(surface: Surface): string {
  return `checkout${cacheTagSuffix(surface)}`;
}

function cartTag(surface: Surface): string {
  return `cart${cacheTagSuffix(surface)}`;
}

export async function getCheckoutOrder(cartId: string): Promise<Cart | null> {
  const surface = await resolveSurfaceForCart(cartId);

  // An explicit lookup preserves the guest token if this cart just completed,
  // so the order fallback can still authenticate. It also targets this checkout
  // when the browser's current cart has changed in another tab.
  const cart = await getCart(cartId, surface);
  if (cart && cart.id === cartId) return cart;

  // Cart completed — fetch as completed order.
  return withFallback(
    async () => (await getOrder(cartId, undefined, surface)) as unknown as Cart,
    null,
  );
}

export async function getCompletedOrder(cartId: string): Promise<Cart | null> {
  const surface = await resolveSurfaceForCart(cartId);

  // Fetch order directly — used by the order-placed page.
  // Does not call getCart() first because getCart() auto-clears
  // the cart token cookie on failure, which breaks getOrder()
  // for guest users.
  return withFallback(
    async () => (await getOrder(cartId, undefined, surface)) as unknown as Cart,
    null,
  );
}

export async function updateOrderAddresses(
  cartId: string,
  addresses: {
    shipping_address?: AddressParams;
    billing_address?: AddressParams;
    shipping_address_id?: string;
    billing_address_id?: string;
    use_shipping?: boolean;
    email?: string;
  },
) {
  return actionResult(async () => {
    const surface = await resolveSurfaceForCart(cartId);
    const options = await getCartOptions(surface);
    const id = cartId;
    const cart = await getClientForSurface(surface).carts.update(
      id,
      addresses,
      options,
    );
    updateTag(checkoutTag(surface));
    return { cart };
  }, "Failed to update addresses");
}

export async function updateCartMarket(
  cartId: string,
  params: { currency: string; locale: string },
) {
  return actionResult(async () => {
    const surface = await resolveSurfaceForCart(cartId);
    const options = await getCartOptions(surface);
    const id = cartId;
    const cart = await getClientForSurface(surface).carts.update(
      id,
      params,
      options,
    );
    updateTag(checkoutTag(surface));
    return { cart };
  }, "Failed to update order market");
}

export async function selectDeliveryRate(
  cartId: string,
  fulfillmentId: string,
  deliveryRateId: string,
) {
  return actionResult(async () => {
    const surface = await resolveSurfaceForCart(cartId);
    const options = await getCartOptions(surface);
    const id = cartId;
    const client = getClientForSurface(surface);
    await client.carts.fulfillments.update(
      id,
      fulfillmentId,
      { selected_delivery_rate_id: deliveryRateId },
      options,
    );

    // Spree updates the fulfillment in-place but does not return the
    // recalculated cart from this endpoint. Read the cart again so delivery
    // total, taxes and grand total reflect the selected rate immediately.
    const cart = await client.carts.get(id, options);
    updateTag(checkoutTag(surface));
    updateTag(cartTag(surface));
    return { cart };
  }, "Failed to select delivery rate");
}

/**
 * Apply a code to the cart — tries discount code first, then gift card.
 * Single input field on checkout, backend determines the type.
 */
export async function applyCode(cartId: string, code: string) {
  const surface = await resolveSurfaceForCart(cartId);
  const options = await getCartOptions(surface);
  const id = cartId;
  const client = getClientForSurface(surface);
  const normalizedCode = code.trim().toUpperCase();

  // Account-linked special pricing codes are requests, not percentage coupons.
  // Once an account is approved, Spree's price list sets the exact per-SKU
  // price needed for the configured target margin.
  try {
    const supabase = createSupabaseClient();
    const { data: program } = await supabase
      .from("special_pricing_programs")
      .select("code,active,requires_approval")
      .eq("code", normalizedCode)
      .eq("active", true)
      .maybeSingle();

    if (program) {
      const customer = await getCustomer();
      if (!customer) {
        return {
          success: false,
          error: "Inicia sesión para solicitar este precio especial.",
        } as const;
      }

      const { data: currentRequest, error: requestReadError } = await supabase
        .from("special_pricing_requests")
        .select("id,status")
        .eq("program_code", program.code)
        .eq("spree_customer_id", customer.id)
        .maybeSingle();
      if (requestReadError) throw requestReadError;

      if (currentRequest?.status === "approved") {
        // Any cart write runs Spree's pricing pipeline again, causing the
        // approved customer price list to be selected immediately.
        const cart = await client.carts.update(id, {}, options);
        updateTag(checkoutTag(surface));
        updateTag(cartTag(surface));
        return {
          success: true,
          cart,
          type: "special_pricing" as const,
          notice: "Precio especial de cuenta aplicado.",
        };
      }

      const now = new Date().toISOString();
      if (currentRequest) {
        const { error: requestUpdateError } = await supabase
          .from("special_pricing_requests")
          .update({
            status: "pending",
            requested_at: now,
            decided_at: null,
            note: null,
            updated_at: now,
          })
          .eq("id", currentRequest.id);
        if (requestUpdateError) throw requestUpdateError;
      } else {
        const { error: requestInsertError } = await supabase
          .from("special_pricing_requests")
          .insert({
            program_code: program.code,
            spree_customer_id: customer.id,
            email: customer.email,
            status: program.requires_approval ? "pending" : "approved",
            requested_at: now,
            updated_at: now,
          });
        if (requestInsertError) throw requestInsertError;
      }

      return {
        success: false,
        notice: program.requires_approval
          ? "Solicitud enviada. El precio especial se activará en tu cuenta cuando sea aprobado."
          : "Precio especial vinculado a tu cuenta.",
      } as const;
    }
  } catch (specialPricingError) {
    // A failure in the private pricing-program lookup should not break normal
    // Spree coupons or gift cards.
    console.error("Special pricing code lookup failed", specialPricingError);
  }

  // Try discount code first (more common)
  try {
    const cart = await client.carts.discountCodes.apply(id, code, options);
    updateTag(checkoutTag(surface));
    updateTag(cartTag(surface));
    return { success: true, cart, type: "discount" as const };
  } catch (discountError) {
    // Only fall back to gift card if the discount code was not found (422/404).
    // Network errors, 500s, etc. should surface the backend message directly.
    const isNotFound =
      discountError instanceof SpreeError &&
      (discountError.status === 422 || discountError.status === 404);

    if (!isNotFound) {
      return { success: false, error: errorMessage(discountError) } as const;
    }

    // Discount code not found — try gift card
    try {
      const cart = await client.carts.giftCards.apply(id, code, options);
      updateTag(checkoutTag(surface));
      updateTag(cartTag(surface));
      return { success: true, cart, type: "gift_card" as const };
    } catch (giftCardError) {
      // Gift card also failed. If it's a specific error (expired, redeemed, etc.)
      // show the backend message. If both are just "not found", show the
      // discount error (the more common scenario).
      const isGiftCardNotFound =
        giftCardError instanceof SpreeError &&
        (giftCardError.code === "gift_card_not_found" ||
          giftCardError.code === "record_not_found");

      return {
        success: false,
        error: isGiftCardNotFound
          ? errorMessage(discountError)
          : errorMessage(giftCardError),
      } as const;
    }
  }
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "The entered code is not valid";
}

export async function removeDiscountCode(cartId: string, code: string) {
  return actionResult(async () => {
    const surface = await resolveSurfaceForCart(cartId);
    const options = await getCartOptions(surface);
    const id = cartId;
    const cart = await getClientForSurface(surface).carts.discountCodes.remove(
      id,
      code,
      options,
    );
    updateTag(checkoutTag(surface));
    updateTag(cartTag(surface));
    return { cart };
  }, "Failed to remove discount code");
}

export async function removeGiftCard(cartId: string, giftCardId: string) {
  return actionResult(async () => {
    const surface = await resolveSurfaceForCart(cartId);
    const options = await getCartOptions(surface);
    const id = cartId;
    const cart = await getClientForSurface(surface).carts.giftCards.remove(
      id,
      giftCardId,
      options,
    );
    updateTag(checkoutTag(surface));
    updateTag(cartTag(surface));
    return { cart };
  }, "Failed to remove gift card");
}
