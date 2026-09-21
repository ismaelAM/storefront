export type SpreeAdminEnvironment = Record<string, string | undefined>;

export interface SpreeFulfillment {
  id: string;
  number?: string | null;
  tracking?: string | null;
  tracking_url?: string | null;
  status?: string | null;
  fulfilled_at?: string | null;
  [key: string]: unknown;
}

export interface SpreeFulfillmentList {
  data: SpreeFulfillment[];
  meta?: Record<string, unknown>;
}

export class SpreeShippingApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly path: string,
  ) {
    super(`Spree Admin API respondió con HTTP ${status} en ${path}`);
    this.name = "SpreeShippingApiError";
  }
}

const MASKED_VALUES = new Set([
  "[SENSITIVE]",
  "[REDACTED]",
  "********",
  "*****",
]);

function usableEnv(
  env: SpreeAdminEnvironment,
  names: string[],
): string | undefined {
  for (const name of names) {
    const value = env[name]?.trim();
    if (value && !MASKED_VALUES.has(value.toUpperCase())) return value;
  }
  return undefined;
}

export function getSpreeShippingConfigurationStatus(
  env: SpreeAdminEnvironment = process.env,
) {
  const baseUrl = usableEnv(env, [
    "SPREE_API_URL",
    "DEVIR_B2B_SPREE_API_URL",
  ]);
  const apiKey = usableEnv(env, [
    "SPREE_ADMIN_API_KEY",
    "DEVIR_B2B_SPREE_ADMIN_API_KEY",
  ]);
  return {
    ready: Boolean(baseUrl && apiKey),
    hasBaseUrl: Boolean(baseUrl),
    hasAdminApiKey: Boolean(apiKey),
  };
}

function spreeAdminConfig(
  env: SpreeAdminEnvironment = process.env,
): { baseUrl: string; apiKey: string } {
  const rawBaseUrl =
    usableEnv(env, ["SPREE_API_URL", "DEVIR_B2B_SPREE_API_URL"]) ??
    "https://bisontcg.spree.sh";
  const apiKey = usableEnv(env, [
    "SPREE_ADMIN_API_KEY",
    "DEVIR_B2B_SPREE_ADMIN_API_KEY",
  ]);
  if (!apiKey || !apiKey.startsWith("sk_")) {
    throw new Error(
      "Falta una Secret API Key de Spree para operaciones de fulfillment",
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(rawBaseUrl);
  } catch {
    throw new Error("SPREE_API_URL no es una URL válida");
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error("SPREE_API_URL debe usar http:// o https://");
  }
  return {
    baseUrl: parsed.toString().replace(/\/$/, ""),
    apiKey,
  };
}

export async function spreeShippingRequest<T>(
  method: "GET" | "POST" | "PATCH" | "DELETE",
  path: string,
  body?: unknown,
  options: {
    env?: SpreeAdminEnvironment;
    fetcher?: typeof fetch;
  } = {},
): Promise<T> {
  const { baseUrl, apiKey } = spreeAdminConfig(options.env);
  const fetcher = options.fetcher ?? fetch;
  if (/^[a-z][a-z\d+.-]*:/i.test(path) || path.startsWith("//")) {
    throw new Error("La ruta de Spree debe ser relativa");
  }

  const adminBase = new URL("/api/v3/admin/", baseUrl);
  const normalizedPath = path.replace(/^\/+/, "");
  const endpoint = new URL(normalizedPath, adminBase);
  if (
    endpoint.origin !== adminBase.origin ||
    !endpoint.pathname.startsWith(adminBase.pathname)
  ) {
    throw new Error("La ruta de Spree sale del endpoint Admin configurado");
  }

  const response = await fetcher(endpoint, {
    method,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-Spree-Api-Key": apiKey,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    throw new SpreeShippingApiError(response.status, endpoint.pathname);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export function listOrderFulfillments(
  orderId: string,
  options?: Parameters<typeof spreeShippingRequest>[3],
): Promise<SpreeFulfillmentList> {
  return spreeShippingRequest(
    "GET",
    `/orders/${encodeURIComponent(orderId)}/fulfillments?limit=100`,
    undefined,
    options,
  );
}

export function updateFulfillmentTracking(
  orderId: string,
  fulfillmentId: string,
  tracking: string,
  trackingCarrier?: string,
  options?: Parameters<typeof spreeShippingRequest>[3],
): Promise<SpreeFulfillment> {
  const value = tracking.trim();
  if (!value) throw new Error("El tracking no puede estar vacío");
  return spreeShippingRequest(
    "PATCH",
    `/orders/${encodeURIComponent(orderId)}/fulfillments/${encodeURIComponent(fulfillmentId)}`,
    {
      tracking: value,
      ...(trackingCarrier?.trim()
        ? { tracking_carrier: trackingCarrier.trim() }
        : {}),
    },
    options,
  );
}

export function fulfillFulfillment(
  orderId: string,
  fulfillmentId: string,
  params: {
    tracking?: string;
    tracking_carrier?: string;
    items?: Array<{ item_id: string; quantity: number }>;
  } = {},
  options?: Parameters<typeof spreeShippingRequest>[3],
): Promise<SpreeFulfillment> {
  return spreeShippingRequest(
    "PATCH",
    `/orders/${encodeURIComponent(orderId)}/fulfillments/${encodeURIComponent(fulfillmentId)}/fulfill`,
    params,
    options,
  );
}

export function markFulfillmentDelivered(
  orderId: string,
  fulfillmentId: string,
  deliveredAt = new Date().toISOString(),
  options?: Parameters<typeof spreeShippingRequest>[3],
): Promise<SpreeFulfillment> {
  return spreeShippingRequest(
    "PATCH",
    `/orders/${encodeURIComponent(orderId)}/fulfillments/${encodeURIComponent(fulfillmentId)}/mark_delivered`,
    { delivered_at: deliveredAt },
    options,
  );
}
