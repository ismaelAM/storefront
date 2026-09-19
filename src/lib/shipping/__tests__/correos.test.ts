import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  CorreosApiError,
  type CorreosBoxEntryRequest,
  CorreosClient,
  type CorreosConfig,
  type CorreosLabelRequest,
  type CorreosPickupRequest,
  getCorreosConfigurationStatus,
  loadCorreosConfig,
} from "@/lib/shipping/correos";

const validEnv = {
  CORREOS_CLIENT_ID: "client-id",
  CORREOS_CLIENT_SECRET: "client-secret",
  CORREOS_PREREGISTER_BASE_URL: "https://api.correos.test/preregister",
  CORREOS_LABELS_BASE_URL: "https://api.correos.test/labels",
  CORREOS_TRACKPUB_BASE_URL: "https://api.correos.test/trackpub",
  CORREOS_REQUESTS_BASE_URL: "https://api.correos.test/requests-api",
  CORREOS_REQUESTS_SUBSCRIPTION_KEY: "subscription-key",
  CORREOS_BOXENTRY_BASE_URL: "https://api.correos.test/boxentry",
  CORREOS_ALLOW_DEPRECATED_PREREGISTER: "false",
};

const validConfig: CorreosConfig = {
  clientId: "client-id",
  clientSecret: "client-secret",
  requestsSubscriptionKey: "subscription-key",
  allowDeprecatedPreregister: false,
  baseUrls: {
    preregister: "https://api.correos.test/preregister",
    labels: "https://api.correos.test/labels",
    trackpub: "https://api.correos.test/trackpub",
    requests: "https://api.correos.test/requests-api",
    boxentry: "https://api.correos.test/boxentry",
  },
};

const tokenProvider = {
  getAccessToken: vi.fn(async () => "correos-id-token"),
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

  it("loads the approved API endpoints without assuming an OAuth grant", () => {
    expect(loadCorreosConfig(validEnv)).toEqual(validConfig);
    expect(getCorreosConfigurationStatus(validEnv)).toMatchObject({
      ready: true,
      requestsEnabled: true,
      boxEntryEnabled: true,
      preregisterEnabled: false,
    });
  });

  it("rejects insecure endpoints and incomplete Requests credentials", () => {
    const status = getCorreosConfigurationStatus({
      ...validEnv,
      CORREOS_LABELS_BASE_URL: "http://api.correos.test/labels",
      CORREOS_REQUESTS_SUBSCRIPTION_KEY: "",
    });

    expect(status.ready).toBe(false);
    expect(status.invalid).toEqual(["CORREOS_LABELS_BASE_URL"]);
    expect(status.missing).toContain("CORREOS_REQUESTS_SUBSCRIPTION_KEY");
  });
});

describe("CorreosClient", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    tokenProvider.getAccessToken.mockClear();
  });

  it("uses Bearer plus client credentials for Trackpub", async () => {
    const fetcher = vi.fn<typeof fetch>(async (input, init) => {
      expect(String(input)).toBe(
        "https://api.correos.test/trackpub/search/PQ123?languageCode=ES",
      );
      const headers = new Headers(init?.headers);
      expect(headers.get("authorization")).toBe("Bearer correos-id-token");
      expect(headers.get("client_id")).toBe("client-id");
      expect(headers.get("client_secret")).toBe("client-secret");
      return Response.json({ code: "PQ123", eventResume: "EN TRÁNSITO" });
    });
    const client = new CorreosClient(validConfig, fetcher, tokenProvider);

    await expect(client.trackShipment("PQ123")).resolves.toMatchObject({
      code: "PQ123",
    });
  });

  it("uses only a Correos ID Bearer token for Labels", async () => {
    const request: CorreosLabelRequest = {
      documentationType: 1,
      print: {
        shipments: ["PQ123"],
        labelFormat: 2,
        labelPrintMode: 1,
      },
    };
    const fetcher = vi.fn<typeof fetch>(async (input, init) => {
      expect(String(input)).toBe(
        "https://api.correos.test/labels/labels/print",
      );
      const headers = new Headers(init?.headers);
      expect(headers.get("authorization")).toBe("Bearer correos-id-token");
      expect(headers.get("client_id")).toBeNull();
      expect(init?.body).toBe(JSON.stringify(request));
      return Response.json({ pdf: "base64" }, { status: 201 });
    });
    const client = new CorreosClient(validConfig, fetcher, tokenProvider);

    await expect(client.printLabels(request)).resolves.toEqual({
      pdf: "base64",
    });
  });

  it("uses the subscription key and Bearer token for Requests", async () => {
    const request: CorreosPickupRequest = {
      address: "Mayor",
      codAnnex: "091",
      codContract: "contract",
      codSpecificContract: "specific-contract",
      contactName: "Contacto",
      estimatedVolume: 30,
      locality: "Madrid",
      modalityType: "S",
      originSystem: "ECOMMERCE",
      province: "28",
      requestDate: "2026-09-21",
      type: "E",
    };
    const fetcher = vi.fn<typeof fetch>(async (input, init) => {
      expect(String(input)).toBe(
        "https://api.correos.test/requests-api/requests",
      );
      const headers = new Headers(init?.headers);
      expect(headers.get("authorization")).toBe("Bearer correos-id-token");
      expect(headers.get("Ocp-Apim-Subscription-Key")).toBe("subscription-key");
      expect(init?.body).toBe(JSON.stringify(request));
      return Response.json({ codRequests: "SR123" }, { status: 201 });
    });
    const client = new CorreosClient(validConfig, fetcher, tokenProvider);

    await expect(client.createPickup(request)).resolves.toMatchObject({
      codRequests: "SR123",
    });
  });

  it("uses Client ID Enforcement without a Bearer token for BoxEntry", async () => {
    const request: CorreosBoxEntryRequest = {
      box: {
        boxId: "PQ123",
        boxEvents: {
          totalElements: 1,
          elements: [{ elementCode: "PQ123" }],
        },
      },
    };
    const fetcher = vi.fn<typeof fetch>(async (input, init) => {
      expect(String(input)).toBe("https://api.correos.test/boxentry/box");
      const headers = new Headers(init?.headers);
      expect(headers.get("client_id")).toBe("client-id");
      expect(headers.get("client_secret")).toBe("client-secret");
      expect(headers.get("authorization")).toBeNull();
      return Response.json({ success: "true" });
    });
    const client = new CorreosClient(validConfig, fetcher, tokenProvider);

    await expect(client.registerBox(request)).resolves.toEqual({
      success: "true",
    });
    expect(tokenProvider.getAccessToken).not.toHaveBeenCalled();
  });

  it("asks the token provider to refresh once after a 401", async () => {
    let requestCount = 0;
    const refreshingTokenProvider = {
      getAccessToken: vi.fn(async ({ forceRefresh = false } = {}) =>
        forceRefresh ? "fresh-token" : "old-token",
      ),
    };
    const fetcher = vi.fn<typeof fetch>(async (_input, init) => {
      requestCount += 1;
      const token = new Headers(init?.headers).get("authorization");
      if (requestCount === 1) {
        expect(token).toBe("Bearer old-token");
        return Response.json({}, { status: 401 });
      }
      expect(token).toBe("Bearer fresh-token");
      return Response.json({ code: "PQ123" });
    });
    const client = new CorreosClient(
      validConfig,
      fetcher,
      refreshingTokenProvider,
    );

    await expect(client.trackShipment("PQ123")).resolves.toMatchObject({
      code: "PQ123",
    });
    expect(refreshingTokenProvider.getAccessToken).toHaveBeenNthCalledWith(1, {
      forceRefresh: false,
    });
    expect(refreshingTokenProvider.getAccessToken).toHaveBeenNthCalledWith(2, {
      forceRefresh: true,
    });
  });

  it("keeps deprecated Preregister disabled by default", async () => {
    const fetcher = vi.fn<typeof fetch>();
    const client = new CorreosClient(validConfig, fetcher, tokenProvider);

    await expect(
      client.request("preregister", { method: "POST", path: "delivery" }),
    ).rejects.toThrow("está deprecada");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("requires a Correos ID provider instead of inventing an OAuth flow", async () => {
    const fetcher = vi.fn<typeof fetch>();
    const client = new CorreosClient(validConfig, fetcher);

    await expect(client.trackShipment("PQ123")).rejects.toThrow(
      "requiere un proveedor de token de Correos ID",
    );
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("does not expose provider payloads or credentials in errors", async () => {
    const fetcher = vi.fn<typeof fetch>(async () =>
      Response.json(
        { error: "provider detail with client-secret" },
        { status: 422 },
      ),
    );
    const client = new CorreosClient(validConfig, fetcher, tokenProvider);

    const error = await client
      .printLabels({
        documentationType: 1,
        print: {
          shipments: ["PQ123"],
          labelFormat: 2,
          labelPrintMode: 1,
        },
      })
      .catch((cause: unknown) => cause);

    expect(error).toBeInstanceOf(CorreosApiError);
    expect(String(error)).toBe(
      "CorreosApiError: Correos labels respondió con HTTP 422",
    );
    expect(String(error)).not.toContain("client-secret");
  });

  it("rejects absolute or escaping paths before sending credentials", async () => {
    const fetcher = vi.fn<typeof fetch>();
    const client = new CorreosClient(validConfig, fetcher, tokenProvider);

    await expect(
      client.request("labels", { path: "https://example.com/steal" }),
    ).rejects.toThrow("debe ser relativa");
    await expect(
      client.request("labels", { path: "../outside" }),
    ).rejects.toThrow("sale del endpoint");
    expect(fetcher).not.toHaveBeenCalled();
  });
});
