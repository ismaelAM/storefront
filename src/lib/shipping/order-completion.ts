import { canCompleteOrder, ORDER_COMPLETION_FIELD } from "../utils/order-completion";
import { spreeShippingRequest, SpreeShippingApiError, type SpreeFulfillment } from "./spree-fulfillment";

type Options = Parameters<typeof spreeShippingRequest>[3];
interface AdminOrder {
  id: string;
  number: string;
  status?: string;
  completed_at?: string | null;
  payment_status?: string | null;
  amount_due?: string | null;
  fulfillments?: SpreeFulfillment[];
}
interface CustomField {
  id: string;
  key: string;
  field_type: string;
  value: unknown;
  custom_field_definition_id: string;
}
interface Definition {
  id: string;
  namespace: string;
  key: string;
  field_type: string;
  resource_type: string;
}

async function listAll<T>(path: string, options?: Options): Promise<T[]> {
  const items: T[] = [];
  for (let page = 1; ; page++) {
    const result = await spreeShippingRequest<{ data: T[]; meta?: { pages?: number } }>(
      "GET", `${path}?limit=100&page=${page}`, undefined, options,
    );
    if (!Array.isArray(result.data)) throw new Error("Respuesta de campos de Spree no válida");
    items.push(...result.data);
    if (page >= (result.meta?.pages ?? 1)) return items;
  }
}

export async function ensureOrderCompletionField(options?: Options): Promise<Definition> {
  const definitions = await listAll<Definition>("/custom_field_definitions", options);
  const existing = definitions.find(d =>
    d.resource_type === "Spree::Order" && `${d.namespace}.${d.key}` === ORDER_COMPLETION_FIELD,
  );
  if (existing) {
    if (existing.field_type !== "boolean") throw new Error("El campo Pedido completado debe ser boolean");
    return existing;
  }
  try {
    return await spreeShippingRequest<Definition>("POST", "/custom_field_definitions", {
      resource_type: "Spree::Order", namespace: "bisontcg", key: "order_completed",
      label: "Pedido completado", field_type: "boolean", storefront_visible: false,
    }, options);
  } catch (error) {
    // A concurrent setup may have created the same unique definition.
    if (!(error instanceof SpreeShippingApiError) || error.status !== 422) throw error;
    const created = (await listAll<Definition>("/custom_field_definitions", options)).find(d =>
      d.resource_type === "Spree::Order" && `${d.namespace}.${d.key}` === ORDER_COMPLETION_FIELD && d.field_type === "boolean",
    );
    if (!created) throw error;
    return created;
  }
}

function canonicalId(id: string): string {
  if (!/^or_[A-Za-z0-9]+$/.test(id)) throw new Error("ID de pedido de Spree no válido");
  return id;
}

async function loadOrder(input: string, options?: Options): Promise<AdminOrder> {
  let id = input.trim();
  if (/^R[A-Za-z0-9]+$/.test(id)) {
    const result = await spreeShippingRequest<{ data: Array<{ id: string; number: string }> }>(
      "GET", `/orders?q%5Bnumber_eq%5D=${encodeURIComponent(id)}&limit=2`, undefined, options,
    );
    const matches = result.data.filter(o => o.number === id);
    if (matches.length !== 1) throw new Error("No se ha encontrado un único pedido con ese número");
    id = matches[0].id;
  }
  canonicalId(id);
  const order = await spreeShippingRequest<AdminOrder>("GET", `/orders/${id}?expand=fulfillments`, undefined, options);
  if (order.id !== id) throw new Error("Spree ha devuelto un pedido diferente");
  return order;
}

async function orderFields(id: string, options?: Options) {
  return listAll<CustomField>(`/orders/${canonicalId(id)}/custom_fields`, options);
}

function completedValue(fields: CustomField[]): boolean {
  const field = fields.find(f => f.key === ORDER_COMPLETION_FIELD && f.field_type === "boolean");
  return field?.value === true || field?.value === "true" || field?.value === "1" || field?.value === 1;
}

/** Call only after the Store API has authorized this order for the customer. */
export async function readOrderCompleted(id: string, options?: Options): Promise<boolean> {
  return completedValue(await orderFields(id, options));
}

function details(order: AdminOrder, fields: CustomField[]) {
  const canComplete = canCompleteOrder(order);
  return {
    orderId: order.id, number: order.number,
    completed: canComplete && completedValue(fields), canComplete,
    data: order.fulfillments ?? [],
  };
}

export async function getOrderCompletionDetails(input: string, options?: Options) {
  const order = await loadOrder(input, options);
  return details(order, await orderFields(order.id, options));
}

export async function setOrderCompleted(input: string, completed: boolean, options?: Options) {
  const order = await loadOrder(input, options);
  if (completed && !canCompleteOrder(order)) {
    throw new Error("El pedido debe estar pagado y todos sus envíos enviados antes de completarlo");
  }
  const fields = await orderFields(order.id, options);
  const definition = await ensureOrderCompletionField(options);
  const current = fields.find(f => f.custom_field_definition_id === definition.id);
  if (!current || completedValue([current]) !== completed) {
    await spreeShippingRequest(
      current ? "PATCH" : "POST",
      `/orders/${order.id}/custom_fields${current ? `/${encodeURIComponent(current.id)}` : ""}`,
      current ? { value: completed } : { custom_field_definition_id: definition.id, value: completed },
      options,
    );
  }
  // Verify persistence before reporting success; never advance payment/shipment states.
  const updatedOrder = await loadOrder(order.id, options);
  const updatedFields = await orderFields(order.id, options);
  if (completedValue(updatedFields) !== completed || (completed && !canCompleteOrder(updatedOrder))) {
    throw new Error("No se pudo verificar el cierre del pedido en Spree. Recarga el pedido antes de intentarlo de nuevo.");
  }
  return details(updatedOrder, updatedFields);
}
