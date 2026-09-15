"use client";

import type { Category } from "@spree/sdk";
import { ChevronRight, X } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { RegionPreferences } from "@/components/layout/RegionPreferences";
import { Button } from "@/components/ui/button";
import { Sheet, SheetClose, SheetContent, SheetFooter, SheetTitle } from "@/components/ui/sheet";

interface MobileMenuProps { rootCategories: Category[]; basePath: string; wholesaleEnabled: boolean; }

export function MobileMenu({ rootCategories, basePath, wholesaleEnabled }: MobileMenuProps) {
  const t = useTranslations("header");
  const [open, setOpen] = useState(false);
  const [hasInteracted, setHasInteracted] = useState(false);

  const close = () => setOpen(false);
  const linkClass = "block rounded-md px-3 py-2 text-sm text-gray-700 transition-colors hover:bg-gray-50 hover:text-gray-900";
  const summaryClass = "flex w-full cursor-pointer list-none items-center justify-between rounded-md px-3 py-2 text-sm text-gray-700 transition-colors hover:bg-gray-50 hover:text-gray-900";

  const renderCategoryLinks = (categories: Category[], level = 0): React.ReactNode => categories.map((category) => {
    const hasChildren = Boolean(category.children?.length);
    if (!hasChildren) {
      return <Link key={category.id} href={`${basePath}/c/${category.permalink}`} onClick={close} className={linkClass} style={{ paddingLeft: `${12 + level * 12}px` }}>{category.name}</Link>;
    }
    return (
      <details key={category.id} className="group">
        <summary className={summaryClass} style={{ paddingLeft: `${12 + level * 12}px` }}>
          <span className="truncate pr-3">{category.name}</span>
          <ChevronRight className="size-4 shrink-0 text-gray-400 transition-transform group-open:rotate-90" />
        </summary>
        <div className="mt-0.5 flex flex-col gap-0.5 border-l border-gray-200 pl-1">
          <Link href={`${basePath}/c/${category.permalink}`} onClick={close} className={linkClass} style={{ paddingLeft: `${24 + level * 12}px` }}>Ver todo en {category.name}</Link>
          {renderCategoryLinks(category.children ?? [], level + 1)}
        </div>
      </details>
    );
  });

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <Button variant="ghost" size="icon-lg" onClick={() => { setHasInteracted(true); setOpen((value) => !value); }} aria-label={open ? t("closeMenu") : t("openMenu")} className="relative z-[60] cursor-pointer">
        <div className="relative h-5 w-5">
          <span className={`absolute left-0 right-0 top-[2px] h-0.5 rounded-full bg-current ${hasInteracted ? (open ? "animate-hamburger-top-open" : "animate-hamburger-top-close") : ""}`} />
          <span className={`absolute left-0 right-0 top-1/2 h-0.5 -translate-y-1/2 rounded-full bg-current ${hasInteracted ? (open ? "animate-hamburger-mid-open" : "animate-hamburger-mid-close") : ""}`} />
          <span className={`absolute bottom-[2px] left-0 right-0 h-0.5 rounded-full bg-current ${hasInteracted ? (open ? "animate-hamburger-bottom-open" : "animate-hamburger-bottom-close") : ""}`} />
        </div>
      </Button>

      <SheetContent side="left" className="flex flex-col !gap-0 !rounded-none overflow-hidden max-md:!top-16 max-md:!h-[calc(100%-4rem)] max-md:!w-full max-md:!max-w-none max-md:!border-r-0" showCloseButton={false} overlayClassName="max-md:!top-16 max-md:!bg-transparent">
        <SheetTitle className="sr-only">{t("menu")}</SheetTitle>
        <div className="flex h-14 items-center justify-between border-b border-gray-200 px-4">
          <span className="text-sm font-semibold text-gray-900">{t("menu")}</span>
          <Button variant="ghost" size="icon-sm" onClick={close} className="cursor-pointer"><X className="size-4" /></Button>
        </div>

        <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-4 py-2">
          <Link href={basePath || "/"} onClick={close} className={linkClass}>{t("home")}</Link>
          <details className="group">
            <summary className={summaryClass}>
              <span>{t("allProducts")}</span>
              <ChevronRight className="size-4 text-gray-400 transition-transform group-open:rotate-90" />
            </summary>
            <div className="ml-2 mt-0.5 flex flex-col gap-0.5 border-l border-gray-200 pl-1">
              {renderCategoryLinks(rootCategories)}
            </div>
          </details>
          <Link href={`${basePath}/#contact`} onClick={close} className={linkClass}>{t("contact")}</Link>
          <div className="mt-2 border-t border-gray-200 pt-2">
            {wholesaleEnabled && <Link href={`${basePath}/wholesale`} onClick={close} className={linkClass}>{t("wholesale")}</Link>}
            <SheetClose asChild><Link href={`${basePath}/account`} className={linkClass}>{t("myAccount")}</Link></SheetClose>
          </div>
        </nav>
        <SheetFooter className="items-center gap-2 border-t border-gray-200 pt-3 lg:hidden"><RegionPreferences variant="menu" /></SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
