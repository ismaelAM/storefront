import { afterEach, describe, expect, it, vi } from "vitest";
import { getSpanishLegalPolicy } from "./spain";

afterEach(() => vi.unstubAllEnvs());

describe("public Spanish policies", () => {
  it("does not disclose a configured personal tax identifier", () => {
    vi.stubEnv("LEGAL_TAX_ID", "PRIVATE-IDENTIFIER-FOR-TEST");
    for (const slug of [
      "privacy-policy",
      "terms-of-service",
      "returns-policy",
      "shipping-policy",
    ]) {
      const policy = getSpanishLegalPolicy(slug);
      expect(policy).not.toBeNull();
      expect(policy?.body_html).not.toContain("PRIVATE-IDENTIFIER-FOR-TEST");
      expect(policy?.body_html).not.toContain("NIF/CIF:");
    }
  });
});
