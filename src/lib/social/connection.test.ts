import { describe, expect, it, vi } from "vitest";
import { verifyInstagramAccount } from "./connection";

const config = {
  configured: true as const,
  accountId: "123",
  accessToken: "private-token",
  apiVersion: "v26.0",
};
const response = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });

describe("Instagram account verification", () => {
  it("checks the token owner with a read-only request and returns only the verified account", async () => {
    const fetcher = vi.fn<typeof fetch>(async () =>
      response({ id: "scoped-id", user_id: "123", username: "BisonTCG" }),
    );
    await expect(verifyInstagramAccount(config, fetcher)).resolves.toEqual({
      accountId: "123",
      username: "BisonTCG",
    });
    const [url, init] = fetcher.mock.calls[0];
    expect(String(url)).toBe(
      "https://graph.instagram.com/v26.0/me?fields=user_id%2Cusername",
    );
    expect(init).toMatchObject({
      method: "GET",
      redirect: "error",
      cache: "no-store",
    });
    expect(new Headers(init?.headers).get("Authorization")).toBe(
      "Bearer private-token",
    );
    expect(String(url)).not.toContain(config.accessToken);
  });
  it.each([
    { user_id: "999", username: "bisontcg" },
    { user_id: "123", username: "another-shop" },
  ])("rejects a different account or username: %j", async (body) => {
    await expect(
      verifyInstagramAccount(
        config,
        vi.fn(async () => response(body)),
      ),
    ).rejects.toMatchObject({ code: "account_mismatch" });
  });
  it.each([
    {},
    { user_id: "123" },
    { user_id: 123, username: "bisontcg" },
  ])("does not accept incomplete identity data %j", async (body) => {
    await expect(
      verifyInstagramAccount(
        config,
        vi.fn(async () => response(body)),
      ),
    ).rejects.toMatchObject({ code: "invalid_response" });
  });
  it("does not contact Meta while configuration is missing", async () => {
    const fetcher = vi.fn<typeof fetch>();
    await expect(
      verifyInstagramAccount({ configured: false }, fetcher),
    ).rejects.toMatchObject({ code: "not_configured" });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it.each(["api", "transport", "json"])("sanitizes %s errors", async (kind) => {
    const fetcher = vi.fn<typeof fetch>(async () => {
      if (kind === "transport") throw new Error(config.accessToken);
      if (kind === "json") return new Response(config.accessToken);
      return response({ error: { message: config.accessToken } }, 403);
    });
    let caught: unknown;
    try {
      await verifyInstagramAccount(config, fetcher);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(Error);
    expect(String(caught)).not.toContain(config.accessToken);
    expect(JSON.stringify(caught)).not.toContain(config.accessToken);
  });
});
