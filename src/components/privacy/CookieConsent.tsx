"use client";

import { GoogleTagManager } from "@next/third-parties/google";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

const CONSENT_KEY = "bison-cookie-consent-v1";
type CookieConsentValue = "accepted" | "rejected";

function clearCommonAnalyticsCookies() {
  const names = ["_ga", "_gid", "_gat", "_gcl_au", "_fbp"];
  for (const name of names) {
    document.cookie = `${name}=; Max-Age=0; path=/; SameSite=Lax`;
  }
}

interface CookieConsentProps {
  gtmId: string;
}

export function CookieConsent({ gtmId }: CookieConsentProps) {
  const t = useTranslations("cookies");
  const pathname = usePathname();
  const [consent, setConsent] = useState<CookieConsentValue | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const stored = window.localStorage.getItem(CONSENT_KEY);
    if (stored === "accepted" || stored === "rejected") {
      setConsent(stored);
    }
    setReady(true);
  }, []);

  const choose = (value: CookieConsentValue) => {
    window.localStorage.setItem(CONSENT_KEY, value);
    if (value === "rejected") {
      clearCommonAnalyticsCookies();
    }
    setConsent(value);
  };

  const reopenPreferences = () => {
    window.localStorage.removeItem(CONSENT_KEY);
    // Reloading guarantees that an analytics container loaded after a previous
    // consent is not kept alive while the user changes their preference.
    window.location.reload();
  };

  const segments = pathname.split("/").filter(Boolean);
  const basePath = segments.length >= 2 ? `/${segments[0]}/${segments[1]}` : "";
  const privacyHref = `${basePath}/policies/privacy-policy`;

  if (!ready) return null;

  return (
    <>
      {consent === "accepted" && <GoogleTagManager gtmId={gtmId} />}

      {consent === null ? (
        <div
          role="dialog"
          aria-label={t("title")}
          aria-live="polite"
          className="fixed inset-x-3 bottom-3 z-[100] mx-auto max-w-3xl rounded-xl border border-gray-200 bg-white p-4 shadow-xl sm:p-5"
        >
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="max-w-2xl">
              <p className="font-semibold text-gray-900">{t("title")}</p>
              <p className="mt-1 text-sm leading-6 text-gray-600">
                {t("description")}{" "}
                <a
                  href={privacyHref}
                  className="font-medium text-gray-900 underline underline-offset-2"
                >
                  {t("learnMore")}
                </a>
              </p>
            </div>
            <div className="flex shrink-0 gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => choose("rejected")}
                className="min-w-28"
              >
                {t("reject")}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => choose("accepted")}
                className="min-w-28"
              >
                {t("accept")}
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={reopenPreferences}
          className="fixed bottom-3 left-3 z-[90] rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 shadow-sm transition-colors hover:text-gray-900"
        >
          {t("preferences")}
        </button>
      )}
    </>
  );
}
