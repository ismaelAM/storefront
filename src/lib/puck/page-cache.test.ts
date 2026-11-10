import type { Data } from "@puckeditor/core";
import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  tag: vi.fn(),
  life: vi.fn(),
  query: vi.fn(),
}));
vi.mock("next/cache", () => ({ cacheTag: mocks.tag, cacheLife: mocks.life }));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseClient: () => ({
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: mocks.query }) }),
    }),
  }),
}));
import { getProductPageData } from "./get-product-data";
import { getCategoryPageData } from "./get-category-data";
import { getSitePageData } from "./get-site-page-data";
import recovery from "./published-fallback.json";
const fallback: Data = { root: {}, content: [] };
beforeEach(() => vi.resetAllMocks());
it.each([
  ["product:example", () => getProductPageData("example", fallback)],
  ["category:tcg/mtg", () => getCategoryPageData("tcg/mtg", fallback)],
] as const)("caches published template %s under its editor invalidation tag", async (key, read) => {
  const published = {
    root: {},
    content: [{ type: "Text", props: { id: "intro", text: "Published" } }],
  };
  mocks.query.mockResolvedValue({
    data: { published_data: published },
    error: null,
  });
  expect(await read()).toEqual(published);
  expect(mocks.tag).toHaveBeenCalledWith(`puck-page:${key}`);
  expect(mocks.life).toHaveBeenCalledWith({ stale: 300, revalidate: 3600, expire: 86400 });
});
it("serves the last published content inside the cache boundary during a quota block", async () => {
  const errors = vi.spyOn(console, "error").mockImplementation(() => {});
  mocks.query.mockResolvedValue({ data: null, error: { message: "Quota exceeded" }, status: 402 });
  expect(await getSitePageData("home", fallback)).toEqual(recovery.pages.home);
  expect(errors).not.toHaveBeenCalled();
  errors.mockRestore();
});
it.each(["product:unknown", "constructor", "__proto__"])("uses the caller's fallback for a page absent from the published backup: %s", async (key) => {
  const errors = vi.spyOn(console, "error").mockImplementation(() => {});
  mocks.query.mockResolvedValue({ data: null, error: { message: "Quota exceeded" }, status: 402 });
  expect(await getSitePageData(key, fallback)).toEqual(fallback);
  expect(errors).not.toHaveBeenCalled();
  errors.mockRestore();
});
it("prefers current published content over the recovery copy", async () => {
  const fresh = { root: {}, content: [{ type: "Text", props: { id: "new", text: "New publication" } }] };
  mocks.query.mockResolvedValue({ data: { published_data: fresh }, error: null, status: 200 });
  expect(await getSitePageData("home", fallback)).toEqual(fresh);
});
it("retries a transient template error instead of persisting fallback content", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  mocks.query
    .mockResolvedValueOnce({ error: { message: "outage" } })
    .mockResolvedValueOnce({ data: { published_data: fallback }, error: null });
  expect(await getProductPageData("example", fallback)).toEqual(fallback);
  expect(await getProductPageData("example", fallback)).toEqual(fallback);
  expect(mocks.query).toHaveBeenCalledTimes(2);
});
