import { createHmac, timingSafeEqual } from "node:crypto";

export type ShippingOperationsEnvironment = Record<string, string | undefined>;

export const SHIPPING_OPERATIONS_SESSION_COOKIE = "bison_shipping_ops";
const SESSION_PURPOSE = "bison-shipping-operations-v1";

function secureEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function configuredToken(
  env: ShippingOperationsEnvironment = process.env,
): string | undefined {
  const token = env.SHIPPING_OPERATIONS_TOKEN?.trim();
  return token || undefined;
}

export function hasShippingOperationsToken(
  env: ShippingOperationsEnvironment = process.env,
): boolean {
  return Boolean(configuredToken(env));
}

export function shippingOperationsTokenMatches(
  provided: string,
  env: ShippingOperationsEnvironment = process.env,
): boolean {
  const expected = configuredToken(env);
  const value = provided.trim();
  return Boolean(expected && value && secureEqual(value, expected));
}

export function getShippingOperationsSessionValue(
  env: ShippingOperationsEnvironment = process.env,
): string | undefined {
  const token = configuredToken(env);
  if (!token) return undefined;
  return createHmac("sha256", token)
    .update(SESSION_PURPOSE)
    .digest("base64url");
}

export function isShippingOperationsSessionValue(
  value: string | undefined,
  env: ShippingOperationsEnvironment = process.env,
): boolean {
  if (!value) return false;
  const expected = getShippingOperationsSessionValue(env);
  return Boolean(expected && secureEqual(value, expected));
}

function cookieValue(header: string | null, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const [rawName, ...rawValue] = part.trim().split("=");
    if (rawName === name) return rawValue.join("=");
  }
  return undefined;
}

export function isShippingOperationsAuthorized(
  request: Request,
  env: ShippingOperationsEnvironment = process.env,
): boolean {
  const authorization = request.headers.get("authorization") ?? "";
  if (authorization.startsWith("Bearer ")) {
    const bearer = authorization.slice(7).trim();
    if (shippingOperationsTokenMatches(bearer, env)) return true;
  }

  const session = cookieValue(
    request.headers.get("cookie"),
    SHIPPING_OPERATIONS_SESSION_COOKIE,
  );
  return isShippingOperationsSessionValue(session, env);
}
