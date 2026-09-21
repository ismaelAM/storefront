export type CorreosApi =
  | "preregister"
  | "labels"
  | "trackpub"
  | "requests"
  | "boxentry";

export type CorreosEnvironment = Record<string, string | undefined>;

export interface CorreosConfig {
  clientId: string;
  clientSecret: string;
  requestsSubscriptionKey?: string;
  allowDeprecatedPreregister: boolean;
  baseUrls: Record<"labels" | "trackpub", string> &
    Partial<Record<"preregister" | "requests" | "boxentry", string>>;
}

export interface CorreosConfigurationStatus {
  ready: boolean;
  requestsEnabled: boolean;
  boxEntryEnabled: boolean;
  preregisterEnabled: boolean;
  missing: string[];
  invalid: string[];
  requiresCorreosIdToken: CorreosApi[];
}

export interface CorreosAccessTokenProvider {
  getAccessToken(options?: { forceRefresh?: boolean }): Promise<string>;
}

export interface CorreosRequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  query?: Record<string, string | number | boolean | null | undefined>;
  json?: unknown;
  headers?: HeadersInit;
  signal?: AbortSignal;
}

export type CorreosLabelDocumentationType = 0 | 1 | 2;
export type CorreosLabelFormat = 1 | 2 | 3;
export type CorreosLabelPrintMode = 1 | 2;

export interface CorreosLabelRequest {
  application?: string;
  documentationType: CorreosLabelDocumentationType;
  print: {
    shipments: string[];
    labelFormat: CorreosLabelFormat;
    labelPrintMode: CorreosLabelPrintMode;
    labelOrderType?: 1 | 2 | 3 | 4 | 5;
    labelPrintInitialPosition?: number;
    clientLogo?: string;
  };
}

export interface CorreosLabelResponse {
  pdf?: string;
  zpl?: string;
  xml?: string;
  error?: string;
}

export interface CorreosTrackingResponse {
  code?: string;
  eventUniqueCode?: string;
  eventResume?: string;
  deliveryDate?: string;
  deliveryHours?: string;
  has_incidence?: string;
  refClient?: string;
  codProduct?: string;
  [key: string]: unknown;
}

export type CorreosPickupEstimatedVolume =
  | 10
  | 20
  | 30
  | 40
  | 50
  | 60
  | 70
  | 80;

export interface CorreosPickupRequest {
  address: string;
  codAnnex: "054" | "091";
  codContract: string;
  codSpecificContract: string;
  contactName: string;
  estimatedVolume: CorreosPickupEstimatedVolume;
  locality: string;
  modalityType: "E" | "S" | "F" | "C" | "P";
  originSystem: string;
  province: string;
  requestDate: string;
  type: "E" | "F";
  [key: string]: unknown;
}

export interface CorreosPickupResponse extends Record<string, unknown> {
  codRequests?: string;
}

export interface CorreosBoxEntryRequest {
  box: {
    boxId: string;
    boxEvents?: {
      totalElements: number;
      elements?: Array<{ elementCode?: string }>;
      [key: string]: unknown;
    };
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface CorreosBoxEntryResponse {
  success: string;
  description?: string;
}

type CorreosAuthPolicy = {
  bearer: boolean;
  clientCredentials: boolean;
  subscriptionKey: boolean;
};

const AUTH_POLICIES: Record<CorreosApi, CorreosAuthPolicy> = {
  preregister: {
    bearer: true,
    clientCredentials: false,
    subscriptionKey: false,
  },
  labels: {
    bearer: true,
    clientCredentials: false,
    subscriptionKey: false,
  },
  trackpub: {
    bearer: true,
    clientCredentials: true,
    subscriptionKey: false,
  },
  requests: {
    bearer: true,
    clientCredentials: false,
    subscriptionKey: true,
  },
  boxentry: {
    bearer: false,
    clientCredentials: true,
    subscriptionKey: false,
  },
};

const REQUIRED_ENV = [
  "CORREOS_CLIENT_ID",
  "CORREOS_CLIENT_SECRET",
  "CORREOS_LABELS_BASE_URL",
  "CORREOS_TRACKPUB_BASE_URL",
] as const;

const URL_ENV = {
  preregister: "CORREOS_PREREGISTER_BASE_URL",
  labels: "CORREOS_LABELS_BASE_URL",
  trackpub: "CORREOS_TRACKPUB_BASE_URL",
  requests: "CORREOS_REQUESTS_BASE_URL",
  boxentry: "CORREOS_BOXENTRY_BASE_URL",
} as const satisfies Record<CorreosApi, string>;

const MASKED_VALUES = new Set([
  "[SENSITIVE]",
  "[REDACTED]",
  "********",
  "*****",
]);

function usableValue(
  env: CorreosEnvironment,
  name: string,
): string | undefined {
  const value = env[name]?.trim();
  if (!value || MASKED_VALUES.has(value.toUpperCase())) return undefined;
  return value;
}

function enabledFlag(env: CorreosEnvironment, name: string): boolean {
  return usableValue(env, name)?.toLowerCase() === "true";
}

function validatedHttpsUrl(name: string, value: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${name} debe ser una URL válida`);
  }
  if (parsed.protocol !== "https:") {
    throw new Error(`${name} debe usar https://`);
  }
  return parsed.toString().replace(/\/$/, "");
}

export function getCorreosConfigurationStatus(
  env: CorreosEnvironment = process.env,
): CorreosConfigurationStatus {
  const missing = new Set<string>(
    REQUIRED_ENV.filter((name) => !usableValue(env, name)),
  );
  const invalid: string[] = [];

  for (const name of Object.values(URL_ENV)) {
    const value = usableValue(env, name);
    if (!value) continue;
    try {
      validatedHttpsUrl(name, value);
    } catch {
      invalid.push(name);
    }
  }

  const requestsUrl = usableValue(env, URL_ENV.requests);
  const requestsSubscriptionKey = usableValue(
    env,
    "CORREOS_REQUESTS_SUBSCRIPTION_KEY",
  );
  if (requestsUrl && !requestsSubscriptionKey) {
    missing.add("CORREOS_REQUESTS_SUBSCRIPTION_KEY");
  }

  const preregisterEnabled =
    Boolean(usableValue(env, URL_ENV.preregister)) &&
    enabledFlag(env, "CORREOS_ALLOW_DEPRECATED_PREREGISTER");

  return {
    ready: missing.size === 0 && invalid.length === 0,
    requestsEnabled: Boolean(requestsUrl && requestsSubscriptionKey),
    boxEntryEnabled: Boolean(usableValue(env, URL_ENV.boxentry)),
    preregisterEnabled,
    missing: [...missing],
    invalid,
    requiresCorreosIdToken: ["preregister", "labels", "trackpub", "requests"],
  };
}

export function loadCorreosConfig(
  env: CorreosEnvironment = process.env,
): CorreosConfig {
  const status = getCorreosConfigurationStatus(env);
  if (!status.ready) {
    const details = [
      status.missing.length > 0
        ? `faltan ${status.missing.join(", ")}`
        : undefined,
      status.invalid.length > 0
        ? `son inválidas ${status.invalid.join(", ")}`
        : undefined,
    ]
      .filter(Boolean)
      .join("; ");
    throw new Error(
      `La integración de Correos no está configurada: ${details}`,
    );
  }

  const baseUrls = Object.fromEntries(
    Object.entries(URL_ENV).flatMap(([api, name]) => {
      const value = usableValue(env, name);
      return value ? [[api, validatedHttpsUrl(name, value)] as const] : [];
    }),
  ) as CorreosConfig["baseUrls"];

  return {
    clientId: usableValue(env, "CORREOS_CLIENT_ID") as string,
    clientSecret: usableValue(env, "CORREOS_CLIENT_SECRET") as string,
    requestsSubscriptionKey: usableValue(
      env,
      "CORREOS_REQUESTS_SUBSCRIPTION_KEY",
    ),
    allowDeprecatedPreregister: status.preregisterEnabled,
    baseUrls,
  };
}

export class CorreosApiError extends Error {
  constructor(
    public readonly api: CorreosApi,
    public readonly status: number,
  ) {
    super(`Correos ${api} respondió con HTTP ${status}`);
    this.name = "CorreosApiError";
  }
}

export class CorreosClient {
  constructor(
    private readonly config: CorreosConfig,
    private readonly fetcher: typeof fetch = fetch,
    private readonly tokenProvider?: CorreosAccessTokenProvider,
  ) {}

  private endpoint(api: CorreosApi, path: string): URL {
    if (api === "preregister" && !this.config.allowDeprecatedPreregister) {
      throw new Error(
        "La API Preregister está deprecada y permanece desactivada",
      );
    }

    const baseUrl = this.config.baseUrls[api];
    if (!baseUrl) {
      throw new Error(`La API de Correos ${api} no está configurada`);
    }
    if (/^[a-z][a-z\d+.-]*:/i.test(path) || path.startsWith("//")) {
      throw new Error("La ruta de Correos debe ser relativa");
    }

    const base = new URL(`${baseUrl}/`);
    const normalizedPath = path.replace(/^\/+/, "");
    const endpoint = new URL(normalizedPath, base);
    if (
      endpoint.origin !== base.origin ||
      !endpoint.pathname.startsWith(base.pathname)
    ) {
      throw new Error("La ruta de Correos sale del endpoint configurado");
    }
    return endpoint;
  }

  private async applyAuthentication(
    api: CorreosApi,
    headers: Headers,
    forceRefresh: boolean,
  ): Promise<void> {
    const policy = AUTH_POLICIES[api];

    if (policy.clientCredentials) {
      headers.set("client_id", this.config.clientId);
      headers.set("client_secret", this.config.clientSecret);
    }

    if (policy.subscriptionKey) {
      if (!this.config.requestsSubscriptionKey) {
        throw new Error(
          "La API Requests requiere CORREOS_REQUESTS_SUBSCRIPTION_KEY",
        );
      }
      headers.set(
        "Ocp-Apim-Subscription-Key",
        this.config.requestsSubscriptionKey,
      );
    }

    if (policy.bearer) {
      if (!this.tokenProvider) {
        throw new Error(
          `La API de Correos ${api} requiere un proveedor de token de Correos ID`,
        );
      }
      const token = (
        await this.tokenProvider.getAccessToken({ forceRefresh })
      ).trim();
      if (!token || /^Bearer\s/i.test(token)) {
        throw new Error(
          "El proveedor de Correos ID debe devolver un token sin el prefijo Bearer",
        );
      }
      headers.set("authorization", `Bearer ${token}`);
    }
  }

  private async send<T>(
    api: CorreosApi,
    options: CorreosRequestOptions,
    retryAuthentication: boolean,
  ): Promise<T> {
    const endpoint = this.endpoint(api, options.path);
    for (const [name, value] of Object.entries(options.query ?? {})) {
      if (value !== undefined && value !== null) {
        endpoint.searchParams.set(name, String(value));
      }
    }

    const headers = new Headers(options.headers);
    headers.set("accept", "application/json");
    await this.applyAuthentication(api, headers, !retryAuthentication);
    if (options.json !== undefined) {
      headers.set("content-type", "application/json");
    }

    const response = await this.fetcher(endpoint, {
      method: options.method ?? "GET",
      headers,
      ...(options.json !== undefined
        ? { body: JSON.stringify(options.json) }
        : {}),
      cache: "no-store",
      redirect: "error",
      signal: options.signal ?? AbortSignal.timeout(30_000),
    });

    if (
      response.status === 401 &&
      retryAuthentication &&
      AUTH_POLICIES[api].bearer
    ) {
      return this.send<T>(api, options, false);
    }
    if (!response.ok) {
      throw new CorreosApiError(api, response.status);
    }
    if (response.status === 204) return undefined as T;

    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      return (await response.json()) as T;
    }
    return (await response.text()) as T;
  }

  request<T>(api: CorreosApi, options: CorreosRequestOptions): Promise<T> {
    return this.send<T>(api, options, true);
  }

  trackShipment(
    shippingCode: string,
    languageCode = "ES",
  ): Promise<CorreosTrackingResponse> {
    return this.request("trackpub", {
      path: `search/${encodeURIComponent(shippingCode)}`,
      query: { languageCode },
    });
  }

  printLabels(request: CorreosLabelRequest): Promise<CorreosLabelResponse> {
    return this.request("labels", {
      method: "POST",
      path: "labels/print",
      json: request,
    });
  }

  createPickup(request: CorreosPickupRequest): Promise<CorreosPickupResponse> {
    return this.request("requests", {
      method: "POST",
      path: "requests",
      json: request,
    });
  }

  registerBox(
    request: CorreosBoxEntryRequest,
  ): Promise<CorreosBoxEntryResponse> {
    return this.request("boxentry", {
      method: "POST",
      path: "box",
      json: request,
    });
  }
}

export function getCorreosClient(
  tokenProvider?: CorreosAccessTokenProvider,
): CorreosClient {
  return new CorreosClient(loadCorreosConfig(), fetch, tokenProvider);
}


export class EnvironmentCorreosIdTokenProvider
  implements CorreosAccessTokenProvider
{
  constructor(private readonly env: CorreosEnvironment = process.env) {}

  async getAccessToken(
    options: { forceRefresh?: boolean } = {},
  ): Promise<string> {
    if (options.forceRefresh) {
      throw new Error(
        "El token de Correos ID ha caducado o fue rechazado; configura un CORREOS_ID_ACCESS_TOKEN nuevo",
      );
    }
    const token = this.env.CORREOS_ID_ACCESS_TOKEN?.trim();
    if (
      !token ||
      MASKED_VALUES.has(token.toUpperCase()) ||
      /^Bearer\s/i.test(token)
    ) {
      throw new Error(
        "Falta CORREOS_ID_ACCESS_TOKEN o contiene un valor no utilizable",
      );
    }
    return token;
  }
}

export function getConfiguredCorreosClient(
  env: CorreosEnvironment = process.env,
): CorreosClient {
  return new CorreosClient(
    loadCorreosConfig(env),
    fetch,
    new EnvironmentCorreosIdTokenProvider(env),
  );
}
