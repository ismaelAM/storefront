import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { Suspense } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockReplace = vi.fn();
const mockSummary = vi.fn();
let mockSearchParams = new URLSearchParams();

vi.mock("next-intl", async () => {
  const actual = await vi.importActual("next-intl");
  return {
    ...actual,
    useTranslations: () => (key: string) => key,
  };
});

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: mockReplace,
    refresh: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => "/us/en/confirm-payment/cart-1",
  useSearchParams: () => mockSearchParams,
}));

vi.mock("@/lib/data/payment", () => ({
  confirmPaymentAndCompleteCart: vi.fn(),
}));

vi.mock("@/contexts/CheckoutContext", () => ({
  useCheckout: () => ({ setSummaryContent: mockSummary }),
}));

vi.mock("@/lib/data/stripe-live", () => ({
  finalizeStripeLivePayment: vi.fn(),
}));

vi.mock("@/lib/utils/path", () => ({
  extractBasePath: (path: string) => {
    const match = path.match(/^\/[^/]+\/[^/]+/);
    return match ? match[0] : "";
  },
}));

import { confirmPaymentAndCompleteCart } from "@/lib/data/payment";
import { finalizeStripeLivePayment } from "@/lib/data/stripe-live";
import ConfirmPaymentPage from "../[id]/page";

const mockConfirm = vi.mocked(confirmPaymentAndCompleteCart);
const mockFinalizeStripeLive = vi.mocked(finalizeStripeLivePayment);

function renderPage(params = { id: "cart-1", country: "us", locale: "en" }) {
  const resolvedParams = Promise.resolve(params);
  return render(
    <Suspense fallback={<div>suspense-fallback</div>}>
      <ConfirmPaymentPage params={resolvedParams} />
    </Suspense>,
  );
}

describe("ConfirmPaymentPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSearchParams = new URLSearchParams();
  });

  it("shows loading spinner", async () => {
    mockConfirm.mockReturnValue(new Promise(() => {})); // never resolves

    await act(async () => {
      renderPage();
    });

    expect(screen.getByText("confirmingPayment")).toBeInTheDocument();
  });

  it("redirects to order-placed on success", async () => {
    mockSearchParams.set("session", "session-1");
    mockConfirm.mockResolvedValue({
      success: true as const,
      order: { id: "cart-1" },
    });

    await act(async () => {
      renderPage();
    });

    await waitFor(() => {
      expect(mockConfirm).toHaveBeenCalledWith(
        "cart-1",
        "session-1",
        undefined,
        undefined,
        undefined,
      );
      expect(mockReplace).toHaveBeenCalledWith("/us/en/order-placed/cart-1");
    });
  });

  it("passes sessionResult query param to confirmPaymentAndCompleteCart", async () => {
    mockSearchParams.set("session", "session-1");
    mockSearchParams.set("sessionResult", "eyJhYmMiOiJ4eXoifQ==");
    mockConfirm.mockResolvedValue({
      success: true as const,
      order: { id: "cart-1" },
    });

    await act(async () => {
      renderPage();
    });

    await waitFor(() => {
      expect(mockConfirm).toHaveBeenCalledWith(
        "cart-1",
        "session-1",
        "eyJhYmMiOiJ4eXoifQ==",
        undefined,
        undefined,
      );
    });
  });

  it("finalizes Stripe Live payments before redirecting", async () => {
    mockSearchParams.set("stripe_live", "1");
    mockSearchParams.set("payment_intent", "pi_live_1");
    mockFinalizeStripeLive.mockResolvedValue({
      success: true as const,
      order: { id: "cart-1" },
    });

    await act(async () => {
      renderPage();
    });

    await waitFor(() => {
      expect(mockFinalizeStripeLive).toHaveBeenCalledWith(
        "cart-1",
        "pi_live_1",
      );
      expect(mockConfirm).not.toHaveBeenCalled();
      expect(mockReplace).toHaveBeenCalledWith("/us/en/order-placed/cart-1");
    });
  });

  it("stays out of checkout and retries only reconciliation for an accepted Stripe payment", async () => {
    mockSearchParams = new URLSearchParams(
      "stripe_live=1&payment_intent=pi_paid",
    );
    mockFinalizeStripeLive.mockResolvedValue({
      success: false,
      error: "Spree delayed",
      paymentAccepted: true,
      paymentFailed: false,
    });
    await act(async () => {
      renderPage();
    });
    const retry = await screen.findByRole("button", {
      name: "retryOrderConfirmation",
    });
    expect(screen.getByText("paymentAccepted")).toBeInTheDocument();
    expect(mockSummary).toHaveBeenCalledWith(null);
    expect(mockReplace).not.toHaveBeenCalled();
    mockFinalizeStripeLive.mockResolvedValue({
      success: true,
      order: { id: "cart-1" },
    });
    fireEvent.click(retry);
    await waitFor(() =>
      expect(mockReplace).toHaveBeenCalledWith("/us/en/order-placed/cart-1"),
    );
    expect(mockFinalizeStripeLive).toHaveBeenNthCalledWith(
      2,
      "cart-1",
      "pi_paid",
    );
    expect(mockConfirm).not.toHaveBeenCalled();
  });

  it("resumes confirmation from the URL after a reload without returning to the payment form", async () => {
    mockSearchParams = new URLSearchParams(
      "stripe_live=1&payment_intent=pi_paid",
    );
    mockFinalizeStripeLive.mockResolvedValue({
      success: false,
      error: "Spree delayed",
      paymentAccepted: true,
      paymentFailed: false,
    });
    let view: ReturnType<typeof renderPage>;
    await act(async () => {
      view = renderPage();
    });
    await screen.findByRole("button", { name: "retryOrderConfirmation" });
    view!.unmount();
    await act(async () => {
      renderPage();
    });
    await screen.findByRole("button", { name: "retryOrderConfirmation" });
    expect(mockFinalizeStripeLive).toHaveBeenCalledTimes(2);
    expect(mockReplace).not.toHaveBeenCalled();
    expect(mockConfirm).not.toHaveBeenCalled();
  });

  it("does not claim acceptance for a failed or unauthorized Stripe payment", async () => {
    mockSearchParams = new URLSearchParams(
      "stripe_live=1&payment_intent=pi_wrong",
    );
    mockFinalizeStripeLive.mockResolvedValue({
      success: false,
      error: "Not authorized",
      paymentAccepted: false,
      paymentFailed: false,
    });
    await act(async () => {
      renderPage();
    });
    await screen.findByRole("button", { name: "retryOrderConfirmation" });
    expect(mockReplace).not.toHaveBeenCalled();
    expect(screen.queryByText("paymentAccepted")).not.toBeInTheDocument();
  });

  it("returns a verified unsuccessful payment to checkout for correction", async () => {
    mockSearchParams = new URLSearchParams(
      "stripe_live=1&payment_intent=pi_failed",
    );
    mockFinalizeStripeLive.mockResolvedValue({
      success: false,
      error: "Payment failed",
      paymentAccepted: false,
      paymentFailed: true,
    });
    await act(async () => {
      renderPage();
    });
    await waitFor(() =>
      expect(mockReplace).toHaveBeenCalledWith(
        "/us/en/checkout/cart-1?payment_error=Payment%20failed",
      ),
    );
  });

  it("redirects to checkout with error on failure", async () => {
    mockSearchParams.set("session", "session-1");
    mockConfirm.mockResolvedValue({
      success: false as const,
      error: "Payment declined",
    });

    await act(async () => {
      renderPage();
    });

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith(
        "/us/en/checkout/cart-1?payment_error=Payment%20declined",
      );
    });
  });

  it("passes undefined session when no query param", async () => {
    mockConfirm.mockResolvedValue({
      success: true as const,
      order: { id: "cart-1" },
    });

    await act(async () => {
      renderPage();
    });

    await waitFor(() => {
      expect(mockConfirm).toHaveBeenCalledWith(
        "cart-1",
        undefined,
        undefined,
        undefined,
        undefined,
      );
      expect(mockReplace).toHaveBeenCalledWith("/us/en/order-placed/cart-1");
    });
  });

  it("uses fallback error message when none provided", async () => {
    mockSearchParams.set("session", "session-1");
    mockConfirm.mockResolvedValue({
      success: false as const,
      error: "",
    });

    await act(async () => {
      renderPage();
    });

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith(
        expect.stringContaining(
          "/us/en/checkout/cart-1?payment_error=paymentError",
        ),
      );
    });
  });

  it("only calls confirm once (idempotent)", async () => {
    mockSearchParams.set("session", "session-1");
    mockConfirm.mockResolvedValue({
      success: true as const,
      order: { id: "cart-1" },
    });

    let result: ReturnType<typeof renderPage>;
    await act(async () => {
      result = renderPage();
    });

    // Re-render to simulate React strict mode double-effect
    await act(async () => {
      result!.rerender(
        <Suspense fallback={<div>suspense-fallback</div>}>
          <ConfirmPaymentPage
            params={Promise.resolve({
              id: "cart-1",
              country: "us",
              locale: "en",
            })}
          />
        </Suspense>,
      );
    });

    await waitFor(() => {
      expect(mockConfirm).toHaveBeenCalledTimes(1);
    });
  });
});
