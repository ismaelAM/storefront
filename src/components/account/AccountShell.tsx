"use client";

import type { LucideIcon } from "lucide-react";
import {
  CreditCard,
  Gift,
  Home,
  LogOut,
  MapPin,
  ShoppingBag,
  User,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { extractBasePath } from "@/lib/utils/path";

const ACCOUNT_SKELETON_NAV = ["overview", "orders", "addresses", "payment", "gifts", "profile"];
const ACCOUNT_SKELETON_CARDS = ["orders", "addresses", "payment", "profile"];

function getNavItems(t: ReturnType<typeof useTranslations<"account">>): {
  href: string;
  label: string;
  icon: LucideIcon;
}[] {
  return [
    { href: "/account", label: t("overview"), icon: Home },
    { href: "/account/orders", label: t("orders"), icon: ShoppingBag },
    { href: "/account/addresses", label: t("addresses"), icon: MapPin },
    {
      href: "/account/credit-cards",
      label: t("paymentMethods"),
      icon: CreditCard,
    },
    { href: "/account/gift-cards", label: t("giftCards"), icon: Gift },
    { href: "/account/profile", label: t("profile"), icon: User },
  ];
}

export function AccountShellSkeleton() {
  return (
    <div
      aria-hidden="true"
      className="container mx-auto px-4 py-10 sm:px-6 sm:py-12 lg:px-8 lg:py-14"
    >
      <div className="grid gap-8 xl:grid-cols-[minmax(15rem,18rem)_minmax(0,1fr)] xl:gap-12">
        <div className="overflow-hidden rounded-2xl border border-border bg-card">
          <div className="space-y-3 border-b border-border p-5 sm:p-6">
            <div className="h-5 w-36 rounded bg-muted" />
            <div className="h-4 w-48 max-w-full rounded bg-muted/60" />
          </div>
          <div className="grid gap-2 p-3 sm:grid-cols-2 sm:p-4 xl:grid-cols-1">
            {ACCOUNT_SKELETON_NAV.map((item) => (
              <div key={item} className="h-12 rounded-xl bg-muted/60" />
            ))}
          </div>
          <div className="border-t border-border p-3 sm:p-4">
            <div className="h-11 rounded-xl bg-muted/60" />
          </div>
        </div>

        <div className="min-w-0 space-y-6">
          <div className="h-9 w-56 max-w-[75%] rounded bg-muted" />
          <div className="grid gap-5 md:grid-cols-2 sm:gap-6">
            {ACCOUNT_SKELETON_CARDS.map((item) => (
              <div
                key={item}
                className="min-h-32 rounded-xl border border-border bg-card p-6"
              >
                <div className="h-6 w-2/3 rounded bg-muted" />
                <div className="mt-4 h-4 w-full rounded bg-muted/60" />
                <div className="mt-2 h-4 w-4/5 rounded bg-muted/60" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function AccountShell({ children }: { children: React.ReactNode }) {
  const t = useTranslations("account");
  const pathname = usePathname();
  const router = useRouter();
  const basePath = extractBasePath(pathname);
  const { user, logout } = useAuth();
  const navItems = getNavItems(t);

  const handleLogout = async () => {
    await logout();
    router.replace(`${basePath}/account`);
  };

  return (
    <div className="container mx-auto px-4 py-10 sm:px-6 sm:py-12 lg:px-8 lg:py-14">
      <div className="grid gap-8 xl:grid-cols-[minmax(15rem,18rem)_minmax(0,1fr)] xl:gap-12">
        <aside className="min-w-0">
          <div className="overflow-hidden rounded-2xl border border-border bg-white">
            <div className="border-b border-border p-5 sm:p-6">
              <p className="font-semibold text-foreground">
                {user?.first_name
                  ? `${user.first_name} ${user.last_name || ""}`.trim()
                  : t("myAccount")}
              </p>
              <p className="mt-1 truncate text-sm text-muted-foreground">
                {user?.email}
              </p>
            </div>

            <nav className="p-3 sm:p-4">
              <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
                {navItems.map((item) => {
                  const href = `${basePath}${item.href}`;
                  const isActive =
                    pathname === href ||
                    (item.href !== "/account" && pathname.startsWith(href));

                  return (
                    <li key={item.href} className="min-w-0">
                      <Link
                        href={href}
                        className={`flex min-h-12 min-w-0 items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-colors ${
                          isActive
                            ? "bg-gray-50 text-primary"
                            : "text-gray-700 hover:bg-gray-50"
                        }`}
                      >
                        <item.icon className="h-5 w-5 shrink-0" />
                        <span className="min-w-0 leading-5">{item.label}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </nav>

            <div className="border-t border-border p-3 sm:p-4">
              <Button
                variant="ghost"
                onClick={handleLogout}
                className="min-h-11 w-full justify-start px-4"
              >
                <LogOut className="h-5 w-5" />
                {t("signOut")}
              </Button>
            </div>
          </div>
        </aside>

        <main className="min-w-0">{children}</main>
      </div>
    </div>
  );
}
