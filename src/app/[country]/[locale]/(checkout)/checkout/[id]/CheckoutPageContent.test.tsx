import type { Cart } from "@spree/sdk";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useImperativeHandle } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  PaymentCompleteResult,
  PaymentSectionHandle,
} from "@/components/checkout/PaymentSection";

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  summary: vi.fn(),
  submitPayment: vi.fn(),
  getOrder: vi.fn(),
  finalize: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push, replace: mocks.replace }),
  usePathname: () => "/es/es/checkout/cart-1",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("@/contexts/CheckoutContext", () => ({
  useCheckout: () => ({ setSummaryContent: mocks.summary }),
}));
vi.mock("@/contexts/CartContext", () => ({ useCart: () => ({ cart: null }) }));
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: null, loading: false }),
}));
vi.mock("@/components/checkout/AddressSection", () => ({
  AddressSection: () => null,
}));
vi.mock("@/components/checkout/DeliveryMethodSection", () => ({
  DeliveryMethodSection: () => null,
}));
vi.mock("./CheckoutSidebar", () => ({ CheckoutSidebar: () => null }));
vi.mock("@/components/checkout/PaymentSection", () => ({
  PaymentSection: ({
    ref,
    setProcessing,
    onPaymentComplete,
  }: {
    ref: React.Ref<PaymentSectionHandle>;
    setProcessing: (value: boolean) => void;
    onPaymentComplete: (result: PaymentCompleteResult) => Promise<void>;
  }) => {
    useImperativeHandle(ref, () => ({
      submit: async () => {
        mocks.submitPayment();
        setProcessing(true);
        await onPaymentComplete({
          type: "stripe_live",
          paymentIntentId: "pi_paid",
        });
        return {};
      },
    }));
    return null;
  },
}));
vi.mock("@/lib/analytics/gtm", () => ({
  trackBeginCheckout: vi.fn(),
  trackAddPaymentInfo: vi.fn(),
  trackAddShippingInfo: vi.fn(),
}));
vi.mock("@/lib/data/checkout", () => ({
  getCheckoutOrder: mocks.getOrder,
  applyCode: vi.fn(),
  removeDiscountCode: vi.fn(),
  removeGiftCard: vi.fn(),
  selectDeliveryRate: vi.fn(),
  updateOrderAddresses: vi.fn(),
}));
vi.mock("@/lib/data/stripe-live", () => ({
  finalizeStripeLivePayment: mocks.finalize,
}));
vi.mock("@/lib/data/addresses", () => ({
  getAddresses: vi.fn(),
  updateAddress: vi.fn(),
}));
vi.mock("@/lib/data/cookies", () => ({ isAuthenticated: vi.fn() }));
vi.mock("@/lib/data/countries", () => ({ getCountry: vi.fn() }));
vi.mock("@/lib/data/markets", () => ({
  getMarketCountries: vi.fn(),
  resolveMarket: vi.fn(),
}));
vi.mock("@/lib/data/payment", () => ({
  completeCheckoutOrder: vi.fn(),
  completeCheckoutPaymentSession: vi.fn(),
}));

import { getCachedCompletedOrder } from "@/lib/utils/completed-order-cache";
import { CheckoutPageContent } from "./CheckoutPageContent";

const cart = {
  id: "cart-1",
  items: [{ id: "item-1", quantity: 1 }],
  current_step: "payment",
  completed_at: null,
  fulfillments: [],
  requirements: [],
} as unknown as Cart;
const completed = {
  ...cart,
  current_step: "complete",
  completed_at: "2026-10-13T21:00:00Z",
  number: "R123",
} as Cart;

function renderCheckout() {
  render(
    <CheckoutPageContent
      cartId="cart-1"
      urlCountry="es"
      initialData={{
        cart,
        countries: [],
        savedAddresses: [],
        isAuthenticated: true,
      }}
    />,
  );
}

describe("checkout confirmation after Stripe", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    mocks.getOrder.mockResolvedValue(cart);
    mocks.finalize.mockResolvedValue({
      success: false,
      error: "Confirmation delayed",
    });
  });

  it("opens the confirmation instead of submitting payment when the refreshed order already completed", async () => {
    mocks.getOrder.mockResolvedValue(completed);
    renderCheckout();
    fireEvent.click(screen.getByRole("button", { name: "payNow" }));
    await waitFor(() =>
      expect(mocks.push).toHaveBeenCalledWith("/es/es/order-placed/cart-1"),
    );
    expect(mocks.submitPayment).not.toHaveBeenCalled();
    expect(getCachedCompletedOrder("cart-1")).toMatchObject({ number: "R123" });
  });

  it("leaves the payment form for a reload-safe confirmation route as soon as Stripe accepts", async () => {
    renderCheckout();
    fireEvent.click(screen.getByRole("button", { name: "payNow" }));
    await waitFor(() =>
      expect(mocks.replace).toHaveBeenCalledWith(
        "/es/es/confirm-payment/cart-1?stripe_live=1&payment_intent=pi_paid",
      ),
    );
    expect(mocks.submitPayment).toHaveBeenCalledTimes(1);
    expect(mocks.finalize).not.toHaveBeenCalled();
  });
});
