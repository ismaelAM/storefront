import { Children, type ReactElement, type ReactNode, Suspense } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/server", () => ({ connection: vi.fn() }));
vi.mock("@/lib/data/categories", () => ({ cachedGetCategory: vi.fn() }));
vi.mock("@/lib/puck/get-site-page-data", () => ({ getSitePageData: vi.fn() }));
vi.mock("@/lib/puck/get-site-appearance", () => ({
  getSiteAppearance: async () => ({}),
}));
vi.mock("@/components/layout/Header", () => ({
  Header: () => null,
  HeaderMobileMenu: () => null,
}));
vi.mock("@/components/layout/Footer", () => ({
  Footer: () => null,
  FooterCategoryLinks: () => null,
}));

import { Footer } from "@/components/layout/Footer";
import { Header } from "@/components/layout/Header";
import { cachedGetCategory } from "@/lib/data/categories";
import { getSitePageData } from "@/lib/puck/get-site-page-data";
import StorefrontLayout from "./layout";

interface LayoutElementProps {
  children?: ReactNode;
  className?: string;
  mobileNavigation?: ReactElement<{ fallback: ReactNode }>;
  categoryLinks?: ReactElement<{ fallback: ReactNode }>;
  fallback?: ReactNode;
}

describe("StorefrontLayout", () => {
  beforeEach(() => {
    vi.mocked(cachedGetCategory).mockReset();
    vi.mocked(getSitePageData).mockReset();
    vi.mocked(getSitePageData).mockResolvedValue({ content: [], root: {} });
  });

  async function loadFooterCategories() {
    const layout = await StorefrontLayout({
      children: null,
      params: Promise.resolve({ country: "es", locale: "es" }),
    });
    const footer = Children.toArray(layout.props.children).at(
      -1,
    ) as ReactElement<{
      categoryLinks: ReactElement<{ children: ReactElement }>;
    }>;
    const loader = footer.props.categoryLinks.props.children;
    return (loader.type as (props: unknown) => Promise<ReactElement>)(
      loader.props,
    );
  }

  it("does not issue a second catalogue query when the root-category request fails", async () => {
    vi.mocked(cachedGetCategory).mockRejectedValue(
      new Error("Backend unavailable"),
    );
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    try {
      const result = await loadFooterCategories();
      expect(result.props).toMatchObject({ rootCategories: [] });
      expect(cachedGetCategory).toHaveBeenCalledTimes(1);
    } finally {
      consoleError.mockRestore();
    }
  });

  it("loads just the TCG root and retains the configured labels and visibility", async () => {
    const game = { id: "cat_mtg", name: "Magic: The Gathering", permalink: "tcg/mtg", children: [] };
    const hidden = { id: "cat_pkm", name: "Pokémon", permalink: "tcg/pokemon", children: [] };
    vi.mocked(cachedGetCategory).mockResolvedValue({
      id: "cat_tcg", name: "TCG", permalink: "tcg", children: [game, hidden],
    } as never);
    vi.mocked(getSitePageData).mockResolvedValue({
      content: [{
        type: "Navigation",
        props: { id: "navigation", items: [
          { categoryPermalink: "tcg/pokemon", visible: false },
          { categoryPermalink: "tcg/mtg", visible: true, labelOverride: "Magic" },
          { categoryPermalink: "board_games", visible: true },
        ] },
      }],
      root: {},
    });
    const result = await loadFooterCategories();
    expect(result.props).toMatchObject({ rootCategories: [{ ...game, name: "Magic" }] });
    expect(cachedGetCategory).toHaveBeenCalledExactlyOnceWith(
      "tcg", { expand: ["children"] }, { country: "es", locale: "es" },
    );
  });

  it("skips the editor lookup when the TCG root is missing", async () => {
    vi.mocked(cachedGetCategory).mockResolvedValue(null);
    const result = await loadFooterCategories();
    expect(result.props).toMatchObject({ rootCategories: [] });
    expect(getSitePageData).not.toHaveBeenCalled();
  });

  it("keeps page chrome outside the category navigation Suspense boundaries", async () => {
    const content = <section>Storefront content</section>;
    const layout = (await StorefrontLayout({
      children: content,
      params: Promise.resolve({ country: "us", locale: "en" }),
    })) as ReactElement<LayoutElementProps>;

    expect(layout.type).toBe("div");
    expect(layout.props.className).toContain("min-h-dvh");
    expect(layout.props.className).toContain("flex-col");

    const [header, hiddenNavigation, main, footer] = Children.toArray(
      layout.props.children,
    ) as ReactElement<LayoutElementProps>[];

    expect(header.type).toBe(Header);
    expect(hiddenNavigation.type).toBe(Suspense);
    expect(main.type).toBe("main");
    expect(main.props.className).toContain("flex-1");
    expect(main.props.children).toBe(content);
    expect(footer.type).toBe(Footer);

    const mobileNavigation = header.props.mobileNavigation;
    const categoryLinks = footer.props.categoryLinks;

    expect(mobileNavigation?.type).toBe(Suspense);
    expect(mobileNavigation?.props.fallback).not.toBeNull();
    expect(hiddenNavigation.props.fallback).toBeNull();
    expect(categoryLinks?.type).toBe(Suspense);
    expect(categoryLinks?.props.fallback).not.toBeNull();
  });
});
