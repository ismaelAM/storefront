import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ cacheLife: vi.fn(), cacheTag: vi.fn() }));

import { cachedGetStoreLogo } from "@/lib/data/store-logo";

describe("store logo", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.stubEnv("SPREE_API_URL", "https://store.example.test");
    vi.stubEnv("SPREE_ADMIN_API_KEY", "sk_test_branding");
    vi.stubEnv("STORE_LOGO_URL", "https://cdn.example.test/fallback.png");
  });

  it("uses the current logo uploaded to Spree instead of the configured fallback", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              logo_url:
                "https://console.spree.sh/rails/active_storage/logo.png",
            }),
          ),
      ),
    );
    expect(await cachedGetStoreLogo()).toBe(
      "https://console.spree.sh/rails/active_storage/logo.png",
    );
  });

  it("keeps the configured logo when the Admin API is unavailable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 403 })),
    );
    expect(await cachedGetStoreLogo()).toBe(
      "https://cdn.example.test/fallback.png",
    );
  });

  it("rejects executable logo URLs from the API", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ logo_url: "javascript:alert(1)" })),
      ),
    );
    expect(await cachedGetStoreLogo()).toBe(
      "https://cdn.example.test/fallback.png",
    );
  });

  it("returns no image when neither source has a usable logo", async () => {
    vi.stubEnv("STORE_LOGO_URL", "[SENSITIVE]");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ logo_url: null }))),
    );
    expect(await cachedGetStoreLogo()).toBeNull();
  });
});
