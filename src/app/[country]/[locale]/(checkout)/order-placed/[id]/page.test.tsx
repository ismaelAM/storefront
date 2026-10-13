import { act, render, screen } from "@testing-library/react";
import { Suspense } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import messages from "../../../../../../../messages/es.json";

const mocks = vi.hoisted(() => ({ summary: vi.fn(), getOrder: vi.fn() }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/es/es/order-placed/cart-1",
}));
vi.mock("next-intl", () => ({
  useTranslations:
    (namespace: keyof typeof messages) =>
    (key: string, values?: Record<string, string>) => {
      const bundle = messages[namespace] as Record<string, string>;
      return Object.entries(values ?? {}).reduce(
        (text, [name, value]) => text.replace(`{${name}}`, value),
        bundle[key] ?? key,
      );
    },
}));
vi.mock("@/contexts/CheckoutContext", () => ({
  useCheckout: () => ({ setSummaryContent: mocks.summary }),
}));
vi.mock("@/lib/data/checkout", () => ({ getCompletedOrder: mocks.getOrder }));
vi.mock("@/lib/analytics/gtm", () => ({ trackPurchase: vi.fn() }));

import { cacheCompletedOrder } from "@/lib/utils/completed-order-cache";
import OrderPlacedPage from "./page";

describe("order confirmation notice", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    mocks.getOrder.mockResolvedValue(null);
  });

  async function renderPage() {
    await act(async () => {
      render(
        <Suspense>
          <OrderPlacedPage
            params={Promise.resolve({
              id: "cart-1",
              country: "es",
              locale: "es",
            })}
          />
        </Suspense>,
      );
    });
  }

  it("clearly confirms the order with its number", async () => {
    cacheCompletedOrder("cart-1", { id: "cart-1", number: "R123", items: [] });
    await renderPage();
    expect(screen.getByRole("status")).toHaveTextContent(
      "Pedido realizado correctamente",
    );
    expect(screen.getByText("Pedido #R123")).toBeInTheDocument();
  });

  it("does not show a success notice when the order cannot be loaded", async () => {
    await renderPage();
    expect(screen.getByText("Pedido no encontrado")).toBeInTheDocument();
    expect(
      screen.queryByText("Pedido realizado correctamente"),
    ).not.toBeInTheDocument();
  });
});
