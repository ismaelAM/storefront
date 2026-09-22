import { describe, expect, it } from "vitest";
import {
  getShippingOperationsSessionValue,
  isShippingOperationsAuthorized,
  isShippingOperationsSessionValue,
  shippingOperationsTokenMatches,
} from "../operations-auth";

const env = {
  SHIPPING_OPERATIONS_TOKEN: "test-shipping-secret",
};

describe("shipping operations auth", () => {
  it("accepts the configured bearer token", () => {
    const request = new Request("https://example.test/api/internal/shipping", {
      headers: {
        authorization: "Bearer test-shipping-secret",
      },
    });

    expect(isShippingOperationsAuthorized(request, env)).toBe(true);
  });

  it("accepts a derived operations session cookie", () => {
    const session = getShippingOperationsSessionValue(env);
    expect(session).toBeTruthy();
    expect(session).not.toBe(env.SHIPPING_OPERATIONS_TOKEN);

    const request = new Request("https://example.test/api/internal/shipping", {
      headers: {
        cookie: `other=value; bison_shipping_ops=${session}`,
      },
    });

    expect(isShippingOperationsAuthorized(request, env)).toBe(true);
  });

  it("rejects incorrect credentials", () => {
    expect(shippingOperationsTokenMatches("wrong", env)).toBe(false);
    expect(isShippingOperationsSessionValue("wrong", env)).toBe(false);

    const request = new Request("https://example.test/api/internal/shipping");
    expect(isShippingOperationsAuthorized(request, env)).toBe(false);
  });

  it("rejects authorization when no token is configured", () => {
    const request = new Request("https://example.test/api/internal/shipping", {
      headers: {
        authorization: "Bearer test-shipping-secret",
      },
    });

    expect(isShippingOperationsAuthorized(request, {})).toBe(false);
  });
});
