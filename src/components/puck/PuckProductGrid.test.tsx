import type { Product } from "@spree/sdk";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PuckProductGrid } from "./PuckProductGrid";
import { PuckProductsProvider } from "./PuckProductsContext";

vi.mock("./ProductCard", () => ({
  ProductCard: ({ name, url }: { name: string; url: string }) => <a href={url}>{name}</a>,
}));
afterEach(cleanup);

const catalogItem = {
  id: "prod_catalog", name: "Producto del catálogo", slug: "producto-catalogo",
  purchasable: false, price: { display_amount: "12,34 €" },
} as Product;
const sale = {
  id: "prod_offer", name: "Oferta del día", slug: "oferta",
  price: { display_amount: "10,00 €", display_compare_at_amount: "15,00 €" },
} as Product;

describe("Puck catalog and merchandising pools", () => {
  it("shows the general catalog even when there are no daily offers or preorders", () => {
    render(<PuckProductsProvider products={[]} catalogProducts={[catalogItem]} basePath="/es/es">
      <PuckProductGrid title="Catálogo" productFilter="all" />
    </PuckProductsProvider>);
    expect(screen.getByRole("link", { name: catalogItem.name })).toHaveAttribute("href", "/es/es/products/producto-catalogo");
  });
  it("keeps offers restricted to their curated merchandising pool", () => {
    render(<PuckProductsProvider products={[sale]} catalogProducts={[{ ...sale, id: "prod_other", name: "Otra rebaja" }]} basePath="/es/es">
      <PuckProductGrid productFilter="sale" />
    </PuckProductsProvider>);
    expect(screen.getByRole("link", { name: sale.name })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Otra rebaja" })).not.toBeInTheDocument();
  });
  it("does not label a catalog item without stock as available", () => {
    render(<PuckProductsProvider products={[]} catalogProducts={[catalogItem]} basePath="/es/es">
      <PuckProductGrid productFilter="available" />
    </PuckProductsProvider>);
    expect(screen.queryByRole("link", { name: catalogItem.name })).not.toBeInTheDocument();
  });
});
