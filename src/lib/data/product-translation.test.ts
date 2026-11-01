import { SpreeError } from "@spree/sdk";
import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("next/cache", () => ({ cacheLife: vi.fn(), cacheTag: vi.fn() }));
vi.mock("@/lib/spree", () => ({
  getClient: () => ({ products: { get: api.get } }),
}));

import { getProductTranslation } from "./product-translation";

beforeEach(() => vi.resetAllMocks());

describe("public product translation cache", () => {
  it("retains translated fields without carrying prices, inventory or customer data", async () => {
    api.get.mockResolvedValue({
      id: "prod_1",
      name: "Sleeves",
      slug: "sleeves",
      description: "English",
      description_html: "<p>English</p>",
      meta_title: null,
      meta_description: "Card sleeves",
      meta_keywords: null,
      price: { amount: "5.00", currency: "EUR" },
      purchasable: true,
      in_stock: true,
      default_variant: { id: "variant_1" },
    });
    expect(
      await getProductTranslation("prod_1", { country: "es", locale: "en" }),
    ).toEqual({
      name: "Sleeves",
      slug: "sleeves",
      description: "English",
      description_html: "<p>English</p>",
      meta_title: null,
      meta_description: "Card sleeves",
      meta_keywords: null,
    });
    expect(api.get).toHaveBeenCalledWith(
      "prod_1",
      { expand: [] },
      { country: "es", locale: "en" },
    );
  });

  it("carries confirmed missing translations as null across the remote cache", async () => {
    api.get.mockRejectedValue(
      new SpreeError(
        { error: { code: "record_not_found", message: "Missing" } },
        404,
      ),
    );
    await expect(
      getProductTranslation("retired", { country: "es", locale: "en" }),
    ).resolves.toBeNull();
  });

  it.each([
    401, 403, 500,
  ])("does not cache a %s failure as a missing translation", async (status) => {
    const error = new SpreeError(
      { error: { code: "api_failure", message: "Failure" } },
      status,
    );
    api.get.mockRejectedValue(error);
    await expect(
      getProductTranslation("prod_1", { country: "es", locale: "en" }),
    ).rejects.toBe(error);
  });
});
