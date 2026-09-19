import "server-only";

export type CorreosApi = "preregister" | "labels" | "trackpub" | "requests";

export type CorreosOAuthClientAuth = "basic" | "body";

export type CorreosEnvironment = Record<string, string | undefined>;

export interface CorreosConfig {
  clientId: string;
  clientSecret: string;
  tokenUrl: string;
  clientAuth: CorreosOAuthClientAuth;
  scope?: string;
  baseUrls: Record<Exclude<CorreosApi, "requests">, string> & {
    requests?: string;
  };
}

export interface CorreosConfigurationStatus {
  ready: boolean;
  requestsEnabled: boolean;
  missing: string[];
  invalid: string[];
}

export interface CorreosRequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  query?: Record<string, string | number | boolean | null | undefined>;
  json?: unknown;
  headers?: HeadersInit;
  signal?: AbortSignal;
}

interface CorreosTokenResponse {
  access_token?: unknown;
  expires_in?: unknown;
}

interface CachedToken {
  accessToken: string;
  expiresAt: number;
}

const REQUIRED_ENV = [
  "CORREOS_CLIENT_ID",
  "CORREOS_CLIENT_SECRET",
  "CORREOS_OAUTH_TOKEN_URL",
  "CORREOS_OAUTH_CLIENT_AUTH",
  "CORREOS_PREREGISTER_BASE_URL",
  "CORREOS_LABELS_BASE_URL",
  "CORREOS_TRACKPUB_BASE_URL",
] as const;

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
  const missing = REQUIRED_ENV.filter((name) => !usableValue(env, name));
  const invalid: string[] = [];

  const auth = usableValue(env, "CORREOS_OAUTH_CLIENT_AUTH");
  if (auth && auth !== "basic" && auth !== "body") {
    invalid.push("CORREOS_OAUTH_CLIENT_AUTH");
  }

  for (const name of [
    "CORREOS_OAUTH_TOKEN_URL",
    "CORREOS_PREREGISTER_BASE_URL",
    "CORREOS_LABELS_BASE_URL",
    "CORREOS_TRACKPUB_BASE_URL",
    "CORREOS_REQUESTS_BASE_URL",
  ]) {
    const value = usableValue(env, name);
    if (!value) continue;
    try {
      validatedHttpsUrl(name, value);
    } catch {
      invalid.push(name);
    }
  }

  return {
    ready: missing.length === 0 && invalid.length === 0,
    requestsEnabled: Boolean(usableValue(env, "CORREOS_REQUESTS_BASE_URL")),
    missing: [...missing],
    invalid,
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

  const clientAuth = usableValue(
    env,
    "CORREOS_OAUTH_CLIENT_AUTH",
  ) as CorreosOAuthClientAuth;
  const requestsUrl = usableValue(env, "CORREOS_REQUESTS_BASE_URL");

  return {
    clientId: usableValue(env, "CORREOS_CLIENT_ID") as string,
    clientSecret: usableValue(env, "CORREOS_CLIENT_SECRET") as string,
    tokenUrl: validatedHttpsUrl(
      "CORREOS_OAUTH_TOKEN_URL",
      usableValue(env, "CORREOS_OAUTH_TOKEN_URL") as string,
    ),
    clientAuth,
    scope: usableValue(env, "CORREOS_OAUTH_SCOPE"),
    baseUrls: {
      preregister: validatedHttpsUrl(
        "CORREOS_PREREGISTER_BASE_URL",
        usableValue(env, "CORREOS_PREREGISTER_BASE_URL") as string,
      ),
      labels: validatedHttpsUrl(
        "CORREOS_LABELS_BASE_URL",
        usableValue(env, "CORREOS_LABELS_BASE_URL") as string,
      ),
      trackpub: validatedHttpsUrl(
        "CORREOS_TRACKPUB_BASE_URL",
        usableValue(env, "CORREOS_TRACKPUB_BASE_URL") as string,
      ),
      ...(requestsUrl
        ? {
            requests: validatedHttpsUrl(
              "CORREOS_REQUESTS_BASE_URL",
              requestsUrl,
            ),
          }
        : {}),
    },
  };
}

export class CorreosApiError extends Error {
  constructor(
    public readonly api: CorreosApi | "oauth",
    public readonly status: number,
  ) {
    super(`Correos ${api} respondió con HTTP ${status}`);
    this.name = "CorreosApiError";
  }
}

export class CorreosClient {
  private cachedToken: CachedToken | null = null;
  private tokenRequest: Promise<string> | null = null;

  constructor(
    private readonly config: CorreosConfig,
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  private async requestAccessToken(): Promise<string> {
    const body = new URLSearchParams({ grant_type: "client_credentials" });
    const headers = new Headers({
      accept: "application/json",
      "content-type": "application/x-www-form-urlencoded",
    });

    if (this.config.scope) body.set("scope", this.config.scope);
    if (this.config.clientAuth === "basic") {
      const credentials = Buffer.from(
        `${this.config.clientId}:${this.config.clientSecret}`,
      ).toString("base64");
      headers.set("authorization", `Basic ${credentials}`);
    } else {
      body.set("client_id", this.config.clientId);
      body.set("client_secret", this.config.clientSecret);
    }

    const response = await this.fetcher(this.config.tokenUrl, {
      method: "POST",
      headers,
      body: body.toString(),
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(30_000),
    });

    if (!response.ok) {
      throw new CorreosApiError("oauth", response.status);
    }

    const payload = (await response.json()) as CorreosTokenResponse;
    if (typeof payload.access_token !== "string" || !payload.access_token) {
      throw new Error("Correos OAuth no devolvió un access_token válido");
    }

    const expiresIn = Number(payload.expires_in);
    const lifetimeSeconds =
      Number.isFinite(expiresIn) && expiresIn > 0 ? expiresIn : 300;
    this.cachedToken = {
      accessToken: payload.access_token,
      expiresAt: Date.now() + Math.max(1, lifetimeSeconds - 30) * 1_000,
    };
    return payload.access_token;
  }

  private async accessToken(): Promise<string> {
    if (this.cachedToken && this.cachedToken.expiresAt > Date.now()) {
      return this.cachedToken.accessToken;
    }
    if (!this.tokenRequest) {
      this.tokenRequest = this.requestAccessToken().finally(() => {
        this.tokenRequest = null;
      });
    }
    return this.tokenRequest;
  }

  private endpoint(api: CorreosApi, path: string): URL {
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
    headers.set("authorization", `Bearer ${await this.accessToken()}`);
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

    if (response.status === 401 && retryAuthentication) {
      this.cachedToken = null;
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
}

let sharedClient: CorreosClient | null = null;

export function getCorreosClient(): CorreosClient {
  if (!sharedClient) sharedClient = new CorreosClient(loadCorreosConfig());
  return sharedClient;
}
