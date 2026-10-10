import CheckoutLayoutClient from "@/components/layout/CheckoutLayoutClient";
import { StoreLogo } from "@/components/layout/StoreLogo";

export default function CheckoutLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <CheckoutLayoutClient logo={<StoreLogo />}>{children}</CheckoutLayoutClient>
  );
}
