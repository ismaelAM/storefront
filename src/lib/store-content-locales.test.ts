import { afterEach, describe, expect, it, vi } from "vitest";
import { getCatalogContentLocales } from "./store";

afterEach(() => vi.unstubAllEnvs());

describe("verified catalogue content locales", () => {
  it("normalizes and deduplicates the explicit configuration", () => {
    vi.stubEnv("SPREE_CATALOG_CONTENT_LOCALES", " ES, en,es ");
    expect(getCatalogContentLocales()).toEqual(["es", "en"]);
  });
  it.each([
    "",
    " ",
    "es,unknown",
    "es,",
  ])("preserves discovery for invalid/absent config %s", (value) => {
    vi.stubEnv("SPREE_CATALOG_CONTENT_LOCALES", value);
    expect(getCatalogContentLocales()).toBeUndefined();
  });
});
