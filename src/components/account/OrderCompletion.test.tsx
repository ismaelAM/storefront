import type { Order } from "@spree/sdk";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OrderList } from "./OrderList";
import { OrderDetail } from "./OrderDetail";

vi.mock("next-intl/server", () => ({ getTranslations: async () => (key: string) => ({ completed: "Completado", shipped: "Enviado" }[key] ?? key) }));
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => ({ shipped: "Enviado" }[key] ?? key) }));

const order = {
  id: "or_1", number: "R123", currency: "EUR", completed_at: "2026-10-13T21:31:00Z",
  payment_status: "paid", amount_due: "0.00", fulfillment_status: "shipped", display_total: "€7,89",
  items: [], payments: [], billing_address: null, shipping_address: null,
  fulfillments: [{ id: "ful_1", status: "shipped", items: [], tracking: null, stock_location: null, delivery_method: { name: "Entrega en Madrid" } }],
} as unknown as Order;
afterEach(cleanup);

describe("customer-facing completed orders", () => {
  it("shows explicit completion in the order history", async () => {
    render(await OrderList({ orders: [{ ...order, manually_completed: true }], basePath: "/es/es", locale: "es" }));
    expect(screen.getByText("Completado")).toBeInTheDocument();
    expect(screen.queryByText("Enviado")).not.toBeInTheDocument();
  });

  it("continues to show Enviado while a parcel is only dispatched", async () => {
    render(await OrderList({ orders: [order], basePath: "/es/es", locale: "es" }));
    expect(screen.getByText("Enviado")).toBeInTheDocument();
    expect(screen.queryByText("Completado")).not.toBeInTheDocument();
  });

  it("shows a completion banner without losing the shipment detail", async () => {
    render(await OrderDetail({ order: { ...order, manually_completed: true }, basePath: "/es/es", locale: "es" }));
    expect(screen.getByRole("status")).toHaveTextContent("Completado");
    expect(screen.getByText("Enviado")).toBeInTheDocument();
  });
});
