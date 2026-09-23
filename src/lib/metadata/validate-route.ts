import { notFound } from "next/navigation";
import { resolveSupportedLocale } from "@/i18n/locales";

/** Reject malformed routes before metadata reads dynamic request/API data. */
export function validateMetadataRoute(country: string, locale: string) {
  if (!/^[a-z]{2}$/i.test(country) || !resolveSupportedLocale(locale)) {
    notFound();
  }
}
