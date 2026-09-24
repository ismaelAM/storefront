import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ headers: vi.fn(), markets: vi.fn() }));
vi.mock("next/headers", () => ({ headers: mocks.headers }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NEXT_HTTP_ERROR_FALLBACK;404"); } }));
vi.mock("@/lib/data/markets", () => ({ getMarkets: mocks.markets }));
vi.mock("@/lib/store", () => ({
  getStoreSeoTitle: () => "BisonTCG",
  getStoreName: () => "BisonTCG",
  getStoreMetaDescription: () => "Trading cards",
  getStoreUrl: () => "https://www.bisontcg.com",
  getDefaultCountry: () => "es",
  getDefaultLocale: () => "es",
}));
import { generateHomeMetadata } from "../home";
import { generateStoreMetadata } from "../store";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.headers.mockResolvedValue(new Headers());
  mocks.markets.mockResolvedValue({ data: [] });
});

describe.each([generateStoreMetadata, generateHomeMetadata])("invalid route metadata", (generate) => {
  it.each([
    { country: "wp-admin", locale: "install.php" },
    { country: ".git", locale: "config" },
    { country: "es", locale: "unknown" },
    { country: "not-a-country", locale: "es" },
  ])("returns 404 before reading request data or querying Spree for %j", async (params) => {
    await expect(generate(params)).rejects.toThrow("NEXT_HTTP_ERROR_FALLBACK;404");
    expect(mocks.headers).not.toHaveBeenCalled();
    expect(mocks.markets).not.toHaveBeenCalled();
  });
});
