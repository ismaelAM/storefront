import type { Data } from "@puckeditor/core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), upsert: vi.fn(), client: vi.fn() }));
vi.mock("./editor-auth", () => ({ assertPuckEditorAccess: mocks.auth }));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseClient: mocks.client }));
import { saveHomePageData } from "./save-home-data";
import { saveCategoryPageData } from "./save-category-data";
import { saveProductPageData } from "./save-product-data";
import { saveSitePageData } from "./save-site-page-data";

const data: Data = { content: [], root: {} };
const actions = [
  { name: "home", run: () => saveHomePageData(data) },
  { name: "site", run: () => saveSitePageData("navigation", data) },
  { name: "category", run: () => saveCategoryPageData("cards", data) },
  { name: "product", run: () => saveProductPageData("card-box", data) },
];

describe("Puck publishing authorization", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.auth.mockResolvedValue(undefined);
    mocks.upsert.mockResolvedValue({ error: null });
    mocks.client.mockReturnValue({ from: () => ({ upsert: mocks.upsert }) });
  });

  it.each(actions)("denies unauthenticated $name publishing before accessing Supabase", async ({ run }) => {
    mocks.auth.mockRejectedValueOnce(new Error("Unauthorized"));
    await expect(run()).rejects.toThrow("Unauthorized");
    expect(mocks.client).not.toHaveBeenCalled();
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it.each(actions)("preserves authenticated $name publishing", async ({ run }) => {
    await run();
    expect(mocks.auth).toHaveBeenCalledTimes(1);
    expect(mocks.upsert).toHaveBeenCalledWith(expect.objectContaining({ published_data: data }), { onConflict: "page_id" });
  });

  it("rejects malformed shared page data", async () => {
    await expect(saveSitePageData("navigation", {} as Data)).rejects.toThrow();
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
});
