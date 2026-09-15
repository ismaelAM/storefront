"use client";

import type { Category } from "@spree/sdk";
import { ArrowLeft, ChevronRight, X } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { flushSync } from "react-dom";
import { RegionPreferences } from "@/components/layout/RegionPreferences";
import { Button } from "@/components/ui/button";
import { Sheet, SheetClose, SheetContent, SheetFooter, SheetTitle } from "@/components/ui/sheet";

type PanelType = { kind: "main" } | { kind: "category"; category: Category };

interface MobileMenuProps { rootCategories: Category[]; basePath: string; wholesaleEnabled: boolean; }

export function MobileMenu({ rootCategories, basePath, wholesaleEnabled }: MobileMenuProps) {
  const t = useTranslations("header");
  const [open, setOpen] = useState(false);
  const [hasInteracted, setHasInteracted] = useState(false);
  const [panelStack, setPanelStack] = useState<PanelType[]>([{ kind: "main" }]);
  const [animatedIndex, setAnimatedIndex] = useState(0);
  const rafRef = useRef<number | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const currentPanel = panelStack[panelStack.length - 1];

  const cancelPendingCallbacks = () => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    if (timeoutRef.current !== null) clearTimeout(timeoutRef.current);
    rafRef.current = null;
    timeoutRef.current = null;
  };

  const pushPanel = (panel: PanelType) => {
    cancelPendingCallbacks();
    flushSync(() => setPanelStack((prev) => [...prev, panel]));
    rafRef.current = requestAnimationFrame(() => setAnimatedIndex((prev) => prev + 1));
  };

  const popPanel = () => {
    cancelPendingCallbacks();
    setAnimatedIndex((prev) => Math.max(0, prev - 1));
    timeoutRef.current = setTimeout(() => setPanelStack((prev) => (prev.length > 1 ? prev.slice(0, -1) : prev)), 300);
  };

  const handleOpenChange = (value: boolean) => {
    setOpen(value);
    if (!value) {
      cancelPendingCallbacks();
      setPanelStack([{ kind: "main" }]);
      setAnimatedIndex(0);
    }
  };

  const linkClass = "text-left text-gray-700 hover:text-gray-900 hover:bg-gray-50 rounded-lg px-3 py-2.5 text-base transition-colors";
  const categoryButtonClass = "flex items-center justify-between w-full text-left text-gray-700 hover:text-gray-900 hover:bg-gray-50 rounded-lg px-3 py-2.5 text-base transition-colors";

  const renderCategories = (categories: Category[], level = 0): React.ReactNode => categories.map((category) => {
    const hasChildren = Boolean(category.children?.length);
    if (hasChildren) {
      return (
        <button
          key={category.id}
          type="button"
          onClick={() => pushPanel({ kind: "category", category })}
          className={categoryButtonClass}
          style={{ paddingLeft: `${12 + level * 16}px` }}
        >
          <span>{category.name}</span>
          <ChevronRight className="h-4 w-4 text-gray-400" />
        </button>
      );
    }

    return (
      <Link
        key={category.id}
        href={`${basePath}/c/${category.permalink}`}
        onClick={() => setOpen(false)}
        className={`${linkClass} block`}
        style={{ paddingLeft: `${12 + level * 16}px` }}
      >
        {category.name}
      </Link>
    );
  });

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <Button variant="ghost" size="icon-lg" onClick={() => { if (!hasInteracted) setHasInteracted(true); setOpen(!open); }} aria-label={open ? t("closeMenu") : t("openMenu")} className="relative z-[60] cursor-pointer">
        <div className="relative h-5 w-5">
          <span className={`absolute left-0 right-0 top-[2px] h-0.5 rounded-full bg-current ${hasInteracted ? (open ? "animate-hamburger-top-open" : "animate-hamburger-top-close") : ""}`} />
          <span className={`absolute left-0 right-0 top-1/2 h-0.5 -translate-y-1/2 rounded-full bg-current ${hasInteracted ? (open ? "animate-hamburger-mid-open" : "animate-hamburger-mid-close") : ""}`} />
          <span className={`absolute bottom-[2px] left-0 right-0 h-0.5 rounded-full bg-current ${hasInteracted ? (open ? "animate-hamburger-bottom-open" : "animate-hamburger-bottom-close") : ""}`} />
        </div>
      </Button>

      <SheetContent side="left" className="flex flex-col !gap-0 !rounded-none overflow-hidden max-md:!top-16 max-md:!h-[calc(100%-4rem)] max-md:!w-full max-md:!max-w-none max-md:!border-r-0" showCloseButton={false} overlayClassName="max-md:!top-16 max-md:!bg-transparent">
        <SheetTitle className="sr-only">{t("menu")}</SheetTitle>
        <div className="hidden md:flex h-16 items-center justify-between border-b border-gray-200 px-4">
          {currentPanel.kind === "main" ? <span className="text-base font-semibold">{t("menu")}</span> : <button type="button" onClick={popPanel} className="flex items-center gap-2 text-base font-semibold text-gray-700"><ArrowLeft className="h-5 w-5" /><span>{currentPanel.category.name}</span></button>}
          <Button variant="ghost" size="icon-sm" onClick={() => setOpen(false)} className="ml-auto cursor-pointer"><X className="size-4" /></Button>
        </div>

        <div className="relative flex-1 overflow-hidden">
          <div className={`absolute inset-0 flex flex-col bg-white transition-transform duration-300 ease-in-out ${animatedIndex === 0 && currentPanel.kind === "main" ? "translate-x-0" : "-translate-x-full"}`}>
            <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-4 pt-2">
              {renderCategories(rootCategories)}
              <Link href={`${basePath}/#contact`} onClick={() => setOpen(false)} className={linkClass}>{t("contact")}</Link>
              <div className="mt-2 border-t border-gray-200 pt-2">
                {wholesaleEnabled && <Link href={`${basePath}/wholesale`} onClick={() => setOpen(false)} className={`${linkClass} block`}>{t("wholesale")}</Link>}
                <SheetClose asChild><Link href={`${basePath}/account`} className={`${linkClass} block`}>{t("myAccount")}</Link></SheetClose>
              </div>
            </nav>
            <SheetFooter className="items-center gap-2 border-t border-gray-200 pt-4 lg:hidden"><RegionPreferences variant="menu" /></SheetFooter>
          </div>

          {panelStack.map((panel, index) => {
            if (panel.kind !== "category") return null;
            const isAnimatedIn = index <= animatedIndex;
            const translateClass = !isAnimatedIn ? "translate-x-full" : index < panelStack.length - 1 ? "-translate-x-full" : "translate-x-0";
            return (
              <div key={`cat-${panel.category.id}-${index}`} className={`absolute inset-0 flex flex-col bg-white transition-transform duration-300 ease-in-out ${translateClass}`}>
                <div className="border-b border-gray-200 px-4 py-2 md:hidden"><button type="button" onClick={popPanel} className="flex items-center gap-2 py-2 text-base font-medium text-gray-700"><ArrowLeft className="h-5 w-5" /><span>{panel.category.name}</span></button></div>
                <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-4 pt-2">
                  {panel.category.children?.map((child) => child.children?.length ? (
                    <button key={child.id} type="button" onClick={() => pushPanel({ kind: "category", category: child })} className={categoryButtonClass}><span>{child.name}</span><ChevronRight className="h-4 w-4 text-gray-400" /></button>
                  ) : <Link key={child.id} href={`${basePath}/c/${child.permalink}`} onClick={() => handleOpenChange(false)} className={linkClass}>{child.name}</Link>)}
                </nav>
                <div className="border-t border-gray-200 px-4 py-3"><Link href={`${basePath}/c/${panel.category.permalink}`} onClick={() => handleOpenChange(false)} className="block w-full py-2 text-center text-sm text-gray-500 transition-colors hover:text-gray-900">{t("viewAllCategory", { category: panel.category.name })}</Link></div>
              </div>
            );
          })}
        </div>
      </SheetContent>
    </Sheet>
  );
}
