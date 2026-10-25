import type { Data } from "@puckeditor/core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  upsert: vi.fn(),
  client: vi.fn(),
  invalidate: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseClient: mocks.client,
}));
vi.mock("next/cache", () => ({ revalidateTag: mocks.invalidate }));

import { POST } from "./route";

const data: Data = { content: [], root: {} };
const request = (token = "test-publish-secret", body: unknown = data) =>
  new Request("https://store.test/api/pages/home", {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });

describe("home publication cache invalidation", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv("PUCK_PUBLISH_SECRET", "test-publish-secret");
    mocks.client.mockReturnValue({ from: () => ({ upsert: mocks.upsert }) });
    mocks.upsert.mockResolvedValue({ error: null });
  });

  it("expires the published home cache only after the database write succeeds", async () => {
    let finish!: (value: { error: null }) => void;
    mocks.upsert.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const response = POST(request());
    await vi.waitFor(() => expect(mocks.upsert).toHaveBeenCalled());
    expect(mocks.invalidate).not.toHaveBeenCalled();
    finish({ error: null });
    expect((await response).status).toBe(200);
    expect(mocks.invalidate).toHaveBeenCalledWith("puck-page:home", {
      expire: 0,
    });
  });

  it("leaves the published cache intact when persistence fails", async () => {
    mocks.upsert.mockResolvedValue({
      error: { message: "Database unavailable" },
    });
    expect((await POST(request())).status).toBe(500);
    expect(mocks.invalidate).not.toHaveBeenCalled();
  });

  it("rejects unauthorized publishing without touching the database or cache", async () => {
    expect((await POST(request("wrong"))).status).toBe(401);
    expect(mocks.client).not.toHaveBeenCalled();
    expect(mocks.invalidate).not.toHaveBeenCalled();
  });

  it("rejects malformed content without touching the cache", async () => {
    expect(
      (await POST(request("test-publish-secret", { content: {} }))).status,
    ).toBe(400);
    expect(mocks.upsert).not.toHaveBeenCalled();
    expect(mocks.invalidate).not.toHaveBeenCalled();
  });
});
