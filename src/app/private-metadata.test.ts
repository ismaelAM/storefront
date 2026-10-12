import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/puck/get-site-page-data", () => ({ getSitePageData: vi.fn() }));
vi.mock("./[country]/[locale]/(storefront)/cart/CartClient", () => ({
  default: () => null,
}));
vi.mock("@/components/layout/CheckoutLayoutClient", () => ({
  default: () => null,
}));
vi.mock("@/components/layout/StoreLogo", () => ({ StoreLogo: () => null }));

describe("private route indexing", () => {
  it("marks cart pages noindex", async () => {
    const page = await import("./[country]/[locale]/(storefront)/cart/page");
    expect((page as { metadata?: unknown }).metadata).toMatchObject({
      robots: { index: false },
    });
  });
  it("marks the complete checkout route group noindex", async () => {
    const layout = await import("./[country]/[locale]/(checkout)/layout");
    expect((layout as { metadata?: unknown }).metadata).toMatchObject({
      robots: { index: false },
    });
  });
  it("marks the complete account subtree noindex", async () => {
    const layout = await import(
      "./[country]/[locale]/(storefront)/account/layout"
    );
    expect(layout.metadata).toMatchObject({ robots: { index: false } });
  });
});
