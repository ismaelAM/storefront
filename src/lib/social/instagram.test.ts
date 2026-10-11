import { describe, expect, it, vi } from "vitest";

import {
  type InstagramCheckpoint,
  InstagramPublishError,
  InstagramPublishUncertainError,
  publishInstagramCarousel,
  readInstagramConfig,
} from "./instagram";

const config = {
  configured: true as const,
  accountId: "123456",
  accessToken: "secret-should-never-appear",
  apiVersion: "v25.0",
};
const input = {
  imageUrls: [1, 2, 3, 4].map((n) => `https://cdn.example.com/${n}.jpg`),
  caption: "Las ofertas del día: Pokémon, MTG, juegos de mesa y rol.",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });

function harness() {
  let sequence = 0;
  let saved: InstagramCheckpoint | undefined;
  const onCheckpoint = vi.fn(async (value: InstagramCheckpoint) => {
    saved = structuredClone(value);
  });
  const beforePublish = vi.fn(async (value: InstagramCheckpoint) => {
    saved = structuredClone(value);
  });
  const fetcher = vi.fn<typeof fetch>(async (_url, init) => {
    if (init?.method === "POST") return json({ id: String(++sequence) });
    return json({ status_code: "FINISHED" });
  });
  const wait = vi.fn(async () => {});
  return {
    fetch: fetcher,
    wait,
    onCheckpoint,
    beforePublish,
    saved: () => saved,
  };
}

describe("Instagram carousel publishing", () => {
  it("stays unconfigured without all server credentials and explicit API version", () => {
    expect(readInstagramConfig({})).toEqual({ configured: false });
    expect(
      readInstagramConfig({
        INSTAGRAM_ACCOUNT_ID: "123456",
        INSTAGRAM_ACCESS_TOKEN: "token",
      }),
    ).toEqual({ configured: false });
    expect(
      readInstagramConfig({
        INSTAGRAM_ACCOUNT_ID: "123456",
        INSTAGRAM_ACCESS_TOKEN: "[SENSITIVE]",
        INSTAGRAM_API_VERSION: "v25.0",
      }),
    ).toEqual({ configured: false });
    expect(
      readInstagramConfig({
        INSTAGRAM_ACCOUNT_ID: "123456",
        INSTAGRAM_ACCESS_TOKEN: "token",
        INSTAGRAM_API_VERSION: "v25.0",
      }),
    ).toEqual({ ...config, accessToken: "token" });
  });

  it("creates four children in order, polls them and the carousel, and persists before publishing", async () => {
    const h = harness();
    h.fetch.mockImplementation(async (url, init) => {
      if (String(url).endsWith("/media_publish")) {
        expect(h.saved()?.publishAttempted).toBe(true);
        expect(h.beforePublish).toHaveBeenCalledOnce();
      }
      if (init?.method === "POST")
        return json({
          id: String(
            h.fetch.mock.calls.filter(([, i]) => i?.method === "POST").length,
          ),
        });
      return json({ status_code: "FINISHED" });
    });
    const result = await publishInstagramCarousel(config, input, h);
    expect(result).toEqual({ mediaId: "6", carouselContainerId: "5" });
    const posts = h.fetch.mock.calls.filter(
      ([, init]) => init?.method === "POST",
    );
    expect(posts).toHaveLength(6);
    posts.slice(0, 4).forEach(([url, init], index) => {
      expect(String(url)).toBe(
        "https://graph.instagram.com/v25.0/123456/media",
      );
      const body = new URLSearchParams(String(init?.body));
      expect(body.get("image_url")).toBe(input.imageUrls[index]);
      expect(body.get("is_carousel_item")).toBe("true");
      expect(body.has("caption")).toBe(false);
      expect(String(url)).not.toContain(config.accessToken);
      expect(new Headers(init?.headers).get("Authorization")).toBe(
        `Bearer ${config.accessToken}`,
      );
    });
    expect(new URLSearchParams(String(posts[4][1]?.body)).get("children")).toBe(
      "1,2,3,4",
    );
    expect(
      new URLSearchParams(String(posts[4][1]?.body)).get("media_type"),
    ).toBe("CAROUSEL");
    expect(h.saved()?.publishedMediaId).toBe("6");
  });

  it("bounds pending polls and preserves created containers for a safe resume", async () => {
    const h = harness();
    h.fetch.mockImplementation(async (_url, init) =>
      init?.method === "POST"
        ? json({ id: "1" })
        : json({ status_code: "IN_PROGRESS" }),
    );
    await expect(
      publishInstagramCarousel(config, input, {
        ...h,
        maxPollAttempts: 3,
        pollIntervalMs: 1,
      }),
    ).rejects.toMatchObject({ code: "processing_timeout" });
    expect(h.fetch).toHaveBeenCalledTimes(4);
    expect(h.wait).toHaveBeenCalledTimes(2);
    expect(h.saved()?.childContainerIds).toEqual(["1"]);
    expect(h.beforePublish).not.toHaveBeenCalled();
    const resumed = harness();
    await publishInstagramCarousel(config, input, {
      ...resumed,
      checkpoint: h.saved(),
    });
    expect(
      resumed.fetch.mock.calls.filter(([, init]) => init?.method === "POST"),
    ).toHaveLength(5);
  });

  it.each([
    "ERROR",
    "EXPIRED",
  ])("fails safely for a %s container without attempting publish", async (status) => {
    const h = harness();
    h.fetch.mockImplementation(async (_url, init) =>
      init?.method === "POST"
        ? json({ id: "1" })
        : json({ status_code: status }),
    );
    await expect(
      publishInstagramCarousel(config, input, h),
    ).rejects.toBeInstanceOf(InstagramPublishError);
    expect(h.beforePublish).not.toHaveBeenCalled();
  });

  it("never retries a publish timeout, including after durable resume", async () => {
    const h = harness();
    h.fetch.mockImplementation(async (url, init) => {
      if (String(url).endsWith("/media_publish"))
        throw new Error(config.accessToken);
      return init?.method === "POST"
        ? json({ id: String(h.fetch.mock.calls.length) })
        : json({ status_code: "FINISHED" });
    });
    await expect(
      publishInstagramCarousel(config, input, h),
    ).rejects.toBeInstanceOf(InstagramPublishUncertainError);
    const resumed = harness();
    await expect(
      publishInstagramCarousel(config, input, {
        ...resumed,
        checkpoint: h.saved(),
      }),
    ).rejects.toMatchObject({ code: "publish_uncertain" });
    expect(resumed.fetch).not.toHaveBeenCalled();
  });

  it("does not publish when the durable beforePublish callback fails", async () => {
    const h = harness();
    h.beforePublish.mockRejectedValueOnce(new Error("storage unavailable"));
    await expect(
      publishInstagramCarousel(config, input, h),
    ).rejects.toMatchObject({ code: "checkpoint_failed" });
    expect(
      h.fetch.mock.calls.some(([url]) =>
        String(url).endsWith("/media_publish"),
      ),
    ).toBe(false);
  });

  it("keeps successful publish IDs even when the final durable checkpoint fails", async () => {
    const h = harness();
    h.onCheckpoint.mockImplementation(async (checkpoint) => {
      if (checkpoint.publishedMediaId) throw new Error("storage unavailable");
    });
    await expect(
      publishInstagramCarousel(config, input, h),
    ).rejects.toMatchObject({
      code: "publish_uncertain",
      publishedMediaId: "6",
      carouselContainerId: "5",
    });
  });

  it("returns a previously persisted result without any API call and rejects changed content", async () => {
    const h = harness();
    await publishInstagramCarousel(config, input, h);
    const resumed = harness();
    await expect(
      publishInstagramCarousel(config, input, {
        ...resumed,
        checkpoint: h.saved(),
      }),
    ).resolves.toEqual({ mediaId: "6", carouselContainerId: "5" });
    expect(resumed.fetch).not.toHaveBeenCalled();
    await expect(
      publishInstagramCarousel(
        config,
        { ...input, caption: "Changed" },
        { ...resumed, checkpoint: h.saved() },
      ),
    ).rejects.toMatchObject({ code: "checkpoint_mismatch" });
  });

  it("rejects missing configuration, invalid media and captions before contacting Meta", async () => {
    const h = harness();
    await expect(
      publishInstagramCarousel({ configured: false }, input, h),
    ).rejects.toMatchObject({ code: "not_configured" });
    for (const imageUrls of [
      input.imageUrls.slice(0, 3),
      [...input.imageUrls.slice(0, 3), "javascript:alert(1)"],
      [
        ...input.imageUrls.slice(0, 3),
        "https://user:pass@cdn.example.com/image.jpg",
      ],
    ]) {
      await expect(
        publishInstagramCarousel(config, { ...input, imageUrls }, h),
      ).rejects.toMatchObject({ code: "invalid_input" });
    }
    await expect(
      publishInstagramCarousel(
        config,
        { ...input, caption: "x".repeat(2201) },
        h,
      ),
    ).rejects.toMatchObject({ code: "invalid_input" });
    expect(h.fetch).not.toHaveBeenCalled();
  });

  it("sanitizes API and transport errors instead of retaining token-bearing causes", async () => {
    const h = harness();
    h.fetch.mockResolvedValueOnce(
      json({ error: { message: config.accessToken } }, 403),
    );
    let caught: unknown;
    try {
      await publishInstagramCarousel(config, input, h);
    } catch (error) {
      caught = error;
    }
    expect(caught).toMatchObject({ code: "api_rejected" });
    expect(JSON.stringify(caught)).not.toContain(config.accessToken);
    expect(String(caught)).not.toContain(config.accessToken);
  });
});
