"use client";

import {
  Elements,
  PaymentElement,
  useElements,
  useStripe,
} from "@stripe/react-stripe-js";
import { CircleAlert } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { stripePromise } from "@/lib/utils/stripe";

export interface StripePaymentFormHandle {
  confirmPayment: (returnUrl: string) => Promise<{ error?: string }>;
  fetchUpdates: () => Promise<void>;
}

interface StripePaymentFormProps {
  clientSecret: string;
  onReady: (handle: StripePaymentFormHandle) => void;
}

function StripePaymentFormInner({
  onReady,
}: {
  onReady: (handle: StripePaymentFormHandle) => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [error, setError] = useState<string | null>(null);

  const confirmPayment = useCallback(
    async (returnUrl: string) => {
      if (!stripe || !elements) {
        return { error: "Stripe has not loaded yet" };
      }

      setError(null);

      const result = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: returnUrl,
        },
        redirect: "if_required",
      });

      if (result.error) {
        const message =
          result.error.message || "An error occurred during payment.";
        setError(message);
        return { error: message };
      }

      return {};
    },
    [stripe, elements],
  );

  const fetchUpdates = useCallback(async () => {
    if (!elements) return;
    await elements.fetchUpdates();
  }, [elements]);

  useEffect(() => {
    if (stripe && elements) {
      onReady({ confirmPayment, fetchUpdates });
    }
  }, [stripe, elements, confirmPayment, fetchUpdates, onReady]);

  return (
    <div>
      <PaymentElement
        options={{
          layout: "tabs",
        }}
      />
      {error && (
        <Alert variant="destructive" className="mt-3">
          <CircleAlert />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}

export function StripePaymentForm({
  clientSecret,
  onReady,
}: StripePaymentFormProps) {
  return (
    <Elements
      stripe={stripePromise}
      options={{
        clientSecret,
        appearance: {
          theme: "stripe",
          variables: {
            fontFamily: 'Geist, "Geist Fallback", system-ui, sans-serif',
            fontSizeBase: "14px",
            colorPrimary: "#111827",
            colorBackground: "#ffffff",
            colorText: "#111827",
            colorTextSecondary: "#6b7280",
            colorDanger: "#dc2626",
            borderRadius: "8px",
            spacingUnit: "4px",
            focusBoxShadow: "0 0 0 2px rgba(17, 24, 39, 0.12)",
          },
          rules: {
            ".Input": {
              paddingTop: "13px",
              paddingBottom: "13px",
              border: "1px solid #d1d5db",
              boxShadow: "none",
            },
            ".Input:focus": {
              border: "1px solid #111827",
              boxShadow: "0 0 0 2px rgba(17, 24, 39, 0.10)",
            },
            ".Label": {
              color: "#374151",
              fontWeight: "500",
            },
          },
        },
      }}
    >
      <StripePaymentFormInner onReady={onReady} />
    </Elements>
  );
}

/**
 * Confirm payment with a saved card (no Elements/PaymentElement needed).
 */
export async function confirmWithSavedCard(
  clientSecret: string,
  paymentMethodId: string,
  returnUrl: string,
): Promise<{ error?: string }> {
  const stripe = await stripePromise;
  if (!stripe) {
    return { error: "Stripe has not loaded yet" };
  }

  const result = await stripe.confirmCardPayment(clientSecret, {
    payment_method: paymentMethodId,
    return_url: returnUrl,
  });

  if (result.error) {
    return {
      error: result.error.message || "An error occurred during payment.",
    };
  }

  return {};
}
