"use server";

import type { Order, OrderListParams } from "@spree/sdk";
import { readOrderCompleted } from "@/lib/shipping/order-completion";
import { canCompleteOrder, type CustomerOrder } from "@/lib/utils/order-completion";
import {
  DEFAULT_SURFACE,
  getCartOptions,
  getClient,
  getClientForSurface,
  type Surface,
  withAuthRefresh,
} from "@/lib/spree";
import { withFallback } from "./utils";

// Only accept orders already authorized by the customer-facing Store API.
// Never return Admin order data, private fields or credentials to the client.
async function withCompletion(order: Order): Promise<CustomerOrder> {
  if (!canCompleteOrder(order)) return order;
  try {
    return await readOrderCompleted(order.id, { timeoutMs: 3000 })
      ? { ...order, manually_completed: true }
      : order;
  } catch {
    // Completion is optional; an Admin outage must not hide order history.
    return order;
  }
}

export async function getOrders(params?: OrderListParams) {
  const expandedParams = {
    expand: ["fulfillments"],
    ...(params ?? {}),
  } as OrderListParams;

  return withFallback(
    async () => {
      return withAuthRefresh(async (options) => {
        const result = await getClient().customer.orders.list(expandedParams, options);
        return { ...result, data: await Promise.all(result.data.map(withCompletion)) };
      });
    },
    {
      data: [],
      meta: {
        page: 1,
        limit: 25,
        count: 0,
        pages: 0,
        from: 0,
        to: 0,
        in: 0,
        previous: null,
        next: null,
      },
    },
  );
}

/**
 * Get a single order by ID or number.
 * Works for both authenticated users (JWT) and guests (spreeToken).
 * The surface selects the cart token cookie + client so wholesale orders
 * resolve through the wholesale channel.
 */
export async function getOrder(
  id: string,
  params?: Record<string, unknown>,
  surface: Surface = DEFAULT_SURFACE,
) {
  return withFallback(async () => {
    const options = await getCartOptions(surface);
    const expandedParams = {
      expand: [
        "items",
        "fulfillments",
        "payments",
        "billing_address",
        "shipping_address",
        "gift_card",
      ],
      ...(params ?? {}),
    };
    const order = await getClientForSurface(surface).orders.get(id, expandedParams, options);
    return withCompletion(order);
  }, null);
}
