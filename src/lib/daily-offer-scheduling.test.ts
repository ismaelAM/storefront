// @vitest-environment node
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  madridDailyOfferDay,
  madridDailyOfferEndsAt,
} from "../../supabase/functions/_shared/daily-offer-scheduling";
import { dailyOfferSelectionComplete } from "../../supabase/functions/_shared/daily-offer-selection";

const source = ts.createSourceFile(
  "index.ts",
  readFileSync("supabase/functions/devir-sync/index.ts", "utf8"),
  ts.ScriptTarget.Latest,
  true,
);
const code = ts.transpileModule(
  source.statements
    .filter(
      (node) =>
        ts.isFunctionDeclaration(node) &&
        node.name?.text === "dueDailyOfferMaintenanceTick",
    )
    .map((node) => node.getText(source))
    .join("\n"),
  { compilerOptions: { target: ts.ScriptTarget.ES2022 } },
).outputText;
const completeProducts = [
  "tcg",
  "juegos-de-mesa",
  "accesorios",
  "merchandising",
].flatMap((category) =>
  Array.from({ length: 3 }, (_, i) => ({
    productId: category + i,
    variantId: category + i,
    category,
    amount: 10,
    compareAtAmount: 12,
  })),
);

function scheduler(
  dayKey: string,
  lastRotatedAt: string | null = "2026-11-05T17:00:00Z",
) {
  let state = {
    day_key: dayKey,
    spree_price_list_id: "list",
    last_rotated_at: lastRotatedAt,
    active_products: completeProducts,
  };
  let fail = false;
  let rotations = 0;
  const tick = runInNewContext(`${code}; dueDailyOfferMaintenanceTick`, {
    Date,
    madridDailyOfferDay,
    dailyOfferSelectionComplete,
    dailyOfferState: async () => state,
    canStartSyncWork: () => true,
    isSyncDeferred: () => false,
    console: { error: () => {} },
    rotateDailyOffers: async () => {
      rotations++;
      if (fail) throw new Error("temporary activation failure");
      state = {
        ...state,
        day_key: madridDailyOfferDay().dayKey,
        last_rotated_at: new Date().toISOString(),
      };
      return { status: "rotated" };
    },
  });
  return {
    tick: () => tick({}),
    rotations: () => rotations,
    fail: (value: boolean) => {
      fail = value;
    },
  };
}

afterEach(() => vi.useRealTimers());

describe("daily offer publication at 05:00 Europe/Madrid", () => {
  it.each([
    "2026-11-06T00:00:40Z",
    null,
  ])("does not rotate backwards or activate a future offer date before 05:00 (completed=%s)", async (completedAt) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-06T03:00:00Z"));
    const f = scheduler("2026-11-06", completedAt);
    expect(await f.tick()).toBeNull();
    expect(f.rotations()).toBe(0);
    vi.setSystemTime(new Date("2026-11-06T04:00:00Z"));
    expect(await f.tick()).toEqual(
      completedAt ? null : { lane: "daily", result: { status: "rotated" } },
    );
    expect(f.rotations()).toBe(completedAt ? 0 : 1);
  });
  it("keeps the previous publication before 05:00 even after local midnight", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-06T03:59:59.999Z"));
    const f = scheduler("2026-11-05");
    expect(await f.tick()).toBeNull();
    expect(f.rotations()).toBe(0);
  });
  it("publishes at 05:00 and does not publish twice on the same offer day", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-06T04:00:00Z"));
    const f = scheduler("2026-11-05");
    expect(await f.tick()).toMatchObject({ result: { status: "rotated" } });
    expect(await f.tick()).toBeNull();
    expect(f.rotations()).toBe(1);
  });
  it("anchors the next publication to 05:00 after a late successful rotation", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-06T17:00:00Z"));
    const f = scheduler("2026-11-05");
    await f.tick();
    vi.setSystemTime(new Date("2026-11-07T03:59:59.999Z"));
    expect(await f.tick()).toBeNull();
    vi.setSystemTime(new Date("2026-11-07T04:00:00Z"));
    expect(await f.tick()).toMatchObject({ result: { status: "rotated" } });
    expect(f.rotations()).toBe(2);
  });
  it("retries failure on the same offer day without postponing tomorrow's publication", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-06T04:00:00Z"));
    const f = scheduler("2026-11-05");
    f.fail(true);
    expect(await f.tick()).toMatchObject({ status: "error" });
    f.fail(false);
    vi.setSystemTime(new Date("2026-11-06T05:00:00Z"));
    expect(await f.tick()).toMatchObject({ result: { status: "rotated" } });
    expect(await f.tick()).toBeNull();
    vi.setSystemTime(new Date("2026-11-07T04:00:00Z"));
    expect(await f.tick()).toMatchObject({ result: { status: "rotated" } });
    expect(f.rotations()).toBe(3);
  });
  it("resumes an unfinished activation before 05:00", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-06T03:00:00Z"));
    const f = scheduler("2026-11-05", null);
    expect(await f.tick()).toMatchObject({ result: { status: "rotated" } });
    expect(f.rotations()).toBe(1);
  });
});

describe("Madrid offer dates and expiry", () => {
  it.each([
    [
      "2026-11-06T03:59:59.999Z",
      "2026-11-05",
      false,
      "2026-11-06T04:00:00.000Z",
    ],
    ["2026-11-06T04:00:00Z", "2026-11-06", false, "2026-11-07T04:00:00.000Z"],
    [
      "2026-07-04T02:59:59.999Z",
      "2026-07-03",
      false,
      "2026-07-04T03:00:00.000Z",
    ],
    ["2026-07-04T03:00:00Z", "2026-07-04", true, "2026-07-05T03:00:00.000Z"],
    ["2026-03-28T04:00:00Z", "2026-03-28", true, "2026-03-29T03:00:00.000Z"],
    [
      "2026-03-29T02:59:59.999Z",
      "2026-03-28",
      true,
      "2026-03-29T03:00:00.000Z",
    ],
    ["2026-03-29T03:00:00Z", "2026-03-29", false, "2026-03-30T03:00:00.000Z"],
    ["2026-10-24T03:00:00Z", "2026-10-24", true, "2026-10-25T04:00:00.000Z"],
    [
      "2026-10-25T03:59:59.999Z",
      "2026-10-24",
      true,
      "2026-10-25T04:00:00.000Z",
    ],
    ["2026-10-25T04:00:00Z", "2026-10-25", false, "2026-10-26T04:00:00.000Z"],
    [
      "2027-01-01T03:59:59.999Z",
      "2026-12-31",
      false,
      "2027-01-01T04:00:00.000Z",
    ],
  ])("uses the 05:00 boundary for %s", (now, dayKey, saturday, endsAt) => {
    expect(madridDailyOfferDay(new Date(now))).toEqual({ dayKey, saturday });
    expect(madridDailyOfferEndsAt(new Date(now))).toBe(endsAt);
  });
});
