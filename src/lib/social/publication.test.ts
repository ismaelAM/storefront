import { describe, expect, it, vi } from "vitest";
import { InstagramPublishUncertainError } from "./instagram";
import type { SocialOfferSnapshot } from "./offers";
import {
  executeDailyPublication,
  type PublicationDependencies,
  type PublicationRepository,
} from "./publication";

function setup() {
  const offers = (
    ["tcg", "juegos-de-mesa", "accesorios", "merchandising"] as const
  ).flatMap((category) =>
    [1, 2, 3].map((n) => ({
      productId: `${category}${n}`,
      variantId: `${n}`,
      category,
      name: "Producto",
      slug: "producto",
      price: 10,
      originalPrice: 12,
      imageUrl: "https://console.spree.sh/image.jpg",
    })),
  );
  const snapshot: SocialOfferSnapshot = {
    dayKey: "2026-10-11",
    priceListId: "pl_1",
    offers,
  };
  const repo = {
    claim: vi.fn<PublicationRepository["claim"]>(async () => ({
      status: "working",
      checkpoint: null,
      mediaId: null,
    })),
    saveCheckpoint: vi.fn(async () => {}),
    finish: vi.fn(async () => {}),
  };
  const deps = {
    getSnapshot: vi.fn(async () => snapshot),
    config: {
      configured: true,
      accountId: "123",
      accessToken: "private",
      apiVersion: "v25.0",
    },
    storeUrl: "https://www.bisontcg.com",
    repo,
    prepareImages: vi.fn(async () =>
      [1, 2, 3, 4].map((n) => `https://cdn.example.com/${n}.jpg`),
    ),
    publish: vi.fn(async (_config, _input, opts) => {
      const checkpoint = {
        inputHash: "test",
        childContainerIds: ["1", "2", "3", "4"],
        carouselContainerId: "5",
        publishAttempted: true,
      };
      await opts.beforePublish(checkpoint);
      await opts.onCheckpoint({ ...checkpoint, publishedMediaId: "6" });
      return { mediaId: "6", carouselContainerId: "5" };
    }),
    now: () => new Date("2026-10-11T08:00:00Z"),
  } as unknown as PublicationDependencies;
  return { deps, repo, snapshot };
}
describe("daily social publication orchestration", () => {
  it("does not render or send another published day", async () => {
    const { deps, repo } = setup();
    repo.claim.mockResolvedValueOnce({
      status: "published",
      checkpoint: null,
      mediaId: "6",
    });
    expect(await executeDailyPublication(deps)).toMatchObject({
      status: "published",
      mediaId: "6",
    });
    expect(deps.prepareImages).not.toHaveBeenCalled();
    expect(deps.publish).not.toHaveBeenCalled();
  });
  it("does not run while another worker owns the day or an attempt is uncertain", async () => {
    const { deps, repo } = setup();
    repo.claim.mockResolvedValueOnce(null as never);
    expect(await executeDailyPublication(deps)).toMatchObject({
      status: "busy",
    });
    expect(deps.publish).not.toHaveBeenCalled();
  });
  it("prepares daily images independently of Instagram credentials", async () => {
    const { deps, repo } = setup();
    deps.config = { configured: false };
    expect(await executeDailyPublication(deps)).toMatchObject({
      status: "prepared",
    });
    expect(deps.prepareImages).toHaveBeenCalledOnce();
    expect(deps.publish).not.toHaveBeenCalled();
    expect(repo.finish).toHaveBeenCalledWith(
      expect.anything(),
      "prepared",
      null,
    );
  });
  it("publishes only complete valid groups and verifies prices again before the irreversible call", async () => {
    const { deps, repo, snapshot } = setup();
    vi.mocked(deps.getSnapshot)
      .mockResolvedValueOnce(snapshot)
      .mockResolvedValueOnce({
        ...snapshot,
        offers: snapshot.offers.map((o, i) => (i ? o : { ...o, price: 11 })),
      });
    await expect(executeDailyPublication(deps)).rejects.toThrow("cambiado");
    expect(repo.saveCheckpoint).not.toHaveBeenCalled();
    expect(repo.finish).toHaveBeenCalledWith(expect.anything(), "failed", null);
  });
  it("blocks publishing if a category falls short", async () => {
    const { deps, snapshot } = setup();
    vi.mocked(deps.getSnapshot).mockResolvedValue({
      ...snapshot,
      offers: snapshot.offers.slice(1),
    });
    expect(await executeDailyPublication(deps)).toMatchObject({
      status: "incomplete",
    });
    expect(deps.publish).not.toHaveBeenCalled();
  });
  it("preserves an ambiguous publication as terminal uncertainty", async () => {
    const { deps, repo } = setup();
    vi.mocked(deps.publish).mockRejectedValue(
      new InstagramPublishUncertainError("5"),
    );
    await expect(executeDailyPublication(deps)).rejects.toThrow();
    expect(repo.finish).toHaveBeenCalledWith(
      expect.anything(),
      "uncertain",
      null,
    );
  });
  it("persists success and never returns tokens", async () => {
    const { deps, repo } = setup();
    const result = await executeDailyPublication(deps);
    expect(result).toMatchObject({ status: "published", mediaId: "6" });
    expect(repo.saveCheckpoint).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ publishAttempted: true }),
      true,
    );
    expect(repo.finish).toHaveBeenCalledWith(
      expect.anything(),
      "published",
      "6",
    );
    expect(JSON.stringify(result)).not.toContain("private");
  });
});
