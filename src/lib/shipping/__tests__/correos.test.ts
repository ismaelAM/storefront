import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  CorreosApiError,
  CorreosClient,
  type CorreosConfig,
  getCorreosConfigurationStatus,
  loadCorreosConfig,
} from "@/lib/shipping/correos";

const validEnv = {
  CORREOS_CLIENT_ID: "client-id",
  CORREOS_CLIENT_SECRET: "client-secret",
  CORREOS_OAUTH_TOKEN_URL: "https://auth.correos.test/oauth/token",
  CORREOS_OAUTH_CLIENT_AUTH: "body",
  CORREOS_PREREGISTER_BASE_URL: "https://api.correos.test/preregister",
  CORREOS_LABELS_BASE_URL: "https://api.correos.test/labels",
  CORREOS_TRACKPUB_BASE_URL: "https://api.correos.test/trackpub",
};

const validConfig: CorreosConfig = {
  clientId: "client-id",
  clientSecret: "client-secret",
  tokenUrl: "https://auth.correos.test/oauth/token",
  clientAuth: "body",
  baseUrls: {
    preregister: "https://api.correos.test/preregister",
    labels: "https://api.correos.test/labels",
    trackpub: "https://api.correos.test/trackpub",
  },
};

describe("Correos configuration", () => {
  it("reports missing and masked values without exposing secrets", () => {
    const status = getCorreosConfigurationStatus({
      CORREOS_CLIENT_ID: "[SENSITIVE]",
    });

    expect(status.ready).toBe(false);
    expect(status.missing).toContain("CORREOS_CLIENT_ID");
    expect(JSON.stringify(status)).not.toContain("client-secret");
  });

  it("loads a complete server-side configuration", () => {
    expect(loadCorreosConfig(validEnv)).toEqual(validConfig);
  });

  it("rejects insecure endpoints and unknown OAuth client auth", () => {
    const status = getCorreosConfigurationStatus({
      ...validEnv,
      CORREOS_OAUTH_CLIENT_AUTH: "unknown",
      CORREOS_LABELS_BASE_URL: "http://api.correos.test/labels",
    });

    expect(status.ready).toBe(false);
    expect(status.invalid).toEqual([
      "CORREOS_OAUTH_CLIENT_AUTH",
      "CORREOS_LABELS_BASE_URL",
    ]);
  });
});

describe("CorreosClient", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("obtains and reuses an OAuth token for API requests", async () => {
    const fetcher = vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input);
      if (url === validConfig.tokenUrl) {
        return Response.json({ access_token: "token", expires_in: 3600 });
      }
      expect(url).toBe(
        "https://api.correos.test/trackpub/events?tracking=AB123",
      );
      expect(new Headers(init?.headers).get("authorization")).toBe(
        "Bearer token",
      );
      return Response.json({ status: "IN_TRANSIT" });
    });
    const client = new CorreosClient(validConfig, fetcher);

    await client.request("trackpub", {
      path: "events",
      query: { tracking: "AB123" },
    });
    await client.request("trackpub", {
      path: "events",
      query: { tracking: "AB123" },
    });

    expect(fetcher).toHaveBeenCalledTimes(3);
    const tokenRequest = fetcher.mock.calls[0];
    expect(String(tokenRequest[1]?.body)).toContain(
      "grant_type=client_credentials",
    );
    expect(String(tokenRequest[1]?.body)).toContain("client_id=client-id");
  });

  it("refreshes the token once after a 401", async () => {
    let tokenCount = 0;
    let apiCount = 0;
    const fetcher = vi.fn<typeof fetch>(async (input) => {
      if (String(input) === validConfig.tokenUrl) {
        tokenCount += 1;
        return Response.json({
          access_token: `token-${tokenCount}`,
          expires_in: 3600,
        });
      }
      apiCount += 1;
      return apiCount === 1
        ? Response.json({}, { status: 401 })
        : Response.json({ ok: true });
    });
    const client = new CorreosClient(validConfig, fetcher);

    await expect(
      client.request("preregister", { method: "POST", path: "shipments" }),
    ).resolves.toEqual({ ok: true });
    expect(tokenCount).toBe(2);
    expect(apiCount).toBe(2);
  });

  it("does not expose provider payloads or credentials in errors", async () => {
    const fetcher = vi.fn<typeof fetch>(async (input) => {
      if (String(input) === validConfig.tokenUrl) {
        return Response.json({ access_token: "token", expires_in: 3600 });
      }
      return Response.json(
        { error: "provider detail with client-secret" },
        { status: 422 },
      );
    });
    const client = new CorreosClient(validConfig, fetcher);

    const error = await client
      .request("labels", { path: "documents" })
      .catch((cause: unknown) => cause);

    expect(error).toBeInstanceOf(CorreosApiError);
    expect(String(error)).toBe(
      "CorreosApiError: Correos labels respondió con HTTP 422",
    );
    expect(String(error)).not.toContain("client-secret");
  });

  it("rejects absolute or escaping paths before sending credentials", async () => {
    const fetcher = vi.fn<typeof fetch>();
    const client = new CorreosClient(validConfig, fetcher);

    await expect(
      client.request("labels", { path: "https://example.com/steal" }),
    ).rejects.toThrow("debe ser relativa");
    await expect(
      client.request("labels", { path: "../outside" }),
    ).rejects.toThrow("sale del endpoint");
    expect(fetcher).not.toHaveBeenCalled();
  });
});
