import type { Order } from "@spree/sdk";

export type CustomerOrder = Order & { manually_completed?: boolean };

/** The merchant's explicit delivery confirmation, separate from dispatch. */
export const ORDER_COMPLETION_FIELD = "bisontcg.order_completed";

export interface CompletionOrder {
  status?: string | null;
  completed_at?: string | null;
  payment_status?: string | null;
  amount_due?: string | null;
  fulfillments?: ReadonlyArray<{ status?: string | null }>;
  manually_completed?: boolean;
}

export function canCompleteOrder(order: CompletionOrder): boolean {
  const parcels = order.fulfillments?.filter(f => f.status !== "canceled") ?? [];
  return Boolean(
    order.completed_at && order.status !== "canceled" &&
    order.payment_status === "paid" && order.amount_due != null &&
    order.amount_due.trim() !== "" && Number(order.amount_due) === 0 &&
    parcels.length > 0 && parcels.every(f =>
      f.status === "shipped" || f.status === "delivered" || f.status === "fulfilled",
    ),
  );
}

export function isOrderCompleted(order: CompletionOrder): boolean {
  return order.manually_completed === true && canCompleteOrder(order);
}
