import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ShippingOperationsPanel } from "./ShippingOperationsPanel";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("merchant order completion control", () => {
  it("confirms delivery without requiring or submitting courier tracking", async () => {
    const state = { orderId: "or_1", number: "R123", completed: false, canComplete: true, data: [{ id: "ful_1", status: "shipped" }] };
    const writes: unknown[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_input, init) => {
      const body = JSON.parse(String(init?.body));
      if (body.action === "spree-set-order-completed") { writes.push(body); state.completed = body.completed; }
      return Response.json(state);
    }));
    render(<ShippingOperationsPanel />);
    fireEvent.change(screen.getByPlaceholderText("Ej. R123456789"), { target: { value: "R123" } });
    fireEvent.click(screen.getByRole("button", { name: "Cargar envío" }));
    fireEvent.click(await screen.findByRole("button", { name: "Marcar pedido completado" }));
    expect(writes).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Confirmar cierre" }));
    expect(await screen.findByRole("button", { name: "Reabrir pedido" })).toBeInTheDocument();
    expect(writes).toEqual([{ action: "spree-set-order-completed", orderId: "or_1", completed: true }]);
  });

  it("disables completion until all parcels are dispatched", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ orderId: "or_1", number: "R123", completed: false, canComplete: false, data: [{ id: "ful_1", status: "pending" }] })));
    render(<ShippingOperationsPanel />);
    fireEvent.change(screen.getByPlaceholderText("Ej. R123456789"), { target: { value: "R123" } });
    fireEvent.click(screen.getByRole("button", { name: "Cargar envío" }));
    expect(await screen.findByRole("button", { name: "Marcar pedido completado" })).toBeDisabled();
  });

  it("keeps the selected order fixed while an operation is in flight", async () => {
    let resolveResponse!: (value: Response) => void;
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(resolve => { resolveResponse = resolve; })));
    render(<ShippingOperationsPanel />);
    const input = screen.getByPlaceholderText("Ej. R123456789");
    fireEvent.change(input, { target: { value: "R123" } });
    fireEvent.click(screen.getByRole("button", { name: "Cargar envío" }));
    expect(input).toBeDisabled();
    resolveResponse(Response.json({ orderId: "or_1", number: "R123", completed: false, canComplete: true, data: [{ id: "ful_1", status: "shipped" }] }));
    expect(await screen.findByRole("button", { name: "Marcar pedido completado" })).toBeEnabled();
    expect(input).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Marcar pedido completado" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirmar cierre" }));
    expect(input).toBeDisabled();
    resolveResponse(Response.json({ orderId: "or_1", number: "R123", completed: true, canComplete: true, data: [{ id: "ful_1", status: "shipped" }] }));
    expect(await screen.findByRole("button", { name: "Reabrir pedido" })).toBeEnabled();
    expect(input).toBeEnabled();
  });
});
