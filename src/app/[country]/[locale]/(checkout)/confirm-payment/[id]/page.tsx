"use client";

import { Loader2 } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { use, useEffect, useRef, useState } from "react";
import { useCheckout } from "@/contexts/CheckoutContext";
import { confirmPaymentAndCompleteCart } from "@/lib/data/payment";
import { finalizeStripeLivePayment } from "@/lib/data/stripe-live";
import { extractBasePath } from "@/lib/utils/path";

interface ConfirmPaymentPageProps {
  params: Promise<{
    id: string;
    country: string;
    locale: string;
  }>;
}

/**
 * Intermediate page that offsite payment gateways redirect to.
 *
 * When a customer returns from an offsite gateway (e.g. Stripe 3D Secure,
 * Adyen Klarna/iDEAL), the payment webhook may not have arrived yet. This page:
 * 1. Tries to complete the payment session (tells Spree to check with the provider)
 * 2. If successful, completes the order and redirects to order-placed
 * 3. Stripe Live stays here on delayed confirmation, so retries and reloads
 *    cannot submit the accepted payment again. Other gateways return errors
 *    to checkout.
 */
export default function ConfirmPaymentPage({
  params,
}: ConfirmPaymentPageProps) {
  const { id: cartId } = use(params);
  const t = useTranslations("checkout");
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const basePath = extractBasePath(pathname);
  const { setSummaryContent } = useCheckout();
  const [attempt, setAttempt] = useState(0);
  const [checking, setChecking] = useState(true);
  const [confirmationFailed, setConfirmationFailed] = useState(false);
  const [paymentAccepted, setPaymentAccepted] = useState(false);
  const attemptedRef = useRef<number | null>(null);

  useEffect(() => {
    if (attemptedRef.current === attempt) return;
    attemptedRef.current = attempt;
    setSummaryContent(null);

    // Stripe: ?session={spreeSessionId}
    // Adyen:  ?sessionId={adyenSessionId}&redirectResult=...
    const stripeLive = searchParams.get("stripe_live") === "1";
    const stripePaymentIntentId = searchParams.get("payment_intent");
    const sessionId = searchParams.get("session");
    const sessionResult = searchParams.get("sessionResult");
    const redirectResult = searchParams.get("redirectResult");
    const adyenSessionId = searchParams.get("sessionId");

    async function confirmAndRedirect() {
      if (stripeLive && stripePaymentIntentId) {
        try {
          const liveResult = await finalizeStripeLivePayment(
            cartId,
            stripePaymentIntentId,
          );
          if (liveResult.success) {
            if (liveResult.order) {
              const { cacheCompletedOrder } = await import(
                "@/lib/utils/completed-order-cache"
              );
              cacheCompletedOrder(cartId, liveResult.order);
            }
            router.replace(`${basePath}/order-placed/${cartId}`);
          } else if (liveResult.paymentFailed) {
            // Only a server-verified unsuccessful payment may return to the
            // payment form. Unknown failures must remain confirmation-only.
            const errorMessage = encodeURIComponent(
              liveResult.error || t("paymentError"),
            );
            router.replace(
              `${basePath}/checkout/${cartId}?payment_error=${errorMessage}`,
            );
          } else {
            setPaymentAccepted(liveResult.paymentAccepted);
            setConfirmationFailed(true);
            setChecking(false);
          }
        } catch {
          setConfirmationFailed(true);
          setChecking(false);
        }
        return;
      }

      const result = await confirmPaymentAndCompleteCart(
        cartId,
        sessionId ?? undefined,
        sessionResult ?? undefined,
        redirectResult ?? undefined,
        adyenSessionId ?? undefined,
      );

      if (result.success) {
        // Cache the completed order for the thank-you page
        if (result.order) {
          const { cacheCompletedOrder } = await import(
            "@/lib/utils/completed-order-cache"
          );
          cacheCompletedOrder(cartId, result.order);
        }

        router.replace(`${basePath}/order-placed/${cartId}`);
      } else {
        const errorMessage = encodeURIComponent(
          result.error || t("paymentError"),
        );
        router.replace(
          `${basePath}/checkout/${cartId}?payment_error=${errorMessage}`,
        );
      }
    }

    confirmAndRedirect();
  }, [cartId, searchParams, basePath, router, t, attempt, setSummaryContent]);

  if (confirmationFailed || paymentAccepted) {
    return (
      <div className="rounded-xl border border-gray-200 bg-gray-50 p-6 text-center">
        <div role="status" className="space-y-2">
          <h1 className="text-xl font-semibold text-gray-900">
            {t("orderConfirmationPending")}
          </h1>
          {paymentAccepted && (
            <p className="text-sm text-gray-700">{t("paymentAccepted")}</p>
          )}
        </div>
        {confirmationFailed && (
          <p role="alert" className="mt-4 text-sm text-gray-700">
            {t("orderConfirmationDelayed")}
          </p>
        )}
        <button
          type="button"
          className="mt-6 inline-flex items-center justify-center gap-2 rounded-lg bg-black px-5 py-3 text-sm font-semibold text-white disabled:opacity-50"
          disabled={checking}
          onClick={() => {
            setChecking(true);
            setConfirmationFailed(false);
            setAttempt((value) => value + 1);
          }}
        >
          {checking && <Loader2 className="h-4 w-4 animate-spin" />}
          {checking ? t("confirmingPayment") : t("retryOrderConfirmation")}
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center py-20 gap-4">
      <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      <p className="text-sm text-gray-500">{t("confirmingPayment")}</p>
    </div>
  );
}
