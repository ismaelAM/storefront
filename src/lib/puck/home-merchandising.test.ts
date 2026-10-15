import type { Product } from "@spree/sdk";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PuckProductGrid } from "@/components/puck/PuckProductGrid";
import { PuckProductsProvider } from "@/components/puck/PuckProductsContext";
import { buildHomeMerchandisingProducts } from "./home-merchandising";

const now = new Date("2026-10-11T12:00:00Z");
function product(id: string, preorder = false, inStock = false): Product {
  return {
    id,
    name: id,
    slug: id,
    thumbnail_url: "https://images.example.com/product.jpg",
    purchasable: true,
    in_stock: inStock,
    preorder,
    tags: preorder
      ? ["devir-preorder"]
      : ["daily-offer", "offer-date:2026-10-11"],
    preorder_ships_at: preorder ? "2026-10-20" : null,
    price: {
      amount: "24.90",
      amount_in_cents: 2490,
      display_amount: "24,90 €",
      compare_at_amount: preorder ? null : "30.00",
      compare_at_amount_in_cents: preorder ? null : 3000,
      display_compare_at_amount: preorder ? null : "30,00 €",
    },
  } as Product;
}
function gridNames(
  products: Product[],
  productFilter: "sale" | "preorder",
): string[] {
  const html = renderToStaticMarkup(
    createElement(PuckProductsProvider, {
      products,
      basePath: "/es/es",
      // biome-ignore lint/correctness/noChildrenProp: createElement typechecks the provider's required children prop here.
      children: createElement(PuckProductGrid, {
        productFilter,
        productCount: "12",
      }),
    }),
  );
  const element = document.createElement("div");
  element.innerHTML = html;
  return Array.from(
    element.querySelectorAll("h3"),
    (heading) => heading.textContent!,
  );
}

describe("Home merchandising pools consumed by Puck", () => {
  it("shows today's social offers without old daily tags or unrelated sales crowding them out", () => {
    const today = Array.from({ length: 12 }, (_, index) =>
      product(`today-${index}`),
    );
    const stale = {
      ...product("yesterday"),
      tags: ["sale", "daily-offer", "offer-date:2026-10-10"],
    };
    const ordinary = { ...product("ordinary-sale"), tags: ["sale"] };
    const pool = buildHomeMerchandisingProducts(
      [stale, ordinary, ...today],
      [],
      now,
    );
    expect(pool).toHaveLength(12);
    expect(gridNames(pool, "sale").sort()).toEqual(
      today.map((item) => item.name).sort(),
    );
  });
  it("uses the Madrid commercial day and supports Saturday's special offers", () => {
    const nextDay = new Date("2026-10-16T22:15:00Z");
    const saturday = {
      ...product("saturday"),
      tags: ["saturday-special", "offer-date:2026-10-17"],
    };
    const expired = {
      ...product("friday"),
      tags: ["daily-offer", "offer-date:2026-10-16"],
    };
    expect(
      buildHomeMerchandisingProducts([expired, saturday], [], nextDay).map(
        (item) => item.id,
      ),
    ).toEqual(["saturday"]);
  });
  it.each([
    false,
    true,
  ])("shows all twelve sale offers alongside plentiful preorders, stock=%s", (withStock) => {
    const sales = Array.from({ length: 12 }, (_, index) =>
      product(`offer-${index}`, false, withStock && index === 0),
    );
    const preorders = Array.from({ length: 20 }, (_, index) =>
      product(`preorder-${index}`, true),
    );
    const pool = buildHomeMerchandisingProducts(sales, preorders, now);
    expect(gridNames(pool, "sale").sort()).toEqual(
      sales.map((sale) => sale.name).sort(),
    );
    expect(gridNames(pool, "preorder")).toHaveLength(12);
    if (withStock) expect(pool[0].id).toBe("offer-0");
  });
  it("keeps independent block limits, unique products and stable rotation", () => {
    const sales = Array.from({ length: 16 }, (_, index) =>
      product(`offer-${index}`, false, index === 0),
    );
    const preorders = Array.from({ length: 20 }, (_, index) =>
      product(`preorder-${index}`, true),
    );
    const pool = buildHomeMerchandisingProducts(
      [...sales, sales[0]],
      [...preorders, preorders[0]],
      now,
    );
    expect(new Set(pool.map((item) => item.id)).size).toBe(pool.length);
    expect(pool[0].id).toBe("offer-0");
    expect(gridNames(pool, "sale")).toHaveLength(12);
    expect(gridNames(pool, "preorder")).toHaveLength(12);
    expect(
      buildHomeMerchandisingProducts(
        sales,
        preorders,
        new Date(now.getTime() + 60_000),
      ),
    ).toEqual(pool);
  });
  it("retains landing safety and genuine upcoming-release protections", () => {
    const manualReview = {
      ...product("review"),
      tags: ["REVISION-HUMANA"],
    } as Product;
    const noDiscount = {
      ...product("no-discount"),
      price: {
        ...product("price").price,
        compare_at_amount: "24.90",
        compare_at_amount_in_cents: 2490,
      },
    } as Product;
    const pastPreorder = {
      ...product("past", true),
      preorder_ships_at: "2026-10-10",
    } as Product;
    const pool = buildHomeMerchandisingProducts(
      [
        product("valid", false, true),
        manualReview,
        noDiscount,
        { ...product("unavailable"), purchasable: false },
        { ...product("no-image"), thumbnail_url: "" },
      ],
      [product("upcoming", true), pastPreorder],
      now,
    );
    expect(pool.map((item) => item.id)).toEqual(["valid", "upcoming"]);
  });
});
