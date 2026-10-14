import { describe, expect, it } from "vitest";
import { getOrderCompletionDetails, setOrderCompleted, ensureOrderCompletionField, readOrderCompleted } from "../order-completion";

const env = { SPREE_API_URL: "https://shop.example.test", SPREE_ADMIN_API_KEY: "sk_test_shipping" };
const order = { id: "or_1", number: "R123", status: "complete", completed_at: "2026-10-13T21:31:00Z", payment_status: "paid", amount_due: "0.00", fulfillments: [{ id: "ful_1", status: "shipped" }] };
const definition = { id: "cfdef_1", resource_type: "Spree::Order", namespace: "bisontcg", key: "order_completed", field_type: "boolean", storefront_visible: false };
const field = { id: "cf_1", key: "bisontcg.order_completed", field_type: "boolean", value: false, custom_field_definition_id: "cfdef_1" };

function api(initialOrder = order, initialFields = [field], initialDefinitions = [definition]) {
  const requests: Array<{ path: string; method: string; body: Record<string, unknown> }> = [];
  let fields = [...initialFields];
  let definitions = [...initialDefinitions];
  const fetcher: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    const path = url.pathname.replace("/api/v3/admin", "");
    const method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    requests.push({ path, method, body });
    if (path === "/orders/or_1" && method === "GET") return Response.json(initialOrder);
    if (path === "/orders" && url.searchParams.get("q[number_eq]") === "R123") return Response.json({ data: [{ id: "or_1", number: "R123" }] });
    if (path === "/custom_field_definitions" && method === "GET") return Response.json({ data: definitions });
    if (path === "/custom_field_definitions" && method === "POST") {
      definitions = [...definitions, definition];
      return Response.json({ ...definition, ...body });
    }
    if (path === "/orders/or_1/custom_fields" && method === "GET") return Response.json({ data: fields });
    if (path === "/orders/or_1/custom_fields" && method === "POST") {
      const created = { ...field, ...body };
      fields = [...fields, created];
      return Response.json(created);
    }
    if (path === "/orders/or_1/custom_fields/cf_1" && method === "PATCH") {
      fields = [{ ...field, ...body }];
      return Response.json(fields[0]);
    }
    throw new Error(`Unexpected API call: ${method} ${path}`);
  };
  return { options: { env, fetcher }, requests };
}

describe("Spree manual completion storage", () => {
  it("does not report success if Spree has not persisted the requested value", async () => {
    const { options } = api();
    const fetcher: typeof fetch = (input, init) => init?.method === "PATCH"
      ? Promise.resolve(Response.json({ ...field, value: true }))
      : options.fetcher(input, init);
    await expect(setOrderCompleted("or_1", true, { ...options, fetcher })).rejects.toThrow("verificar");
  });

  it("updates only the dedicated boolean field, without changing shipments or payments", async () => {
    const { options, requests } = api();
    const result = await setOrderCompleted("or_1", true, options);
    expect(result).toMatchObject({ orderId: "or_1", number: "R123", completed: true });
    expect(requests.filter(r => r.method !== "GET")).toEqual([
      { path: "/orders/or_1/custom_fields/cf_1", method: "PATCH", body: { value: true } },
    ]);
  });

  it("can reopen the customer-facing status without reversing fulfillment", async () => {
    const { options, requests } = api(order, [{ ...field, value: true }]);
    expect(await setOrderCompleted("or_1", false, options)).toMatchObject({ completed: false });
    expect(requests.filter(r => r.method !== "GET")).toEqual([
      { path: "/orders/or_1/custom_fields/cf_1", method: "PATCH", body: { value: false } },
    ]);
  });

  it("refuses an outstanding shipment before writing anything", async () => {
    const { options, requests } = api({ ...order, fulfillments: [{ id: "ful_1", status: "pending" }] });
    await expect(setOrderCompleted("or_1", true, options)).rejects.toThrow("enviados");
    expect(requests.every(r => r.method === "GET")).toBe(true);
  });

  it("creates the native Spree checkbox when it has not been configured", async () => {
    const { options, requests } = api(order, [], []);
    expect(await setOrderCompleted("or_1", true, options)).toMatchObject({ completed: true });
    expect(requests.find(r => r.path === "/custom_field_definitions" && r.method === "POST")?.body).toMatchObject({
      resource_type: "Spree::Order", namespace: "bisontcg", key: "order_completed", label: "Pedido completado", field_type: "boolean", storefront_visible: false,
    });
  });

  it("does not overwrite an incompatible existing definition", async () => {
    const { options, requests } = api(order, [], [{ ...definition, field_type: "short_text" }]);
    await expect(ensureOrderCompletionField(options)).rejects.toThrow("boolean");
    expect(requests.every(r => r.method === "GET")).toBe(true);
  });

  it("resolves an order number to its exact canonical ID", async () => {
    const { options } = api();
    expect(await getOrderCompletionDetails("R123", options)).toMatchObject({ orderId: "or_1", completed: false, canComplete: true, data: [{ id: "ful_1" }] });
  });

  it("does not mistake a serialized false boolean for a completed order", async () => {
    const { options } = api(order, [{ ...field, value: "false" as unknown as boolean }]);
    expect(await readOrderCompleted("or_1", options)).toBe(false);
  });
});
