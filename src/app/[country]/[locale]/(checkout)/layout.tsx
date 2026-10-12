import type { Metadata } from "next";
import CheckoutLayoutClient from "@/components/layout/CheckoutLayoutClient";
import { StoreLogo } from "@/components/layout/StoreLogo";

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function CheckoutLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <CheckoutLayoutClient logo={<StoreLogo />}>{children}</CheckoutLayoutClient>
  );
}
