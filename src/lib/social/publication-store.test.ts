import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  exists: vi.fn(),
  upload: vi.fn(),
  render: vi.fn(),
  getPublicUrl: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseClient: () => ({ storage: { from: () => mocks } }),
}));
vi.mock("./template", () => ({ renderOfferSlide: mocks.render }));

import type { SocialOfferSnapshot } from "./offers";
import { preparePublicationImages } from "./publication-store";

const snapshot: SocialOfferSnapshot = {
  dayKey: "2026-10-11",
  priceListId: "pl_1",
  offers: [],
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.render.mockResolvedValue(Buffer.from("jpeg"));
  mocks.upload.mockResolvedValue({ error: null });
  mocks.getPublicUrl.mockImplementation((path: string) => ({
    data: { publicUrl: `https://cdn.example.com/${path}` },
  }));
});
describe("immutable daily JPEG storage", () => {
  it("uploads a missing file when Supabase exists returns its documented not-found error", async () => {
    mocks.exists.mockResolvedValue({ data: false, error: { status: 404 } });
    expect(
      await preparePublicationImages(
        snapshot,
        "hash",
        "https://www.bisontcg.com",
      ),
    ).toHaveLength(4);
    expect(mocks.upload).toHaveBeenCalledTimes(4);
  });
  it("reuses existing immutable assets without overwriting", async () => {
    mocks.exists.mockResolvedValue({ data: true, error: null });
    expect(
      await preparePublicationImages(
        snapshot,
        "hash",
        "https://www.bisontcg.com",
      ),
    ).toHaveLength(4);
    expect(mocks.upload).not.toHaveBeenCalled();
    expect(mocks.render).not.toHaveBeenCalled();
  });
  it("does not silently ignore a failed upload", async () => {
    mocks.exists.mockResolvedValue({ data: false, error: { status: 404 } });
    mocks.upload.mockResolvedValue({
      error: { message: "Storage unavailable" },
    });
    await expect(
      preparePublicationImages(snapshot, "hash", "https://www.bisontcg.com"),
    ).rejects.toThrow();
  });
});
