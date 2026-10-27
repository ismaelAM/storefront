// @vitest-environment node
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { commercialPricingProfile } from "../../supabase/functions/_shared/commercial-pricing-policy";
import { supplierVatRate } from "../../supabase/functions/_shared/supplier-pricing-policy";

const source = ts.createSourceFile(
  "index.ts",
  readFileSync("supabase/functions/devir-sync/index.ts", "utf8"),
  ts.ScriptTarget.Latest,
  true,
);
const names = [
  "paymentAwareFloor",
  "competitivePricing",
  "roundUpToProfessionalPrice",
  "isBookSku",
  "isBookProduct",
  "vatRateForSku",
  "specialProgramPrice",
  "specialShippingEligibility",
  "operatorAuthorized",
  "operatorAction",
  "shippingDefaults",
];
const code = ts.transpileModule(
  source.statements
    .filter(
      (n) => ts.isFunctionDeclaration(n) && names.includes(n.name?.text ?? ""),
    )
    .map((n) => n.getText(source))
    .join("\n"),
  { compilerOptions: { target: ts.ScriptTarget.ES2022 } },
).outputText;
function fixture(
  active = true,
  status = "approved",
  storedId = "cus_test",
  storedEmail = "owner@example.test",
) {
  const api = runInNewContext(
    `${code}; ({ paymentAwareFloor, competitivePricing, specialProgramPrice, shippingDefaults, eligibility: typeof specialShippingEligibility === 'function' ? specialShippingEligibility : undefined, operatorAction })`,
    {
      STANDARD_EEA_CARD_RATE: 0.015,
      STANDARD_EEA_CARD_FIXED_EUR: 0.25,
      commercialPricingProfile,
      supplierVatRate,
      minimumOrderRiskSurcharge: () => 0,
      Response,
      json: (body: unknown, status = 200) => Response.json(body, { status }),
      sha256: async (value: string) => value,
      supabase: {
        from: (table: string) => {
          const filters: Record<string, unknown> = {};
          const query = {
            select: () => query,
            eq: (key: string, value: unknown) => {
              filters[key] = value;
              return query;
            },
            maybeSingle: async () => ({
              data:
                table === "special_pricing_programs"
                  ? { active }
                  : filters.status === status &&
                      filters.spree_customer_id === storedId &&
                      filters.email === storedEmail &&
                      filters.program_code === "BISON3"
                    ? { id: "request" }
                    : null,
              error: null,
            }),
          };
          return query;
        },
      },
    },
  );
  return api;
}
const product = {
  sku: "5010996290557",
  name: "Magic Play Booster Display",
  purchasePrice: 50,
  referencePriceNet: null,
};
it("keeps the owner's confirmed Tarkir weight through future supplier synchronization", () => {
  expect(fixture().shippingDefaults("tcg/mtg", product).weight).toBe(1);
  expect(
    fixture().shippingDefaults("tcg/mtg", { ...product, sku: "OTHER" }).weight,
  ).toBe(1.5);
});
describe("Private fixed contribution after tax and card fees", () => {
  it.each([
    0.21, 0.27,
  ])("retains two euros beyond the target contribution at VAT %s", (vat) => {
    const price = fixture().paymentAwareFloor(50, vat, 0.05);
    expect(
      price / (1 + vat) - 50 - price * 0.015 - 0.25 - price * 0.05,
    ).toBeCloseTo(2, 8);
  });
  it("adds the contribution even when the reference-price target already exceeds the floor", () => {
    const result = fixture().competitivePricing(
      { ...product, referencePriceNet: 100 },
      "tcg/mtg",
      0.045,
    );
    const originalTarget = 100 * 1.21 * 0.92;
    expect(
      (result.retail - originalTarget) * (1 / 1.21 - 0.015),
    ).toBeGreaterThanOrEqual(2 - 1e-8);
  });
  it("includes the contribution in approved-account prices", () => {
    const price = fixture().specialProgramPrice(50, 0.05, product.sku);
    expect(
      price / 1.21 - 50 - price * 0.015 - 0.25 - price * 0.05,
    ).toBeGreaterThanOrEqual(2 - 1e-8);
  });
  it("retains fixed-price book behavior", () => {
    const result = fixture().competitivePricing(
      {
        ...product,
        sku: "9781234567890",
        name: "Libro",
        purchasePrice: 6,
        referencePriceNet: 10,
      },
      "manga-comic",
      0.05,
    );
    expect(result.retail).toBe(9.9);
    const price = fixture().specialProgramPrice(6, 0.05, "9781234567890");
    expect(price).toBeCloseTo(
      Math.ceil((6.25 / (1 / 1.04 - 0.015 - 0.05)) * 100) / 100,
    );
  });
});
describe("Live BISON3 shipping eligibility", () => {
  it("accepts only the exact approved current account while active", async () => {
    expect(
      await fixture().eligibility({
        customerId: "cus_test",
        email: "owner@example.test",
      }),
    ).toBe(true);
  });
  it.each(["pending", "rejected"])("rejects %s accounts", async (status) => {
    expect(
      await fixture(true, status).eligibility({
        customerId: "cus_test",
        email: "owner@example.test",
      }),
    ).toBe(false);
  });
  it("rejects disabled programs and mismatched account identity", async () => {
    expect(
      await fixture(false).eligibility({
        customerId: "cus_test",
        email: "owner@example.test",
      }),
    ).toBe(false);
    expect(
      await fixture().eligibility({
        customerId: "cus_other",
        email: "owner@example.test",
      }),
    ).toBe(false);
    expect(
      await fixture().eligibility({
        customerId: "cus_test",
        email: "other@example.test",
      }),
    ).toBe(false);
    expect(await fixture().eligibility({ email: "owner@example.test" })).toBe(
      false,
    );
  });
  it("requires the existing private operator credential and returns only a boolean", async () => {
    const config = { spree_admin_api_key: "fixture_secret" };
    const body = { customerId: "cus_test", email: "owner@example.test" };
    const api = fixture();
    const denied = await api.operatorAction(
      "special-pricing-shipping-eligibility",
      new Request("https://example.test"),
      config,
      body,
    );
    expect(denied.status).toBe(401);
    const allowed = await api.operatorAction(
      "special-pricing-shipping-eligibility",
      new Request("https://example.test", {
        headers: { "x-spree-admin-key": "fixture_secret" },
      }),
      config,
      body,
    );
    expect(await allowed.json()).toEqual({ ok: true, eligible: true });
  });
});
