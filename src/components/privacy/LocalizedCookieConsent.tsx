import { NextIntlClientProvider } from "next-intl";
import {
  DEFAULT_LOCALE,
  loadMessages,
  resolveSupportedLocale,
} from "@/i18n/locales";
import { CookieConsent } from "./CookieConsent";

/** DocumentShell sits outside the storefront's locale providers. */
export async function LocalizedCookieConsent({
  locale,
  gtmId,
}: {
  locale: string;
  gtmId: string;
}) {
  const supportedLocale = resolveSupportedLocale(locale) ?? DEFAULT_LOCALE;
  const messages = await loadMessages(supportedLocale);
  return (
    <NextIntlClientProvider
      locale={supportedLocale}
      messages={{ cookies: messages.cookies }}
    >
      <CookieConsent gtmId={gtmId} />
    </NextIntlClientProvider>
  );
}
