// @vitest-environment node
import { SpreeError } from "@spree/sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getClient, getWholesaleClient, resetClient } from "../config";

const fetcher = vi.fn<typeof fetch>();

beforeEach(() => {
  resetClient();
  vi.stubGlobal("fetch", fetcher);
  vi.stubEnv("SPREE_API_URL", "https://backend.example.test");
  vi.stubEnv("SPREE_PUBLISHABLE_KEY", "pk_test");
  fetcher.mockReset();
});
afterEach(() => {
  resetClient();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("Spree transport during upstream failures", () => {
  it("does not retry a paused deployment or parse its text as JSON", async () => {
    fetcher.mockImplementation(
      async () =>
        new Response(
          "The deployment is currently unavailable\nDEPLOYMENT_PAUSED",
          { status: 503, headers: { "x-vercel-error": "DEPLOYMENT_PAUSED" } },
        ),
    );
    const error = await getClient()
      .products.list()
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(SpreeError);
    expect(error).toMatchObject({ status: 503, code: "backend_unavailable" });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("preserves the HTTP status of a non-JSON error without exposing its body", async () => {
    fetcher.mockImplementation(
      async () =>
        new Response("<html>private upstream details</html>", {
          status: 502,
          headers: { "content-type": "text/html" },
        }),
    );
    const error = await getClient()
      .products.list()
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(SpreeError);
    expect(error).toMatchObject({ status: 502, code: "backend_unavailable" });
    expect((error as Error).message).not.toContain("private upstream details");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("bounds a stalled request and does not replay it after its deadline", async () => {
    const controller = new AbortController();
    vi.spyOn(AbortSignal, "timeout").mockImplementation(
      () => controller.signal,
    );
    fetcher.mockImplementation(
      (_input, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener(
            "abort",
            () => reject(init.signal?.reason),
            { once: true },
          );
        }),
    );
    const pending = getClient()
      .products.list()
      .catch((e: unknown) => e);
    controller.abort(new DOMException("Request timed out", "TimeoutError"));
    expect(await pending).toMatchObject({
      status: 504,
      code: "backend_timeout",
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  }, 500);

  it("keeps the deadline active while reading a stalled response body", async () => {
    const controller = new AbortController();
    vi.spyOn(AbortSignal, "timeout").mockImplementation(
      () => controller.signal,
    );
    fetcher.mockImplementation(
      async (_input, init) =>
        new Response(
          new ReadableStream({
            start(stream) {
              init?.signal?.addEventListener(
                "abort",
                () => stream.error(init.signal?.reason),
                { once: true },
              );
            },
          }),
          { headers: { "content-type": "application/json" } },
        ),
    );
    const pending = getClient()
      .products.list()
      .catch((e: unknown) => e);
    await Promise.resolve();
    await Promise.resolve();
    controller.abort(new DOMException("Request timed out", "TimeoutError"));
    expect(await pending).toMatchObject({
      status: 504,
      code: "backend_timeout",
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  }, 500);

  it("recovers on the next call rather than storing an empty catalogue after an outage", async () => {
    fetcher.mockResolvedValueOnce(new Response("Paused", { status: 503 }));
    await expect(getClient().products.list()).rejects.toBeInstanceOf(
      SpreeError,
    );
    fetcher.mockResolvedValueOnce(
      Response.json({ data: [{ id: "prod_real" }], meta: { count: 1 } }),
    );
    expect((await getClient().products.list()).data).toEqual([
      { id: "prod_real" },
    ]);
  });

  it("keeps normal API validation errors and their details intact", async () => {
    fetcher.mockResolvedValueOnce(
      Response.json(
        {
          error: {
            code: "validation_error",
            message: "Quantity unavailable",
            details: { quantity: ["too high"] },
          },
        },
        { status: 422 },
      ),
    );
    await expect(getClient().carts.create({})).rejects.toMatchObject({
      status: 422,
      code: "validation_error",
      details: { quantity: ["too high"] },
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("does not replay a cart mutation after a timeout", async () => {
    const controller = new AbortController();
    vi.spyOn(AbortSignal, "timeout").mockImplementation(
      () => controller.signal,
    );
    fetcher.mockImplementation(
      (_input, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener(
            "abort",
            () => reject(init.signal?.reason),
            { once: true },
          );
        }),
    );
    const pending = getClient()
      .carts.create({})
      .catch((e: unknown) => e);
    controller.abort(new DOMException("Request timed out", "TimeoutError"));
    expect(await pending).toMatchObject({
      status: 504,
      code: "backend_timeout",
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  }, 500);

  it("uses the same protections for wholesale without dropping channel or customer auth", async () => {
    vi.stubEnv("SPREE_WHOLESALE_CHANNEL", "wholesale");
    fetcher.mockImplementation(
      async () => new Response("Paused", { status: 503 }),
    );
    await expect(
      getWholesaleClient().products.list(undefined, { token: "customer_test" }),
    ).rejects.toMatchObject({ status: 503 });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0][1]?.headers).toMatchObject({
      Authorization: "Bearer customer_test",
      "x-spree-channel": "wholesale",
    });
  });
});
