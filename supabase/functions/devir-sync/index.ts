import { createClient } from "npm:@supabase/supabase-js@2.116.0";
import {
  canWriteManagedCatalogPrice,
  catalogReviewFingerprint,
  effectiveCatalogFulfillmentMode,
  isCatalogReviewApproved,
  type CatalogFulfillmentMode,
  type CatalogReviewDecision,
  shouldAllowSupplierBackorder,
  shouldAutoPublishCatalogProduct,
  shouldListCatalogProduct,
  shouldRequireCatalogReview,
} from "../_shared/catalog-publish-policy.ts";
import {
  buildCanonicalIdentity,
  type CanonicalIdentity,
  type NormalizedSupplierCatalogItem,
  normalizeSupplierCode,
  normalizeSupplierItem,
  type SupplierCatalogItem,
  type SupplierOfferCandidate,
  selectBestOffer,
} from "../_shared/catalog-sourcing.ts";
import {
  inferDevirCategoryKey,
  isCatalanCatalogProduct,
  normalizeDevirCatalogTitle,
  normalizeDevirRetailUnit,
} from "../_shared/devir-catalog-policy.ts";
import {
  requiresManualPackSplitReview,
  supplierPackChildVariantIds,
} from "../_shared/mtg-precon-policy.ts";
import {
  commercialPricingProfile,
  deterministicOfferScore,
  madridCommercialDay,
  rotatingOfferDiscount,
  rotatingOfferFloorMargin,
} from "../_shared/commercial-pricing-policy.ts";
import {
  supplierMinimumOrderRiskSurcharge,
  supplierVatRate,
} from "../_shared/supplier-pricing-policy.ts";
import {
  requireTcgFactoryCredentials,
  TCGFACTORY_SUPPLIER_CODE,
  tcgFactoryRecordToCatalogItem,
} from "../_shared/tcgfactory-adapter.ts";
import {
  isTcgFactoryKnownPollutionMediaReference,
  isTcgFactoryProductImageReference,
  parseTcgFactoryAuthenticatedPrice,
  parseTcgFactoryListing,
  parseTcgFactoryMinimumOrderQuantity,
  parseTcgFactoryPublicProduct,
  TCGFACTORY_ACCESSORIES_URL,
  TCGFACTORY_ACCESSORY_CATEGORY_SPECS,
  TCGFACTORY_BASE_URL,
  type TcgFactoryPublicProduct,
} from "../_shared/tcgfactory-web.ts";

type Json = Record<string, unknown>;

interface ConfigRow {
  id: string;
  enabled: boolean;
  base_url: string;
  spree_api_url: string;
  spree_admin_api_key: string | null;
  session_state: {
    cookies?: Array<{
      name: string;
      value: string;
      domain: string;
      path?: string;
      expires?: number;
    }>;
  } | null;
  worker_token_hash: string | null;
  interval_hours: number;
  batch_size: number;
  max_pages: number;
  phase: "idle" | "categories" | "products" | "error";
  active_cycle_id: string | null;
  next_due_at: string;
}

interface JobRow {
  id: number;
  cycle_id: string;
  kind: "category" | "product";
  url: string;
  page: number;
  attempts: number;
}

interface SpreeProduct {
  id: string;
  name: string;
  status?: string;
  tags?: string[];
}

interface SpreeVariant {
  id: string;
  sku?: string | null;
  cost_price?: string | number | null;
  price?:
    | { amount?: string | number | null; currency?: string | null }
    | string
    | number
    | null;
  prices?: Array<{ amount?: string | number | null; currency?: string | null }>;
  purchasable?: boolean;
  in_stock?: boolean;
  backorderable?: boolean;
  preorder?: boolean;
  preorderable?: boolean;
  total_on_hand?: number;
}

interface SpreeStockLocation {
  id: string;
  name?: string;
  active?: boolean;
  default?: boolean;
}

interface SpreeCategory {
  id: string;
  name: string;
  permalink?: string;
  parent_id?: string | null;
}

interface SpreeFieldDefinition {
  id: string;
  namespace: string;
  key: string;
  resource_type: string;
}

interface SpreeCustomField {
  id: string;
  key: string;
  value: unknown;
  custom_field_definition_id?: string;
}

interface DevirProduct {
  sku: string;
  name: string;
  url: string;
  purchasePrice: number | null;
  referencePriceNet: number | null;
  availability: "available" | "preorder" | "unavailable" | "unknown";
  availabilityLabel: string | null;
  releaseDate: string | null;
  imageUrls: string[];
  weightKg?: number | null;
  widthCm?: number | null;
  heightCm?: number | null;
  depthCm?: number | null;
  categoryKeyOverride?: string | null;
  retailUnitNormalized?: boolean;
  supplierPackUnits?: number;
  supplierMinimumQuantity?: number | null;
}

interface CatalogSupplierRow {
  id: string;
  code: string;
  name: string;
  adapter_key: string;
  enabled: boolean;
  priority: number;
  default_currency: string;
  stale_after_hours: number;
  sync_interval_hours?: number;
  last_completed_run_id?: string | null;
  config?: Record<string, unknown> | null;
}

interface CatalogProductRow {
  id: string;
  canonical_key: string;
  name: string;
  category_key: string | null;
  spree_product_id: string | null;
  review_decision: CatalogReviewDecision;
  approved_review_fingerprint: string | null;
  review_decided_at?: string | null;
  review_note?: string | null;
}

interface CatalogVariantRow {
  id: string;
  product_id: string;
  canonical_key: string;
  canonical_sku: string;
  name: string | null;
  option_values: Record<string, string> | null;
  option_signature: string;
  spree_variant_id: string | null;
  selected_offer_id: string | null;
  last_auto_price: number | string | null;
  fulfillment_mode: CatalogFulfillmentMode;
}

interface CatalogOfferRow {
  id: string;
  supplier_id: string;
  variant_id: string;
  external_variant_id: string;
  supplier_sku: string;
  purchase_price: number | string;
  shipping_cost: number | string;
  normalized_cost: number | string;
  currency: string;
  availability: DevirProduct["availability"];
  active: boolean;
  last_seen_at: string;
  source_url: string | null;
  raw_payload: Record<string, unknown> | null;
  catalog_suppliers?: CatalogSupplierRow | CatalogSupplierRow[];
}

interface CatalogResolution {
  supplier: CatalogSupplierRow;
  product: CatalogProductRow;
  variant: CatalogVariantRow;
  offer: CatalogOfferRow;
  identity: CanonicalIdentity;
  item: NormalizedSupplierCatalogItem;
}

interface CatalogOfferSelection {
  selected: CatalogOfferRow | null;
  selectedSupplier: CatalogSupplierRow | null;
  offers: Array<{
    id: string;
    supplierCode: string;
    supplierName: string;
    supplierSku: string;
    normalizedCost: number;
    currency: string;
    availability: DevirProduct["availability"];
    sourceUrl: string | null;
    lastSeenAt: string;
    selected: boolean;
  }>;
}

interface SelectedSupplyRow {
  variant_id: string;
  canonical_sku: string;
  spree_variant_id: string | null;
  product_id: string;
  product_name: string;
  spree_product_id: string | null;
  supplier_code: string | null;
  supplier_name: string | null;
  supplier_enabled?: boolean | null;
  supplier_stale_after_hours?: number | null;
  supplier_sku: string | null;
  normalized_cost: number | string | null;
  currency: string | null;
  reference_price_net: number | string | null;
  availability: DevirProduct["availability"] | null;
  source_url: string | null;
  last_seen_at: string | null;
  supplier_config?: Record<string, unknown> | null;
  selected_offer_payload?: Record<string, unknown> | null;
  minimum_order_quantity?: number | null;
  fulfillment_mode?: CatalogFulfillmentMode | null;
}

interface CatalogSpreeContext {
  catalogProductId: string;
  catalogVariantId: string;
  productName: string;
  variantName: string | null;
  canonicalSku: string;
  options: Record<string, string>;
  supplier: CatalogSupplierRow;
  offer: CatalogOfferRow;
  offers: CatalogOfferSelection["offers"];
  existingProduct: SpreeProduct | null;
  existingVariant: SpreeVariant | null;
  lastAutoPrice: number | null;
  reviewDecision: CatalogReviewDecision;
  approvedReviewFingerprint: string | null;
  fulfillmentMode: CatalogFulfillmentMode;
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}

function decodeHtml(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

function stripHtml(value: string): string {
  return decodeHtml(
    value
      .replace(/<[^>]*>/g, " ")
      .replace(/\s+/g, " ")
      .trim(),
  );
}

function cleanDevirTitle(value: string): string {
  return normalizeDevirCatalogTitle(value);
}

function absoluteUrl(value: string, sourceUrl: string): string | null {
  try {
    const url = new URL(decodeHtml(value.replace(/\\\//g, "/")), sourceUrl);
    if (!["http:", "https:"].includes(url.protocol)) return null;
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

function cookiesFor(config: ConfigRow, url: string): string {
  const target = new URL(url);
  const nowSeconds = Date.now() / 1000;
  return (config.session_state?.cookies ?? [])
    .filter((cookie) => {
      const domain = cookie.domain.replace(/^\./, "");
      const hostOk =
        target.hostname === domain || target.hostname.endsWith("." + domain);
      const pathOk = target.pathname.startsWith(cookie.path || "/");
      const expiryOk =
        !cookie.expires || cookie.expires < 0 || cookie.expires > nowSeconds;
      return hostOk && pathOk && expiryOk;
    })
    .map((cookie) => cookie.name + "=" + cookie.value)
    .join("; ");
}

function splitCombinedSetCookie(value: string): string[] {
  return value
    .split(/,(?=\s*[^;,\s]+=)/g)
    .map((part) => part.trim())
    .filter(Boolean);
}

function parseSetCookies(headers: Headers): string[] {
  const extended = headers as Headers & { getSetCookie?: () => string[] };
  const values = extended.getSetCookie?.();
  if (values?.length) return values;
  const single = headers.get("set-cookie");
  return single ? splitCombinedSetCookie(single) : [];
}

function mergeSessionCookies(
  current: ConfigRow["session_state"],
  setCookies: string[],
  baseUrl: string,
): ConfigRow["session_state"] {
  const map = new Map(
    (current?.cookies ?? []).map((cookie) => [
      cookie.name + "|" + cookie.domain + "|" + (cookie.path || "/"),
      cookie,
    ]),
  );
  const host = new URL(baseUrl).hostname;

  for (const raw of setCookies) {
    const parts = raw.split(";").map((part) => part.trim());
    const [pair, ...attrs] = parts;
    const equals = pair.indexOf("=");
    if (equals <= 0) continue;
    const name = pair.slice(0, equals);
    const value = pair.slice(equals + 1);
    let domain = host;
    let path = "/";
    let expires = -1;

    for (const attr of attrs) {
      const [attrName, ...rest] = attr.split("=");
      const attrValue = rest.join("=");
      if (/^domain$/i.test(attrName) && attrValue) domain = attrValue;
      else if (/^path$/i.test(attrName) && attrValue) path = attrValue;
      else if (/^max-age$/i.test(attrName) && attrValue) {
        const seconds = Number(attrValue);
        if (Number.isFinite(seconds)) expires = Date.now() / 1000 + seconds;
      } else if (/^expires$/i.test(attrName) && attrValue) {
        const timestamp = Date.parse(attrValue);
        if (Number.isFinite(timestamp)) expires = timestamp / 1000;
      }
    }

    const key = name + "|" + domain + "|" + path;
    if (!value || expires === 0 || (expires > 0 && expires < Date.now() / 1000))
      map.delete(key);
    else map.set(key, { name, value, domain, path, expires });
  }

  return { ...(current ?? {}), cookies: Array.from(map.values()) };
}

async function automaticDevirLogin(
  config: ConfigRow,
): Promise<ConfigRow["session_state"]> {
  const { data: credentials, error: credentialsError } = await supabase.rpc(
    "devir_sync_get_credentials",
  );
  if (credentialsError) throw credentialsError;
  const username =
    typeof credentials?.username === "string" ? credentials.username : "";
  const password =
    typeof credentials?.password === "string" ? credentials.password : "";
  if (!username || !password) {
    throw new Error(
      "SESSION_EXPIRED: faltan credenciales Devir en Supabase Vault. Ejecuta pnpm devir:cloud:credentials.",
    );
  }

  const loginUrl =
    config.base_url.replace(/\/$/, "") + "/customer/account/login/";
  const loginPage = await fetch(loginUrl, {
    redirect: "follow",
    headers: {
      accept: "text/html,application/xhtml+xml",
      "accept-language": "es-ES,es;q=0.9",
      "user-agent": "BisonTCG catalog sync/1.0",
    },
  });
  const loginHtml = await loginPage.text();
  if (!loginPage.ok)
    throw new Error("LOGIN_FAILED: Devir devolvió HTTP " + loginPage.status);

  let state = mergeSessionCookies(
    config.session_state,
    parseSetCookies(loginPage.headers),
    config.base_url,
  );
  const formKey =
    loginHtml.match(/name=["']form_key["'][^>]*value=["']([^"']+)["']/i)?.[1] ??
    loginHtml.match(/value=["']([^"']+)["'][^>]*name=["']form_key["']/i)?.[1] ??
    "";
  const actionRaw =
    loginHtml.match(
      /<form\b[^>]*id=["']login-form["'][^>]*action=["']([^"']+)["']/i,
    )?.[1] ??
    loginHtml.match(
      /<form\b[^>]*action=["']([^"']*customer\/account\/loginPost[^"']*)["']/i,
    )?.[1] ??
    "/customer/account/loginPost/";
  const action = new URL(decodeHtml(actionRaw), config.base_url).toString();

  const body = new URLSearchParams();
  if (formKey) body.set("form_key", formKey);
  body.set("login[username]", username);
  body.set("login[password]", password);

  const loginResponse = await fetch(action, {
    method: "POST",
    redirect: "manual",
    headers: {
      accept: "text/html,application/xhtml+xml",
      "content-type": "application/x-www-form-urlencoded",
      "user-agent": "BisonTCG catalog sync/1.0",
      cookie: cookiesFor({ ...config, session_state: state }, action),
      referer: loginUrl,
    },
    body,
  });
  state = mergeSessionCookies(
    state,
    parseSetCookies(loginResponse.headers),
    config.base_url,
  );

  const accountUrl = config.base_url.replace(/\/$/, "") + "/customer/account/";
  const probe = await fetch(accountUrl, {
    redirect: "follow",
    headers: {
      accept: "text/html,application/xhtml+xml",
      "user-agent": "BisonTCG catalog sync/1.0",
      cookie: cookiesFor({ ...config, session_state: state }, accountUrl),
    },
  });
  const probeHtml = await probe.text();
  if (
    !probe.ok ||
    /customer\/account\/login|form-login|customer-login/i.test(
      probe.url + " " + probeHtml.slice(0, 12000),
    )
  ) {
    const visibleError = stripHtml(
      probeHtml.match(
        /<[^>]*class=["'][^"']*(?:message-error|messages|mage-error)[^"']*["'][^>]*>[\s\S]*?<\/[^>]+>/i,
      )?.[0] ?? "",
    ).slice(0, 180);
    const captcha = /captcha|recaptcha|hcaptcha|cloudflare|turnstile/i.test(
      probeHtml + " " + loginHtml,
    );
    const reason = captcha
      ? "Devir exige CAPTCHA/anti-bot o interacción adicional."
      : visibleError
        ? visibleError
        : "Devir mantuvo la pantalla de login tras enviar el formulario.";
    throw new Error("LOGIN_FAILED: " + reason);
  }
  state = mergeSessionCookies(
    state,
    parseSetCookies(probe.headers),
    config.base_url,
  );

  const { error: updateError } = await supabase
    .from("devir_sync_config")
    .update({
      session_state: state,
      last_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", "primary");
  if (updateError) throw updateError;

  return state;
}

async function devirFetch(
  config: ConfigRow,
  url: string,
  retryLogin = true,
): Promise<string> {
  const response = await fetch(url, {
    redirect: "follow",
    headers: {
      accept: "text/html,application/xhtml+xml",
      "accept-language": "es-ES,es;q=0.9,en;q=0.7",
      "user-agent": "BisonTCG catalog sync/1.0",
      cookie: cookiesFor(config, url),
    },
  });
  const html = await response.text();
  if (!response.ok)
    throw new Error("Devir HTTP " + response.status + " en " + url);
  if (
    /customer\/account\/login|form-login|customer-login/i.test(
      response.url + " " + html.slice(0, 12000),
    )
  ) {
    if (!retryLogin)
      throw new Error(
        "SESSION_EXPIRED: la sesión B2B no pudo renovarse automáticamente.",
      );
    const sessionState = await automaticDevirLogin(config);
    return await devirFetch(
      { ...config, session_state: sessionState },
      url,
      false,
    );
  }
  return html;
}

function anchorHrefs(html: string): Array<{ tag: string; href: string }> {
  const found: Array<{ tag: string; href: string }> = [];
  for (const match of html.matchAll(/<a\b[^>]*>/gi)) {
    const tag = match[0];
    const href = tag.match(/\bhref\s*=\s*["']([^"']+)["']/i)?.[1];
    if (href) found.push({ tag, href });
  }
  return found;
}

function discoverCategories(html: string, baseUrl: string): string[] {
  const nav =
    html.match(
      /<nav\b[^>]*(?:navigation|data-action=["']navigation)[^>]*>[\s\S]*?<\/nav>/i,
    )?.[0] ??
    html.match(
      /<div\b[^>]*class=["'][^"']*navigation[^"']*["'][^>]*>[\s\S]*?<\/div>/i,
    )?.[0] ??
    html;
  const origin = new URL(baseUrl).origin;
  const excluded = [
    "/customer",
    "/checkout",
    "/catalogsearch",
    "/search",
    "/wishlist",
    "/sales",
    "/contact",
    "/privacy",
    "/cookie",
    "/cart",
    "/actualidad",
  ];
  const values = anchorHrefs(nav)
    .map(({ href }) => absoluteUrl(href, baseUrl))
    .filter((url): url is string => Boolean(url))
    .filter((value) => {
      const url = new URL(value);
      if (url.origin !== origin) return false;
      const path = url.pathname.replace(/\/+$/, "");
      if (!path) return false;
      return !excluded.some(
        (prefix) => path === prefix || path.startsWith(prefix + "/"),
      );
    })
    .map((value) => {
      const url = new URL(value);
      url.search = "";
      return url.toString();
    });
  values.push(new URL("/juegos-de-cartas-coleccionables", baseUrl).toString());
  return Array.from(new Set(values));
}

function productLinks(html: string, sourceUrl: string): string[] {
  const links = anchorHrefs(html)
    .filter(({ tag }) => /product-item-link/i.test(tag))
    .map(({ href }) => absoluteUrl(href, sourceUrl))
    .filter((url): url is string => Boolean(url));
  return Array.from(new Set(links));
}

function attribute(tag: string, name: string): string | null {
  return (
    tag.match(
      new RegExp("\\b" + name + "\\s*=\\s*[\"']([^\"']+)[\"']", "i"),
    )?.[1] ?? null
  );
}

function parsePriceTag(html: string, typePattern: RegExp): number | null {
  for (const match of html.matchAll(
    /<[^>]+data-price-(?:type|amount)=[^>]+>/gi,
  )) {
    const tag = match[0];
    const type = attribute(tag, "data-price-type") ?? "";
    if (!typePattern.test(type)) continue;
    const raw = attribute(tag, "data-price-amount");
    if (!raw) continue;
    const parsed = Number(raw.replace(",", "."));
    if (Number.isFinite(parsed))
      return Number.isInteger(parsed) && Math.abs(parsed) >= 1000
        ? parsed / 100
        : parsed;
  }
  return null;
}

function releaseDate(html: string): string | null {
  const text = stripHtml(
    html.match(
      /<[^>]*class=["'][^"']*product-item-dateavl[^"']*["'][^>]*>[\s\S]*?<\/[^>]+>/i,
    )?.[0] ?? "",
  );
  const match = text.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  return match ? match[3] + "-" + match[2] + "-" + match[1] : null;
}

function imageUrls(html: string, sourceUrl: string): string[] {
  const found: string[] = [];
  const og = html.match(/<meta\b[^>]*property=["']og:image["'][^>]*>/i)?.[0];
  if (og) {
    const content = attribute(og, "content");
    if (content) found.push(content);
  }
  for (const match of html.matchAll(/"(?:img|full)"\s*:\s*"([^"]+)"/gi))
    found.push(match[1]);
  for (const match of html.matchAll(
    /<img\b[^>]*(?:gallery|fotorama|product-image)[^>]*>/gi,
  )) {
    const tag = match[0];
    const value =
      attribute(tag, "data-full") ??
      attribute(tag, "data-src") ??
      attribute(tag, "src");
    if (value) found.push(value);
  }
  return Array.from(
    new Set(
      found
        .map((value) => absoluteUrl(value, sourceUrl))
        .filter((value): value is string => Boolean(value))
        .filter((value) => !/logo|placeholder|loading|spinner/i.test(value)),
    ),
  ).slice(0, 12);
}

function parseAvailability(html: string): {
  availability: DevirProduct["availability"];
  label: string | null;
} {
  const signals: Array<{ className: string; text: string }> = [];
  for (const match of html.matchAll(
    /<([^\s>]+)\b[^>]*class=["']([^"']*\bstock\b[^"']*)["'][^>]*>[\s\S]*?<\/\1>/gi,
  )) {
    signals.push({ className: match[2] ?? "", text: stripHtml(match[0]) });
  }

  const combined = signals.map((s) => `${s.className} ${s.text}`).join(" | ");
  const meaningful =
    signals
      .map((s) => s.text)
      .find((text) => text && !/^disponibilidad\s*:?$/i.test(text)) ??
    signals.map((s) => s.text).find(Boolean) ??
    "";

  // Magento normally exposes the decisive state in the stock element class
  // ("available" / "unavailable"). Text is a fallback because Devir has used
  // several templates over time. Generic "Disponibilidad:" labels are ignored.
  if (
    /\bunavailable\b|no est[aá] disponible|agotad[oa]|sin stock|no disponible/i.test(
      combined,
    )
  ) {
    return {
      availability: "unavailable",
      label: meaningful || "No disponible",
    };
  }
  if (/pre\s*reserva|preorder|pr[eé]-?commande/i.test(combined)) {
    return { availability: "preorder", label: meaningful || "Pre reserva" };
  }
  if (/\bavailable\b|\ben stock\b|\bdisponible\b/i.test(combined)) {
    return { availability: "available", label: meaningful || "Disponible" };
  }

  // Some Magento themes render inventory state inside JSON configuration.
  const jsonInStock = html.match(
    /["'](?:is_in_stock|isInStock)["']\s*:\s*(true|false)/i,
  )?.[1];
  if (jsonInStock === "true")
    return { availability: "available", label: meaningful || "Disponible" };
  if (jsonInStock === "false")
    return {
      availability: "unavailable",
      label: meaningful || "No disponible",
    };

  const salable = html.match(/["']is_salable["']\s*:\s*["']?([01])["']?/i)?.[1];
  if (salable === "1")
    return { availability: "available", label: meaningful || "Disponible" };
  if (salable === "0")
    return {
      availability: "unavailable",
      label: meaningful || "No disponible",
    };

  return { availability: "unknown", label: meaningful || null };
}

interface GroupingInfo {
  itemKind: "standalone" | "variant_candidate";
  groupKey: string | null;
  groupName: string | null;
  variantLabel: string | null;
  variantPosition: number | null;
  confidence: "none" | "high" | "ambiguous";
}

function normalizeGroupKey(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

function safeMangaEditionSuffix(value: string): boolean {
  const normalized = value
    .trim()
    .replace(/^[\s(\[]+|[\s)\].,;:]+$/g, "")
    .trim();
  if (!normalized) return true;
  return /^(?:ed(?:ici[oó]n)?\.?\s*)?(?:especial|aniversario|limitada|deluxe|coleccionista|de coleccionista)$/i.test(
    normalized,
  );
}

function groupingInfo(product: DevirProduct): GroupingInfo {
  const raw = product.name.replace(/\s+/g, " ").trim();
  // Strong signal for manga/serial publishing. We deliberately do not group
  // arbitrary titles ending in a number (board games, expansions, etc.).
  const match = raw.match(
    /^(.*?)\s+(?:n[uú]m\.?|num\.?|vol\.?|volumen)\s*0*(\d{1,3})(?:\s+de\s+\d+)?(?:[.\s-]+(.*))?$/i,
  );
  if (!match) {
    const tome = raw.match(
      /^(.*?)\s+-?\s*tomo\s*0*(\d{1,3})(?:\s+de\s+\d+)?(?:[.\s-]+(.*))?$/i,
    );
    if (!tome) {
      return {
        itemKind: "standalone",
        groupKey: null,
        groupName: null,
        variantLabel: null,
        variantPosition: null,
        confidence: "none",
      };
    }
    const groupName = tome[1].replace(/[\s:;,.-]+$/g, "").trim();
    const position = Number(tome[2]);
    const suffix = tome[3]?.trim() ?? "";
    const manga = categoryKey(product) === "manga-comic";
    return {
      itemKind: "variant_candidate",
      groupKey: normalizeGroupKey(groupName),
      groupName,
      variantLabel: `Tomo ${String(position).padStart(2, "0")}${suffix ? " · " + suffix : ""}`,
      variantPosition: position,
      confidence:
        manga && safeMangaEditionSuffix(suffix) ? "high" : "ambiguous",
    };
  }

  const groupName = match[1].replace(/[\s:;,.-]+$/g, "").trim();
  const position = Number(match[2]);
  const suffix = match[3]?.trim() ?? "";
  const manga = categoryKey(product) === "manga-comic";
  const specialEdition =
    /ed(?:ici[oó]n)?\.?\s*(?:especial|aniversario|limitada)|especial|aniversario/i.test(
      suffix,
    );
  return {
    itemKind: "variant_candidate",
    groupKey: normalizeGroupKey(groupName),
    groupName,
    variantLabel: `Tomo ${String(position).padStart(2, "0")}${suffix ? " · " + suffix : ""}`,
    variantPosition: position,
    confidence: manga
      ? safeMangaEditionSuffix(suffix)
        ? "high"
        : "ambiguous"
      : specialEdition
        ? "ambiguous"
        : "high",
  };
}

function parseProduct(html: string, url: string): DevirProduct | null {
  const skuHtml =
    html.match(/<[^>]+itemprop=["']sku["'][^>]*>[\s\S]*?<\/[^>]+>/i)?.[0] ?? "";
  const sku = stripHtml(skuHtml);
  if (!sku) return null;
  const titleHtml =
    html.match(
      /<h1\b[^>]*class=["'][^"']*page-title[^"']*["'][^>]*>[\s\S]*?<\/h1>/i,
    )?.[0] ?? "";
  const name = cleanDevirTitle(stripHtml(titleHtml) || sku);
  const maxPrice = parsePriceTag(html, /maxPrice/i);
  const finalPrice = parsePriceTag(html, /finalPrice/i);
  const minPrice = parsePriceTag(html, /minPrice/i);
  const purchasePrice = maxPrice ?? finalPrice ?? minPrice;
  const referencePriceNet =
    parsePriceTag(html, /oldPrice|regularPrice/i) ??
    (maxPrice !== null && purchasePrice !== null && maxPrice > purchasePrice
      ? maxPrice
      : null);
  const stock = parseAvailability(html);
  const retailUnit = normalizeDevirRetailUnit({
    name,
    purchasePrice,
    referencePriceNet,
  });
  return {
    sku,
    name: retailUnit.name,
    url,
    purchasePrice: retailUnit.purchasePrice,
    referencePriceNet: retailUnit.referencePriceNet,
    // Supplier Scene Box / Theme Deck packs must stay intact and in manual
    // review; pack-size metadata is informational, not a signal that the cost
    // was divided into retail units.
    retailUnitNormalized: false,
    supplierPackUnits: retailUnit.unitsPerSupplierPack,
    availability: stock.availability,
    availabilityLabel: stock.label,
    releaseDate: releaseDate(html),
    imageUrls: imageUrls(html, url),
  };
}

function isPack(product: DevirProduct): boolean {
  return requiresManualPackSplitReview(product);
}

function humanizeReviewReason(reason: string): string {
  const [code, ...detailParts] = reason.split(":");
  const detail = detailParts.join(":").trim();
  switch (code.trim()) {
    case "pack_requires_operator_split":
      return "Pack del proveedor: decide si se vende cerrado o se divide en unidades.";
    case "catalan_requires_operator_review":
      return "Producto en catalán: revisa si debe publicarse en la tienda.";
    case "category_unclassified":
      return "No he podido clasificar automáticamente la categoría.";
    case "category_margin_unconfigured":
      return "La categoría no tiene un margen comercial configurado.";
    case "product_image_missing":
      return "Falta una imagen de producto válida.";
    case "grouping_requires_operator_review":
      return "No está claro cómo agrupar sus variantes; necesita una decisión manual.";
    case "fixed_book_cost_floor_above_rrp":
      return "El coste supera el precio legal/recomendado disponible.";
    case "cost_floor_above_reference_rrp":
      return "El coste mínimo calculado supera el PVP de referencia.";
    case "fixed_book_reference_price_missing":
      return "Falta el PVP de referencia necesario para fijar el precio.";
    case "supplier_source_not_verified":
      return "No se ha podido verificar la fuente del proveedor.";
    case "supplier_cost_missing":
      return "Falta el coste de compra del proveedor.";
    case "variant_not_found_for_sku":
      return detail
        ? `No encuentro la variante correspondiente al SKU ${detail}.`
        : "No encuentro la variante correspondiente al SKU.";
    case "canonical_variant_not_found":
      return "La variante canónica no está enlazada correctamente con Spree.";
    case "product_category_conflict":
      return detail
        ? `Las variantes apuntan a categorías distintas: ${detail}.`
        : "Las variantes apuntan a categorías distintas.";
    case "manual_review_required":
      return "Este producto está marcado para revisión manual.";
    case "operator_rejected":
      return "Has decidido mantener este producto fuera de venta.";
    default:
      return detail
        ? `Revisión manual: ${code.trim()} (${detail}).`
        : `Revisión manual: ${code.trim().replaceAll("_", " ")}.`;
  }
}

function humanizeReviewReasons(reasons: Iterable<string>): string {
  const values = Array.from(new Set(Array.from(reasons).filter(Boolean))).map(
    humanizeReviewReason,
  );
  return values.length ? values.join(" ") : "Revisión manual pendiente.";
}

function categoryKey(product: DevirProduct): string {
  return inferDevirCategoryKey(product);
}

function isFixedPriceCandidate(product: DevirProduct, key: string): boolean {
  const digits = product.sku.replace(/\D/g, "");
  if (/^(978|979)\d{10}$/.test(digits)) return true;
  if (key === "manga-comic") return true;
  if (key.startsWith("rol/")) {
    return /manual|gu[ií]a|libro|compendio|aventura|campaña|bestiario|reglamento|suplemento/i.test(
      product.name,
    );
  }
  return false;
}

function shippingEstimate(
  product: DevirProduct,
  key: string,
): {
  weight: number;
  width: number;
  height: number;
  depth: number;
} {
  const value = product.name.toLowerCase();
  if (key === "manga-comic")
    return { weight: 0.45, width: 17, height: 24, depth: 3 };
  if (key.startsWith("rol/"))
    return { weight: 1.2, width: 24, height: 31, depth: 5 };
  if (key === "tcg/mtg" || key === "tcg/yugioh") {
    if (/blister|sobre\b|booster\b(?!.*display)/i.test(value)) {
      return { weight: 0.25, width: 12, height: 18, depth: 4 };
    }
    if (/display|caja|box|\(\s*\d+\s*\)|pack/i.test(value)) {
      return { weight: 1.8, width: 30, height: 22, depth: 18 };
    }
    return { weight: 0.4, width: 18, height: 14, depth: 7 };
  }
  if (key === "accesorios")
    return { weight: 1.0, width: 35, height: 25, depth: 10 };
  if (key === "rol/warhammer")
    return { weight: 1.5, width: 35, height: 25, depth: 10 };
  if (/3d|edici[oó]n\s+3d|big box|deluxe/i.test(value)) {
    return { weight: 4.5, width: 45, height: 45, depth: 20 };
  }
  if (/expansi[oó]n|exp\.|ampliaci[oó]n/i.test(value)) {
    return { weight: 1.2, width: 30, height: 30, depth: 9 };
  }
  return { weight: 2.0, width: 35, height: 35, depth: 12 };
}

function competitivePrice(
  cost: number,
  margin: number,
): {
  grossCost: number;
  retail: number;
  effective: number;
} {
  const grossCost = cost * 1.21;
  const threshold = grossCost / (1 - margin);
  // End in .90 where possible: visually competitive, never below the floor.
  let retail = Math.floor(threshold) + 0.9;
  if (retail + 1e-9 < threshold) retail += 1;
  retail = Math.round(retail * 100) / 100;
  return { grossCost, retail, effective: (retail - grossCost) / retail };
}

function priceFor(
  cost: number,
  margin: number,
  ending = 0.99,
  vatRate = 0.21,
): { grossCost: number; retail: number; effective: number } {
  const grossCost = cost * (1 + vatRate);
  const threshold = grossCost / (1 - margin);
  let retail = Math.floor(threshold) + ending;
  if (retail + 1e-9 < threshold) retail += 1;
  retail = Math.round(retail * 100) / 100;
  return { grossCost, retail, effective: (retail - grossCost) / retail };
}

async function spreeRequest<T>(
  config: ConfigRow,
  method: string,
  path: string,
  body?: unknown,
  attempt = 0,
): Promise<T> {
  if (!config.spree_admin_api_key)
    throw new Error(
      "Falta la Secret API Key de Spree en la configuración cloud.",
    );
  const response = await fetch(
    config.spree_api_url.replace(/\/$/, "") + "/api/v3/admin" + path,
    {
      method,
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "x-spree-api-key": config.spree_admin_api_key,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    },
  );
  const text = await response.text();

  if (
    (response.status === 429 ||
      [500, 502, 503, 504].includes(response.status)) &&
    attempt < 4
  ) {
    const retryAfter = Number(response.headers.get("retry-after"));
    const waitMs =
      Number.isFinite(retryAfter) && retryAfter > 0
        ? retryAfter * 1000
        : Math.min(6000, 750 * 2 ** attempt);
    await new Promise((resolve) => setTimeout(resolve, waitMs));
    return await spreeRequest<T>(config, method, path, body, attempt + 1);
  }

  let payload: unknown = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = text;
    }
  }
  if (!response.ok)
    throw new Error(
      "Spree " +
        response.status +
        " " +
        path +
        ": " +
        String(text).slice(0, 350),
    );
  return payload as T;
}

async function ensureProductsInCategories(
  config: ConfigRow,
  productIds: string[],
  categoryIds: string[],
): Promise<void> {
  if (productIds.length === 0 || categoryIds.length === 0) return;
  await spreeRequest(config, "POST", "/products/bulk_add_to_categories", {
    ids: productIds,
    category_ids: categoryIds,
  });
}

async function ensureProductsInDefaultChannel(
  config: ConfigRow,
  productIds: string[],
): Promise<void> {
  if (productIds.length === 0) return;
  const channels = await spreeList<SpreeChannel>(config, "/channels");
  const channel =
    channels.find((item) => item.active && item.default) ??
    channels.find((item) => item.active) ??
    channels[0];
  if (!channel) throw new Error("No hay canal de venta activo en Spree");
  await spreeRequest(
    config,
    "POST",
    "/channels/" + encodeURIComponent(channel.id) + "/add_products",
    { product_ids: productIds },
  );
}

async function spreeList<T>(config: ConfigRow, path: string): Promise<T[]> {
  const sep = path.includes("?") ? "&" : "?";
  const payload = await spreeRequest<{ data?: T[] }>(
    config,
    "GET",
    path + sep + "limit=100",
  );
  return payload.data ?? [];
}

async function spreeListAll<T>(
  config: ConfigRow,
  path: string,
  maxPages = 25,
): Promise<T[]> {
  const rows: T[] = [];
  for (let page = 1; page <= maxPages; page += 1) {
    const sep = path.includes("?") ? "&" : "?";
    const payload = await spreeRequest<{
      data?: T[];
      meta?: { next?: number | null; page?: number; pages?: number };
    }>(config, "GET", path + sep + "limit=100&page=" + page);
    const batch = payload.data ?? [];
    rows.push(...batch);
    const pages = Number(payload.meta?.pages);
    if (
      batch.length < 100 ||
      payload.meta?.next == null ||
      (Number.isFinite(pages) && page >= pages)
    ) {
      break;
    }
  }
  return rows;
}

function variantPrice(variant: SpreeVariant): number | null {
  if (typeof variant.price === "number") return variant.price;
  if (typeof variant.price === "string") {
    const n = Number(variant.price);
    return Number.isFinite(n) ? n : null;
  }
  if (variant.price && typeof variant.price === "object") {
    const n = Number(variant.price.amount);
    if (Number.isFinite(n)) return n;
  }
  const eur =
    variant.prices?.find((p) => p.currency?.toUpperCase() === "EUR") ??
    variant.prices?.[0];
  const n = Number(eur?.amount);
  return Number.isFinite(n) ? n : null;
}

interface SpreePrice {
  id: string;
  amount?: string | number | null;
  currency?: string | null;
  price_list_id?: string | null;
  variant_id?: string | null;
}

async function upsertBasePrice(
  config: ConfigRow,
  variantId: string,
  amount: number,
  compareAtAmount?: number | null,
): Promise<void> {
  const prices = await spreeList<SpreePrice>(
    config,
    "/prices?q[variant_id_eq]=" +
      encodeURIComponent(variantId) +
      "&q[currency_eq]=EUR",
  );
  const basePrice =
    prices.find(
      (price) =>
        !price.price_list_id &&
        (price.currency ?? "EUR").toUpperCase() === "EUR",
    ) ?? prices.find((price) => !price.price_list_id);

  if (basePrice) {
    await spreeRequest(
      config,
      "PATCH",
      "/prices/" + encodeURIComponent(basePrice.id),
      // Older Spree 5.x builds accept Price updates through the Rails-style
      // nested payload even when the newer OpenAPI documents a flat body.
      {
        // Send JSON numbers, not locale-sensitive decimal strings. This store
        // parses strings using the Spanish locale, where "." is a thousands
        // separator ("126.90" would otherwise become 12690).
        amount,
        ...(compareAtAmount !== undefined
          ? { compare_at_amount: compareAtAmount }
          : {}),
      },
    );
    return;
  }

  await spreeRequest(config, "POST", "/prices", {
    variant_id: variantId,
    currency: "EUR",
    amount,
    ...(compareAtAmount !== undefined
      ? { compare_at_amount: compareAtAmount }
      : {}),
  });
}

async function upsertBasePrices(
  config: ConfigRow,
  prices: Array<{ variant_id: string; amount: number }>,
): Promise<void> {
  for (let index = 0; index < prices.length; index += 8) {
    await Promise.all(
      prices
        .slice(index, index + 8)
        .map((price) =>
          upsertBasePrice(config, price.variant_id, price.amount),
        ),
    );
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

async function updateVariantRetailPrice(
  config: ConfigRow,
  productId: string,
  variantId: string,
  amount: number,
): Promise<SpreeVariant> {
  await spreeRequest<SpreeProduct>(
    config,
    "PATCH",
    "/products/" + encodeURIComponent(productId),
    {
      variants: [
        {
          id: variantId,
          prices: [{ currency: "EUR", amount }],
        },
      ],
    },
  );
  return await spreeRequest<SpreeVariant>(
    config,
    "GET",
    "/products/" +
      encodeURIComponent(productId) +
      "/variants/" +
      encodeURIComponent(variantId),
  );
}

async function findSpreeProduct(
  config: ConfigRow,
  sku: string,
): Promise<{ product: SpreeProduct; variant: SpreeVariant } | null> {
  const products = await spreeList<SpreeProduct>(
    config,
    "/products?q[search]=" + encodeURIComponent(sku),
  );
  for (const product of products) {
    const variants = await spreeList<SpreeVariant>(
      config,
      "/products/" + encodeURIComponent(product.id) + "/variants",
    );
    const variant = variants.find((v) => v.sku?.trim() === sku);
    if (variant) return { product, variant };
  }
  return null;
}

async function spreeCategories(config: ConfigRow): Promise<SpreeCategory[]> {
  return await spreeList<SpreeCategory>(config, "/categories");
}

function categoryForKey(
  categories: SpreeCategory[],
  key: string,
): SpreeCategory | undefined {
  const aliases: Record<string, string[]> = {
    "juegos-de-mesa/general": [
      "juegos-de-mesa/general",
      "juegos-de-mesa/juegos-general",
      "juegos-general",
    ],
    "juegos-de-mesa/expansiones": [
      "juegos-de-mesa/expansiones",
      "juegos-de-mesa/juegos-expansiones",
      "juegos-expansiones",
    ],
    "juegos-de-mesa/infantil": [
      "juegos-de-mesa/infantil",
      "juegos-de-mesa/juegos-infantil",
      "juegos-infantil",
    ],
    "rol/dungeons-dragons": [
      "rol/dungeons-dragons",
      "rol/rol-dungeons-dragons",
      "rol-dungeons-dragons",
    ],
    "rol/pathfinder": [
      "rol/pathfinder",
      "rol/rol-pathfinder",
      "rol-pathfinder",
    ],
    "rol/warhammer": [
      "rol/warhammer",
      "rol/rol-warhammer",
      "rol-warhammer",
      "warhammer",
    ],
    "rol/otros": ["rol/otros", "rol/rol-otros", "rol-otros"],
    "tcg/mtg": ["tcg/mtg"],
    "tcg/yugioh": ["tcg/yugioh"],
    "manga-comic": ["manga-comic"],
    accesorios: ["accesorios"],
  };
  const candidates = aliases[key] ?? [key];
  return categories.find((category) =>
    candidates.includes(category.permalink ?? ""),
  );
}

async function categoryMargin(
  config: ConfigRow,
  category: SpreeCategory | null,
): Promise<number | null> {
  if (!category) return null;
  try {
    const fields = await spreeList<SpreeCustomField>(
      config,
      "/categories/" + category.id + "/custom_fields",
    );
    const raw = fields.find((f) => f.key === "pricing.target_margin")?.value;
    const value = Number(raw);
    return Number.isFinite(value) && value >= 0 && value < 0.95 ? value : null;
  } catch {
    return null;
  }
}

async function definitions(
  config: ConfigRow,
): Promise<Map<string, SpreeFieldDefinition>> {
  let defs: SpreeFieldDefinition[];
  try {
    defs = await spreeList<SpreeFieldDefinition>(
      config,
      "/custom_field_definitions",
    );
  } catch (error) {
    console.error(
      "Spree custom-field definitions unavailable; continuing without metadata",
      error instanceof Error ? error.message : String(error),
    );
    return new Map();
  }
  let result = new Map(
    defs
      .filter((d) => d.resource_type === "Spree::Product")
      .map((d) => [d.namespace + "." + d.key, d]),
  );

  const required = [
    {
      namespace: "sourcing",
      key: "variant_provenance",
      label: "Compras · Procedencia por variante",
      field_type: "long_text",
    },
    {
      namespace: "catalog",
      key: "review_status",
      label: "⚠ Catálogo · Necesita tu ayuda",
      field_type: "short_text",
    },
    {
      namespace: "catalog",
      key: "review_reason",
      label: "⚠ Catálogo · Motivo de revisión",
      field_type: "long_text",
    },
    {
      namespace: "catalog",
      key: "review_pending_fingerprint",
      label: "Catálogo · Motivos pendientes registrados",
      field_type: "long_text",
    },
    {
      namespace: "pricing",
      key: "profile",
      label: "Precio · Perfil comercial",
      field_type: "short_text",
    },
  ];

  let createdAny = false;
  for (const definition of required) {
    const fullKey = definition.namespace + "." + definition.key;
    if (result.has(fullKey)) continue;
    try {
      await spreeRequest(config, "POST", "/custom_field_definitions", {
        ...definition,
        resource_type: "Spree::Product",
        storefront_visible: false,
      });
      createdAny = true;
    } catch (error) {
      // Custom metadata is auxiliary. A Spree definitions outage must not stop
      // supplier freshness, stock safety or the catalog crawl.
      if (!String(error).includes("422")) {
        console.error(
          "Could not create optional Spree custom-field definition",
          fullKey,
          error instanceof Error ? error.message : String(error),
        );
      }
    }
  }

  if (createdAny) {
    try {
      defs = await spreeList<SpreeFieldDefinition>(
        config,
        "/custom_field_definitions",
      );
      result = new Map(
        defs
          .filter((d) => d.resource_type === "Spree::Product")
          .map((d) => [d.namespace + "." + d.key, d]),
      );
    } catch (error) {
      console.error(
        "Spree custom-field definitions could not be refreshed; using known definitions",
        error instanceof Error ? error.message : String(error),
      );
    }
  }
  return result;
}

async function productFields(
  config: ConfigRow,
  productId: string,
): Promise<SpreeCustomField[]> {
  return await spreeList<SpreeCustomField>(
    config,
    "/products/" + productId + "/custom_fields",
  );
}

async function upsertProductFields(
  config: ConfigRow,
  productId: string,
  defs: Map<string, SpreeFieldDefinition>,
  values: Record<string, unknown>,
  current?: SpreeCustomField[],
): Promise<void> {
  const fields = current ?? (await productFields(config, productId));
  const byKey = new Map(fields.map((f) => [f.key, f]));
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined || value === null || value === "") continue;
    const def = defs.get(key);
    if (!def) continue;
    const old = byKey.get(key);
    if (old) {
      if (String(old.value) !== String(value)) {
        await spreeRequest(
          config,
          "PATCH",
          "/products/" + productId + "/custom_fields/" + old.id,
          { value },
        );
      }
    } else {
      const created = await spreeRequest<SpreeCustomField>(
        config,
        "POST",
        "/products/" + productId + "/custom_fields",
        {
          custom_field_definition_id: def.id,
          value,
        },
      );
      byKey.set(key, created);
    }
  }
}

async function upsertVariantProvenance(
  config: ConfigRow,
  productId: string,
  defs: Map<string, SpreeFieldDefinition>,
  variantId: string,
  canonicalSku: string,
  options: Record<string, string>,
  selected: { supplier: CatalogSupplierRow; offer: CatalogOfferRow } | null,
  offers: CatalogOfferSelection["offers"],
): Promise<void> {
  const fields = await productFields(config, productId);
  const current = fields.find(
    (field) =>
      field.key === "sourcing.variant_provenance" ||
      field.key === "variant_provenance",
  );
  let document: {
    version: number;
    variants: Record<string, unknown>;
  } = { version: 1, variants: {} };
  try {
    const parsed =
      typeof current?.value === "string"
        ? JSON.parse(current.value)
        : current?.value;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const candidate = parsed as {
        version?: unknown;
        variants?: unknown;
      };
      document = {
        version: Number(candidate.version) || 1,
        variants:
          candidate.variants &&
          typeof candidate.variants === "object" &&
          !Array.isArray(candidate.variants)
            ? (candidate.variants as Record<string, unknown>)
            : {},
      };
    }
  } catch {
    document = { version: 1, variants: {} };
  }

  document.variants[variantId] = {
    canonicalSku,
    options,
    selectedSupplier: selected
      ? {
          code: selected.supplier.code,
          name: selected.supplier.name,
          supplierSku: selected.offer.supplier_sku,
          offerId: selected.offer.id,
          sourceUrl: selected.offer.source_url,
          normalizedCost: Number(selected.offer.normalized_cost),
          currency: selected.offer.currency,
          availability: selected.offer.availability,
          selectedAt: new Date().toISOString(),
        }
      : null,
    offers,
  };

  await upsertProductFields(
    config,
    productId,
    defs,
    { "sourcing.variant_provenance": JSON.stringify(document) },
    fields,
  );
}

interface SpreeStockItem {
  id: string;
  variant_id?: string | null;
  stock_location_id?: string | null;
  count_on_hand?: number;
  backorderable?: boolean;
}

let cachedDefaultStockLocationId: string | null = null;

async function defaultStockLocationId(config: ConfigRow): Promise<string> {
  if (cachedDefaultStockLocationId) return cachedDefaultStockLocationId;
  const locations = await spreeList<SpreeStockLocation>(
    config,
    "/stock_locations",
  );
  const location =
    locations.find((item) => item.active && item.default) ??
    locations.find((item) => item.active) ??
    locations[0];
  if (!location) throw new Error("No hay ubicación de stock activa en Spree");
  cachedDefaultStockLocationId = location.id;
  return location.id;
}

async function patchVariantInventory(
  config: ConfigRow,
  productId: string,
  variantId: string,
  countOnHand: number,
  backorderable: boolean,
  preorderable: boolean,
  preorderShipsAt: string | null,
  initializeInventory = false,
): Promise<SpreeVariant> {
  if (initializeInventory && countOnHand !== 0) {
    throw new Error("Una variante nueva debe inicializarse con stock cero");
  }
  // Replaying aggregate stock into one location can duplicate quantities or undo sales.
  // Only a just-created variant may initialize its zero inventory.
  const inventory = initializeInventory ? [
    {
      stock_location_id: await defaultStockLocationId(config),
      count_on_hand: 0,
      backorderable,
    },
  ] : undefined;

  let updated = await spreeRequest<SpreeVariant>(
    config,
    "PATCH",
    "/products/" +
      encodeURIComponent(productId) +
      "/variants/" +
      encodeURIComponent(variantId),
    {
      track_inventory: true,
      preorderable,
      preorder_ships_at: preorderable ? preorderShipsAt : null,
      ...(inventory ? { stock_levels: inventory } : {}),
    },
  );

  // Spree 5.x accepts the legacy stock_items key while newer releases use
  // stock_levels. Verify the result and transparently fall back when needed.
  if (inventory && updated.backorderable !== backorderable) {
    updated = await spreeRequest<SpreeVariant>(
      config,
      "PATCH",
      "/products/" +
        encodeURIComponent(productId) +
        "/variants/" +
        encodeURIComponent(variantId),
      {
        track_inventory: true,
        preorderable,
        preorder_ships_at: preorderable ? preorderShipsAt : null,
        stock_items: inventory,
      },
    );
  }
  if (updated.backorderable !== backorderable) {
    await setVariantBackorderability(
      config,
      productId,
      variantId,
      backorderable,
    );
    updated = await spreeRequest<SpreeVariant>(
      config,
      "GET",
      "/products/" +
        encodeURIComponent(productId) +
        "/variants/" +
        encodeURIComponent(variantId),
    );
  }
  if (updated.backorderable !== backorderable || updated.preorderable !== preorderable) {
    throw new Error("Spree no confirmó las banderas de disponibilidad; inventario conservado");
  }
  return updated;
}

async function stockItemsForVariant(
  config: ConfigRow,
  variantId: string,
): Promise<SpreeStockItem[]> {
  const attempts = [
    "/stock_items?q[variant_id_eq]=" + encodeURIComponent(variantId),
    "/stock_items?q[variant_prefixed_id_eq]=" + encodeURIComponent(variantId),
    "/stock_items",
  ];
  let lastError: unknown;
  for (const path of attempts) {
    try {
      const items: SpreeStockItem[] = [];
      for (let page = 1; page <= 25; page += 1) {
        const sep = path.includes("?") ? "&" : "?";
        const payload = await spreeRequest<{
          data?: SpreeStockItem[];
          meta?: { next?: number | null; pages?: number };
        }>(config, "GET", path + sep + "limit=100&page=" + page);
        if (!Array.isArray(payload.data) || payload.data.some((item) => !item.id || !item.variant_id)) {
          throw new Error("Spree devolvió inventario sin identidad verificable");
        }
        // Unsupported filters may be ignored by older Spree versions.
        items.push(...payload.data.filter((item) => item.variant_id === variantId));
        const pages = Number(payload.meta?.pages);
        const more = Number.isInteger(pages) && pages > 0
          ? page < pages
          : payload.meta?.next != null ||
            (payload.meta?.next !== null && payload.data.length === 100);
        if (!more) {
          if (items.length || path === "/stock_items") return items;
          break;
        }
        if (page === 25) throw new Error("Inventario incompleto: límite de paginación alcanzado");
      }
    } catch (error) {
      lastError = error;
      // Retry the alternative filter, then the unfiltered paginated listing.
    }
  }
  throw lastError ?? new Error("No se pudo verificar el inventario de la variante");
}

async function initializeVerifiedEmptyBackorderStock(
  config: ConfigRow,
  productId: string,
  variantId: string,
): Promise<number> {
  const variant = await spreeRequest<SpreeVariant>(
    config,
    "GET",
    "/products/" +
      encodeURIComponent(productId) +
      "/variants/" +
      encodeURIComponent(variantId),
  );
  const totalOnHand = Number(variant.total_on_hand);
  if (!Number.isFinite(totalOnHand) || totalOnHand !== 0) {
    throw new Error(
      "Inventario ausente con total_on_hand no verificablemente cero: " +
        variantId,
    );
  }

  const inventory = [
    {
      stock_location_id: await defaultStockLocationId(config),
      count_on_hand: 0,
      backorderable: true,
    },
  ];
  let updated = await spreeRequest<SpreeVariant>(
    config,
    "PATCH",
    "/products/" +
      encodeURIComponent(productId) +
      "/variants/" +
      encodeURIComponent(variantId),
    {
      track_inventory: true,
      stock_levels: inventory,
    },
  );
  if (updated.backorderable !== true) {
    updated = await spreeRequest<SpreeVariant>(
      config,
      "PATCH",
      "/products/" +
        encodeURIComponent(productId) +
        "/variants/" +
        encodeURIComponent(variantId),
      {
        track_inventory: true,
        stock_items: inventory,
      },
    );
  }

  const verified = await stockItemsForVariant(config, variantId);
  if (
    !verified.length ||
    verified.some(
      (item) =>
        item.backorderable !== true ||
        Number(item.count_on_hand ?? 0) !== 0,
    )
  ) {
    throw new Error(
      "Spree no confirmó la inicialización segura a stock cero: " + variantId,
    );
  }
  return verified.length;
}

async function setVariantBackorderability(
  config: ConfigRow,
  productId: string | null,
  variantId: string,
  desired: boolean,
): Promise<number> {
  const items = await stockItemsForVariant(config, variantId);
  if (!items.length) {
    // No row plus no supplier backorder is already a safe non-sellable state.
    if (!desired) return 0;
    if (!productId) {
      throw new Error("Variante sin producto para inicializar stock cero: " + variantId);
    }
    // Enabling supplier backorder on an existing empty variant is safe only
    // after Spree itself confirms aggregate physical stock is exactly zero.
    return await initializeVerifiedEmptyBackorderStock(
      config,
      productId,
      variantId,
    );
  }
  const mismatched = items.filter((item) => item.backorderable !== desired);
  if (!mismatched.length) return 0;

  // Prefer the ordinary stock-item update. Some hosted Spree 5.x builds return
  // 200 here but silently keep the old backorderable value, so verify it.
  for (const item of mismatched) {
    await spreeRequest(config, "PATCH", "/stock_items/" + item.id, {
      backorderable: desired,
    });
  }
  // Never delete stock items or replay a quantity snapshot to change a flag.
  // A hosted backend ignoring PATCH requires a backend repair, not data loss.
  const verified = await stockItemsForVariant(config, variantId);
  const expectedIds = new Set(items.map((item) => item.id));
  if (
    verified.length !== expectedIds.size ||
    new Set(verified.map((item) => item.id)).size !== expectedIds.size ||
    verified.some((item) => !expectedIds.has(item.id) || item.backorderable !== desired)
  ) {
    throw new Error("Spree no confirmó backorderable=" + desired + "; inventario conservado, requiere revisión");
  }
  return mismatched.length;
}

async function syncBackorderability(
  config: ConfigRow,
  productId: string | null,
  variantId: string | null,
  availability: DevirProduct["availability"],
  fulfillmentMode: CatalogFulfillmentMode = "supplier_or_physical",
): Promise<number> {
  if (!variantId) return 0;
  const desired = shouldAllowSupplierBackorder({
    availability,
    fulfillmentMode,
  });
  return await setVariantBackorderability(
    config,
    productId,
    variantId,
    desired,
  );
}

async function enforceVariantFulfillmentFlags(
  config: ConfigRow,
  productId: string | null,
  variantId: string | null,
  availability: DevirProduct["availability"],
  fulfillmentMode: CatalogFulfillmentMode,
): Promise<number> {
  const changed = await syncBackorderability(
    config,
    productId,
    variantId,
    availability,
    fulfillmentMode,
  );
  if (!productId || !variantId) return changed;

  const supplierPreorderable =
    fulfillmentMode === "supplier_or_physical" &&
    availability === "preorder";
  if (!supplierPreorderable) {
    await spreeRequest(
      config,
      "PATCH",
      "/products/" +
        encodeURIComponent(productId) +
        "/variants/" +
        encodeURIComponent(variantId),
      {
        preorderable: false,
        preorder_ships_at: null,
      },
    );
  }
  return changed;
}

interface SupplierPackChildSyncContext {
  catalogProductId: string;
  reviewDecision: CatalogReviewDecision;
  approvedReviewFingerprint: string | null;
}

function supplierPackSplitApproved(
  context: SupplierPackChildSyncContext,
): boolean {
  return isCatalogReviewApproved({
    reasons: ["pack_requires_operator_split"],
    decision: context.reviewDecision,
    approvedFingerprint: context.approvedReviewFingerprint,
  });
}

async function syncApprovedSupplierPackChildren(
  config: ConfigRow,
  context: SupplierPackChildSyncContext,
  spreeProductId: string | null,
  availability: DevirProduct["availability"],
  releaseDate: string | null = null,
): Promise<number> {
  if (!spreeProductId || !supplierPackSplitApproved(context)) return 0;

  const { data: managedRows, error: managedError } = await supabase
    .from("catalog_variants")
    .select("spree_variant_id")
    .eq("product_id", context.catalogProductId)
    .not("spree_variant_id", "is", null);
  if (managedError) throw managedError;

  const variants = await spreeList<SpreeVariant>(
    config,
    "/products/" + encodeURIComponent(spreeProductId) + "/variants",
  );
  const childVariantIds = supplierPackChildVariantIds(
    variants.map((variant) => variant.id),
    (managedRows ?? []).map((row) => row.spree_variant_id),
  );
  if (!childVariantIds.length) return 0;

  const supplierSellable =
    availability === "available" || availability === "preorder";
  const preorderable = availability === "preorder";
  let changed = 0;

  for (const childVariantId of childVariantIds) {
    changed += await setVariantBackorderability(
      config,
      spreeProductId,
      childVariantId,
      supplierSellable,
    );
    await spreeRequest(
      config,
      "PATCH",
      "/products/" +
        encodeURIComponent(spreeProductId) +
        "/variants/" +
        encodeURIComponent(childVariantId),
      {
        track_inventory: true,
        preorderable,
        preorder_ships_at: preorderable ? releaseDate : null,
      },
    );
  }

  return changed;
}

async function syncImages(
  config: ConfigRow,
  productId: string,
  product: DevirProduct,
): Promise<number> {
  if (!product.imageUrls.length) return 0;
  const current = await spreeList<Json>(
    config,
    "/products/" + productId + "/media",
  );
  if (current.length > 0) return 0;
  let uploaded = 0;
  for (const [index, url] of product.imageUrls.entries()) {
    try {
      await spreeRequest(config, "POST", "/products/" + productId + "/media", {
        url,
        alt: product.name,
        position: index + 1,
      });
      uploaded += 1;
    } catch (error) {
      console.error("Imagen", url, error);
    }
  }
  return uploaded;
}

async function appendToExistingGroupedProduct(
  config: ConfigRow,
  product: DevirProduct,
  grouping: GroupingInfo,
  retailPrice: number,
): Promise<{ product: SpreeProduct; variant: SpreeVariant } | null> {
  if (!grouping.groupKey || grouping.itemKind !== "variant_candidate")
    return null;

  const { data, error } = await supabase
    .from("devir_sync_catalog")
    .select("spree_product_id,variant_label,variant_position")
    .eq("group_key", grouping.groupKey)
    .not("spree_product_id", "is", null)
    .limit(100);
  if (error) throw error;

  const candidateIds = Array.from(
    new Set((data ?? []).map((row) => row.spree_product_id).filter(Boolean)),
  ) as string[];

  for (const productId of candidateIds) {
    let parent: SpreeProduct;
    try {
      parent = await spreeRequest<SpreeProduct>(
        config,
        "GET",
        "/products/" + encodeURIComponent(productId),
      );
    } catch {
      continue;
    }

    if (!(parent.tags ?? []).includes("devir-group")) continue;

    const variants = await spreeList<SpreeVariant>(
      config,
      "/products/" + encodeURIComponent(productId) + "/variants",
    );
    const already = variants.find(
      (variant) => variant.sku?.trim() === product.sku,
    );
    if (already) return { product: parent, variant: already };

    const existingRows = data ?? [];
    const positionCounts = new Map<number, number>();
    for (const row of existingRows) {
      const pos = Number(row.variant_position ?? -1);
      positionCounts.set(pos, (positionCounts.get(pos) ?? 0) + 1);
    }
    const hasEditionDimension =
      existingRows.some((row) => Boolean(variantEdition(row.variant_label))) ||
      Array.from(positionCounts.values()).some((count) => count > 1) ||
      Boolean(variantEdition(grouping.variantLabel));

    const position = Number(grouping.variantPosition ?? 0);
    const standardCopiesAtPosition = existingRows.filter(
      (row) =>
        Number(row.variant_position) === position &&
        !variantEdition(row.variant_label),
    ).length;
    const edition =
      variantEdition(grouping.variantLabel) ??
      standardEditionStorageValue(standardCopiesAtPosition);
    const options = [
      { name: "tomo", value: String(position).padStart(2, "0") },
      ...(hasEditionDimension ? [{ name: "edicion", value: edition }] : []),
    ];

    // If the existing group has only the tomo option and the incoming SKU
    // introduces a special edition for an existing tomo, do not silently
    // reshape all variants. Leave it separate for operator review.
    if (
      !hasEditionDimension &&
      existingRows.some((row) => Number(row.variant_position) === position)
    ) {
      return null;
    }

    const created = await spreeRequest<SpreeVariant>(
      config,
      "POST",
      "/products/" + encodeURIComponent(productId) + "/variants",
      {
        sku: product.sku,
        cost_price: product.purchasePrice,
        cost_currency: "EUR",
        track_inventory: true,
        options,
        prices: [{ currency: "EUR", amount: retailPrice }],
      },
    );
    return { product: parent, variant: created };
  }

  return null;
}

async function appendToExistingLanguageProduct(
  config: ConfigRow,
  product: DevirProduct,
  info: LanguageGroupingInfo,
  retailPrice: number,
): Promise<{ product: SpreeProduct; variant: SpreeVariant } | null> {
  const { data, error } = await supabase
    .from("devir_sync_catalog")
    .select("spree_product_id,language_label")
    .eq("language_group_key", info.groupKey)
    .not("spree_product_id", "is", null)
    .limit(100);
  if (error) throw error;

  const candidateIds = Array.from(
    new Set((data ?? []).map((row) => row.spree_product_id).filter(Boolean)),
  ) as string[];

  for (const productId of candidateIds) {
    let parent: SpreeProduct;
    try {
      parent = await spreeRequest<SpreeProduct>(
        config,
        "GET",
        "/products/" + encodeURIComponent(productId),
      );
    } catch {
      continue;
    }
    if (!(parent.tags ?? []).includes("devir-language-group")) continue;

    const variants = await spreeList<SpreeVariant>(
      config,
      "/products/" + encodeURIComponent(productId) + "/variants",
    );
    const already = variants.find(
      (variant) => variant.sku?.trim() === product.sku,
    );
    if (already) return { product: parent, variant: already };

    if ((data ?? []).some((row) => row.language_label === info.language)) {
      return null;
    }

    const shipping = shippingDefaults(categoryKey(product), product);
    const created = await spreeRequest<SpreeVariant>(
      config,
      "POST",
      "/products/" + encodeURIComponent(productId) + "/variants",
      {
        sku: product.sku,
        cost_price: product.purchasePrice,
        cost_currency: "EUR",
        ...shipping,
        track_inventory: true,
        backorder_limit: null,
        preorderable: product.availability === "preorder",
        preorder_ships_at:
          product.availability === "preorder" ? product.releaseDate : null,
        options: [{ name: "idioma", value: info.language }],
        prices: [{ currency: "EUR", amount: retailPrice }],
      },
    );
    const inventoryVariant = await patchVariantInventory(
      config,
      productId,
      created.id,
      0,
      product.availability === "available" ||
        product.availability === "preorder",
      product.availability === "preorder",
      product.releaseDate,
      true,
    );
    return { product: parent, variant: inventoryVariant };
  }
  return null;
}

function supplierRelation(row: CatalogOfferRow): CatalogSupplierRow | null {
  const relation = row.catalog_suppliers;
  if (Array.isArray(relation)) return relation[0] ?? null;
  return relation ?? null;
}

async function configuredCatalogSupplier(
  code: string,
): Promise<CatalogSupplierRow> {
  const normalizedCode = normalizeSupplierCode(code);
  const { data, error } = await supabase
    .from("catalog_suppliers")
    .select(
      "id,code,name,adapter_key,enabled,priority,default_currency,stale_after_hours,sync_interval_hours,last_completed_run_id,config",
    )
    .eq("code", normalizedCode)
    .maybeSingle();
  if (error) throw error;
  if (!data) {
    throw new Error(
      `Distribuidor ${normalizedCode} no registrado en catalog_suppliers`,
    );
  }
  if (!data.enabled) {
    throw new Error(`Distribuidor ${normalizedCode} deshabilitado`);
  }
  return data as CatalogSupplierRow;
}

async function loadCatalogVariant(
  variantId: string,
): Promise<{ product: CatalogProductRow; variant: CatalogVariantRow }> {
  const { data: variantData, error: variantError } = await supabase
    .from("catalog_variants")
    .select(
      "id,product_id,canonical_key,canonical_sku,name,option_values,option_signature,spree_variant_id,selected_offer_id,last_auto_price,fulfillment_mode",
    )
    .eq("id", variantId)
    .single();
  if (variantError) throw variantError;
  const variant = variantData as CatalogVariantRow;

  const { data: productData, error: productError } = await supabase
    .from("catalog_products")
    .select("id,canonical_key,name,category_key,spree_product_id,review_decision,approved_review_fingerprint,review_decided_at,review_note")
    .eq("id", variant.product_id)
    .single();
  if (productError) throw productError;
  return { product: productData as CatalogProductRow, variant };
}

function minimumOrderQuantityFromOfferPayload(
  payload: Record<string, unknown> | null | undefined,
): number | null {
  const metadata =
    payload?.metadata &&
    typeof payload.metadata === "object" &&
    !Array.isArray(payload.metadata)
      ? (payload.metadata as Record<string, unknown>)
      : {};
  const quantity = Number(metadata.minimumOrderQuantity);
  return Number.isInteger(quantity) && quantity > 1 ? quantity : null;
}

async function selectedSupplyForSpreeVariant(
  spreeVariantId: string,
): Promise<SelectedSupplyRow | null> {
  if (!spreeVariantId) return null;
  const { data, error } = await supabase
    .from("catalog_selected_supply")
    .select(
      "variant_id,canonical_sku,spree_variant_id,product_id,product_name,spree_product_id,supplier_code,supplier_name,supplier_enabled,supplier_stale_after_hours,supplier_sku,normalized_cost,currency,reference_price_net,availability,source_url,last_seen_at,fulfillment_mode",
    )
    .eq("spree_variant_id", spreeVariantId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const row = data as SelectedSupplyRow;
  if (row.supplier_code) {
    const supplier = await configuredCatalogSupplier(row.supplier_code);
    row.supplier_config = supplier.config ?? null;
  }

  if (row.supplier_code === TCGFACTORY_SUPPLIER_CODE) {
    const { data: variant, error: variantError } = await supabase
      .from("catalog_variants")
      .select("selected_offer_id")
      .eq("spree_variant_id", spreeVariantId)
      .maybeSingle();
    if (variantError) throw variantError;
    if (variant?.selected_offer_id) {
      const { data: offer, error: offerError } = await supabase
        .from("catalog_supplier_offers")
        .select("raw_payload")
        .eq("id", variant.selected_offer_id)
        .maybeSingle();
      if (offerError) throw offerError;
      row.selected_offer_payload =
        offer?.raw_payload && typeof offer.raw_payload === "object"
          ? (offer.raw_payload as Record<string, unknown>)
          : null;
      row.minimum_order_quantity = minimumOrderQuantityFromOfferPayload(
        row.selected_offer_payload,
      );
    }
  }

  return row;
}

async function reconcileSpreeVariantFromCatalog(
  config: ConfigRow,
  spreeVariantId: string,
  categories: SpreeCategory[],
  defs: Map<string, SpreeFieldDefinition>,
): Promise<Awaited<ReturnType<typeof reconcileCatalogVariant>> | null> {
  const { data, error } = await supabase
    .from("catalog_variants")
    .select("id")
    .eq("spree_variant_id", spreeVariantId)
    .maybeSingle();
  if (error) throw error;
  if (!data?.id) return null;
  return await reconcileCatalogVariant(
    config,
    await loadCatalogVariant(String(data.id)),
    categories,
    defs,
  );
}

async function reconcileStaleCatalogBatch(
  config: ConfigRow,
  limit = 20,
): Promise<{ checked: number; reconciled: number; failed: number }> {
  const { data, error } = await supabase
    .from("catalog_selected_supply")
    .select(
      "variant_id,supplier_enabled,supplier_stale_after_hours,last_seen_at",
    )
    .not("supplier_code", "is", null)
    .order("last_seen_at", { ascending: true })
    .limit(Math.max(limit * 5, limit));
  if (error) throw error;
  const now = Date.now();
  const staleVariantIds = (data ?? [])
    .filter((row) => {
      if (row.supplier_enabled === false) return true;
      const lastSeen = new Date(String(row.last_seen_at ?? "")).getTime();
      const staleAfterMs =
        Number(row.supplier_stale_after_hours ?? 0) * 60 * 60 * 1000;
      return (
        !Number.isFinite(lastSeen) ||
        !Number.isFinite(staleAfterMs) ||
        staleAfterMs <= 0 ||
        now - lastSeen > staleAfterMs
      );
    })
    .slice(0, limit)
    .map((row) => String(row.variant_id));
  if (staleVariantIds.length === 0) {
    return { checked: data?.length ?? 0, reconciled: 0, failed: 0 };
  }

  const categories = await spreeCategories(config);
  const defs = await definitions(config);
  let reconciled = 0;
  let failed = 0;
  for (const variantId of staleVariantIds) {
    try {
      const synced = await reconcileCatalogVariant(
        config,
        await loadCatalogVariant(variantId),
        categories,
        defs,
      );
      if (synced.productId) {
        await markCatalogProductDirty(synced.productId);
        await preparePublishBatch(config, 0, 1, synced.productId);
      }
      reconciled += 1;
    } catch (reconcileError) {
      failed += 1;
      console.error("No se pudo reconciliar una oferta caducada", {
        variantId,
        error:
          reconcileError instanceof Error
            ? reconcileError.message
            : String(reconcileError),
      });
    }
  }
  return { checked: data?.length ?? 0, reconciled, failed };
}

async function reconcilePhysicalOnlyCatalogBatch(
  config: ConfigRow,
  limit = 40,
): Promise<{ products: number; reconciled: number; failed: number }> {
  const { data: variants, error: variantsError } = await supabase
    .from("catalog_variants")
    .select("product_id,spree_variant_id,updated_at")
    .eq("fulfillment_mode", "physical_only")
    .not("spree_variant_id", "is", null)
    .order("updated_at", { ascending: true })
    .limit(limit);
  if (variantsError) throw variantsError;

  const variantsByProduct = new Map<string, string[]>();
  for (const row of variants ?? []) {
    const productId = String(row.product_id ?? "");
    const variantId = String(row.spree_variant_id ?? "");
    if (!productId || !variantId) continue;
    const ids = variantsByProduct.get(productId) ?? [];
    ids.push(variantId);
    variantsByProduct.set(productId, ids);
  }
  const productIds = Array.from(variantsByProduct.keys());
  if (productIds.length === 0) {
    return { products: 0, reconciled: 0, failed: 0 };
  }

  const { data: products, error: productsError } = await supabase
    .from("catalog_products")
    .select("id,spree_product_id")
    .in("id", productIds)
    .not("spree_product_id", "is", null);
  if (productsError) throw productsError;

  let reconciled = 0;
  let failed = 0;
  for (const product of products ?? []) {
    const spreeProductId = String(product.spree_product_id ?? "");
    if (!spreeProductId) continue;
    try {
      for (const variantId of variantsByProduct.get(String(product.id)) ?? []) {
        // physical_only means supplier availability must never leak into Spree.
        // Turning flags off is safe even when the hosted backend has no stock
        // item yet; never synthesize, replay or zero physical quantities here.
        await enforceVariantFulfillmentFlags(
          config,
          spreeProductId,
          variantId,
          "unavailable",
          "physical_only",
        );
      }
      const { error: checkpointError } = await supabase
        .from("catalog_variants")
        .update({ updated_at: new Date().toISOString() })
        .eq("product_id", product.id)
        .eq("fulfillment_mode", "physical_only");
      if (checkpointError) throw checkpointError;
      reconciled += 1;
    } catch (error) {
      failed += 1;
      // Rotate a failing product instead of hammering the same oldest row on
      // every maintenance tick. The fulfillment helper above never changes
      // count_on_hand, so a retry can safely happen on the next rotation.
      await supabase
        .from("catalog_variants")
        .update({ updated_at: new Date().toISOString() })
        .eq("product_id", product.id)
        .eq("fulfillment_mode", "physical_only");
      console.error("No se pudo reconciliar stock físico protegido", {
        spreeProductId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {
    products: products?.length ?? 0,
    reconciled,
    failed,
  };
}

async function resolveCatalogVariant(
  supplier: CatalogSupplierRow,
  item: NormalizedSupplierCatalogItem,
  identity: CanonicalIdentity,
): Promise<{ product: CatalogProductRow; variant: CatalogVariantRow }> {
  const { data: existingOffer, error: offerError } = await supabase
    .from("catalog_supplier_offers")
    .select("variant_id")
    .eq("supplier_id", supplier.id)
    .eq("external_variant_id", item.externalVariantId)
    .maybeSingle();
  if (offerError) throw offerError;
  if (existingOffer?.variant_id) {
    return await loadCatalogVariant(String(existingOffer.variant_id));
  }

  const orderedIdentifiers = [...identity.identifiers].sort(
    (left, right) =>
      Number(left.namespace.startsWith("supplier:")) -
      Number(right.namespace.startsWith("supplier:")),
  );
  for (const identifier of orderedIdentifiers) {
    const { data, error } = await supabase
      .from("catalog_variant_identifiers")
      .select("variant_id")
      .eq("namespace", identifier.namespace)
      .eq("value", identifier.value)
      .maybeSingle();
    if (error) throw error;
    if (data?.variant_id) {
      if (identifier.namespace === "canonical-match") {
        const { data: sameSupplierOffers, error: sameSupplierError } =
          await supabase
            .from("catalog_supplier_offers")
            .select("external_variant_id")
            .eq("supplier_id", supplier.id)
            .eq("variant_id", data.variant_id)
            .neq("external_variant_id", item.externalVariantId)
            .limit(1);
        if (sameSupplierError) throw sameSupplierError;
        if (sameSupplierOffers?.length) {
          throw new Error(
            `Dos variantes de ${supplier.code} comparten título y opciones; ` +
              "se necesita GTIN, referencia de fabricante u otra opción para no mezclarlas",
          );
        }
      }
      return await loadCatalogVariant(String(data.variant_id));
    }
  }

  const { data: keyMatch, error: keyError } = await supabase
    .from("catalog_variants")
    .select("id")
    .eq("canonical_key", identity.variantKey)
    .maybeSingle();
  if (keyError) throw keyError;
  if (keyMatch?.id) {
    const { data: sameSupplierOffers, error: sameSupplierError } =
      await supabase
        .from("catalog_supplier_offers")
        .select("external_variant_id")
        .eq("supplier_id", supplier.id)
        .eq("variant_id", keyMatch.id)
        .neq("external_variant_id", item.externalVariantId)
        .limit(1);
    if (sameSupplierError) throw sameSupplierError;
    if (sameSupplierOffers?.length) {
      throw new Error(
        `Dos variantes de ${supplier.code} comparten título y opciones; ` +
          "se necesita GTIN, referencia de fabricante u otra opción para no mezclarlas",
      );
    }
    return await loadCatalogVariant(String(keyMatch.id));
  }

  const now = new Date().toISOString();
  const { error: productInsertError } = await supabase
    .from("catalog_products")
    .upsert(
      {
        canonical_key: identity.productKey,
        name: item.productName,
        category_key: item.categoryKey ?? null,
        brand: item.manufacturer ?? null,
        match_strategy: identity.matchStrategy,
        match_confidence: identity.matchConfidence,
        requires_review: identity.requiresReview,
        updated_at: now,
      },
      { onConflict: "canonical_key", ignoreDuplicates: true },
    );
  if (productInsertError) throw productInsertError;

  const { data: productData, error: productError } = await supabase
    .from("catalog_products")
    .select("id,canonical_key,name,category_key,spree_product_id,review_decision,approved_review_fingerprint,review_decided_at,review_note")
    .eq("canonical_key", identity.productKey)
    .single();
  if (productError) throw productError;
  const product = productData as CatalogProductRow;

  // The first supplier insert must not freeze stale taxonomy forever.
  // Devir is currently the canonical taxonomy source; future suppliers may
  // fill a missing category but do not overwrite an established Devir name.
  if (item.supplierCode === "devir" || !product.category_key) {
    const nextCategoryKey = item.categoryKey ?? product.category_key ?? null;
    const { error: productRefreshError } = await supabase
      .from("catalog_products")
      .update({
        ...(item.supplierCode === "devir" ? { name: item.productName } : {}),
        category_key: nextCategoryKey,
        updated_at: now,
      })
      .eq("id", product.id);
    if (productRefreshError) throw productRefreshError;
    if (item.supplierCode === "devir") product.name = item.productName;
    product.category_key = nextCategoryKey;
  }

  const { error: variantInsertError } = await supabase
    .from("catalog_variants")
    .upsert(
      {
        product_id: product.id,
        canonical_key: identity.variantKey,
        canonical_sku: identity.canonicalSku,
        name: item.variantName ?? null,
        option_values: identity.normalizedOptions,
        option_signature: identity.optionSignature,
        match_strategy: identity.matchStrategy,
        match_confidence: identity.matchConfidence,
        requires_review: identity.requiresReview,
        updated_at: now,
      },
      { onConflict: "canonical_key", ignoreDuplicates: true },
    );
  if (variantInsertError) throw variantInsertError;

  const { data: variantData, error: variantError } = await supabase
    .from("catalog_variants")
    .select(
      "id,product_id,canonical_key,canonical_sku,name,option_values,option_signature,spree_variant_id,selected_offer_id,last_auto_price,fulfillment_mode",
    )
    .eq("canonical_key", identity.variantKey)
    .single();
  if (variantError) {
    const { data: skuConflict } = await supabase
      .from("catalog_variants")
      .select("id,canonical_key")
      .eq("canonical_sku", identity.canonicalSku)
      .maybeSingle();
    if (skuConflict) {
      throw new Error(
        `Conflicto de SKU canónico ${identity.canonicalSku}: ${skuConflict.canonical_key}`,
      );
    }
    throw variantError;
  }
  return { product, variant: variantData as CatalogVariantRow };
}

async function persistCatalogOffer(
  rawItem: SupplierCatalogItem,
  runId: string | null,
): Promise<CatalogResolution> {
  const item = normalizeSupplierItem(rawItem);
  const identity = buildCanonicalIdentity(item);
  const supplier = await configuredCatalogSupplier(item.supplierCode);
  if (runId && supplier.last_completed_run_id === runId) {
    throw new Error(`El run ${runId} ya está cerrado para ${supplier.code}`);
  }
  const resolved = await resolveCatalogVariant(supplier, item, identity);
  const now = new Date().toISOString();

  for (const identifier of identity.identifiers) {
    const { error } = await supabase.from("catalog_variant_identifiers").upsert(
      {
        variant_id: resolved.variant.id,
        namespace: identifier.namespace,
        value: identifier.value,
      },
      { onConflict: "namespace,value", ignoreDuplicates: true },
    );
    if (error) throw error;

    const { data: owner, error: ownerError } = await supabase
      .from("catalog_variant_identifiers")
      .select("variant_id")
      .eq("namespace", identifier.namespace)
      .eq("value", identifier.value)
      .single();
    if (ownerError) throw ownerError;
    if (String(owner.variant_id) !== resolved.variant.id) {
      throw new Error(
        `Identificador ${identifier.namespace}:${identifier.value} ya pertenece a otra variante`,
      );
    }
  }

  const { data: offerData, error: offerError } = await supabase
    .from("catalog_supplier_offers")
    .upsert(
      {
        supplier_id: supplier.id,
        variant_id: resolved.variant.id,
        external_product_id: item.externalProductId ?? null,
        external_variant_id: item.externalVariantId,
        supplier_sku: item.supplierSku,
        purchase_price: item.purchasePrice,
        shipping_cost: item.shippingCost,
        normalized_cost: item.normalizedCost,
        currency: item.currency,
        tax_included: item.taxIncluded,
        tax_rate: item.taxRate,
        reference_price_net: item.referencePriceNet ?? null,
        availability: item.availability,
        stock_quantity: item.stockQuantity ?? null,
        release_date: item.releaseDate ?? null,
        source_url: item.sourceUrl ?? null,
        raw_payload: item,
        active: true,
        last_seen_run_id: runId,
        missing_runs: 0,
        last_seen_at: now,
        updated_at: now,
      },
      { onConflict: "supplier_id,external_variant_id" },
    )
    .select(
      "id,supplier_id,variant_id,external_variant_id,supplier_sku,purchase_price,shipping_cost,normalized_cost,currency,availability,active,last_seen_at,source_url,raw_payload",
    )
    .single();
  if (offerError) throw offerError;

  return {
    supplier,
    product: resolved.product,
    variant: resolved.variant,
    offer: offerData as CatalogOfferRow,
    identity,
    item,
  };
}

async function chooseCatalogOffer(
  variant: CatalogVariantRow,
): Promise<CatalogOfferSelection> {
  const { data, error } = await supabase
    .from("catalog_supplier_offers")
    .select(
      "id,supplier_id,variant_id,external_variant_id,supplier_sku,purchase_price,shipping_cost,normalized_cost,currency,availability,active,last_seen_at,source_url,raw_payload,catalog_suppliers!catalog_supplier_offers_supplier_id_fkey(id,code,name,adapter_key,enabled,priority,default_currency,stale_after_hours,sync_interval_hours,last_completed_run_id)",
    )
    .eq("variant_id", variant.id);
  if (error) throw error;
  const rows = (data ?? []) as unknown as CatalogOfferRow[];
  const candidates: SupplierOfferCandidate[] = rows.flatMap((row) => {
    const supplier = supplierRelation(row);
    if (!supplier) return [];
    return [
      {
        id: row.id,
        supplierId: supplier.id,
        supplierCode: supplier.code,
        supplierSku: row.supplier_sku,
        supplierPriority: Number(supplier.priority),
        supplierEnabled: supplier.enabled,
        staleAfterHours: Number(supplier.stale_after_hours),
        normalizedCost: Number(row.normalized_cost),
        currency: row.currency,
        availability: row.availability,
        active: row.active,
        lastSeenAt: row.last_seen_at,
      },
    ];
  });
  const selectedCandidate = selectBestOffer(candidates, {
    targetCurrency: "EUR",
  }).selected;
  const selected = selectedCandidate
    ? (rows.find((row) => row.id === selectedCandidate.id) ?? null)
    : null;
  const selectedSupplier = selected ? supplierRelation(selected) : null;
  const selectedId = selected?.id ?? null;

  if (variant.selected_offer_id !== selectedId) {
    const now = new Date().toISOString();
    const { error: updateError } = await supabase
      .from("catalog_variants")
      .update({
        selected_offer_id: selectedId,
        selected_at: now,
        updated_at: now,
      })
      .eq("id", variant.id);
    if (updateError) throw updateError;
    const { error: historyError } = await supabase
      .from("catalog_offer_selection_history")
      .insert({
        variant_id: variant.id,
        previous_offer_id: variant.selected_offer_id,
        selected_offer_id: selectedId,
        reason: selectedId
          ? "lowest_eligible_normalized_cost"
          : "no_eligible_offer",
      });
    if (historyError) throw historyError;
    variant.selected_offer_id = selectedId;
  }

  const offers = rows
    .flatMap((row) => {
      const supplier = supplierRelation(row);
      if (!supplier) return [];
      return [
        {
          id: row.id,
          supplierCode: supplier.code,
          supplierName: supplier.name,
          supplierSku: row.supplier_sku,
          normalizedCost: Number(row.normalized_cost),
          currency: row.currency,
          availability: row.availability,
          sourceUrl: row.source_url,
          lastSeenAt: row.last_seen_at,
          selected: row.id === selectedId,
        },
      ];
    })
    .sort(
      (left, right) =>
        Number(right.selected) - Number(left.selected) ||
        left.normalizedCost - right.normalizedCost ||
        left.supplierCode.localeCompare(right.supplierCode),
    );

  return { selected, selectedSupplier, offers };
}

async function catalogSpreeMapping(
  config: ConfigRow,
  product: CatalogProductRow,
  variant: CatalogVariantRow,
): Promise<{ product: SpreeProduct | null; variant: SpreeVariant | null }> {
  if (!product.spree_product_id) return { product: null, variant: null };
  const spreeProduct = await spreeRequest<SpreeProduct>(
    config,
    "GET",
    "/products/" + encodeURIComponent(product.spree_product_id),
  );
  if (!variant.spree_variant_id) {
    return { product: spreeProduct, variant: null };
  }
  const spreeVariant = await spreeRequest<SpreeVariant>(
    config,
    "GET",
    "/products/" +
      encodeURIComponent(product.spree_product_id) +
      "/variants/" +
      encodeURIComponent(variant.spree_variant_id),
  );
  return { product: spreeProduct, variant: spreeVariant };
}

function offerItem(row: CatalogOfferRow): NormalizedSupplierCatalogItem {
  if (!row.raw_payload || typeof row.raw_payload !== "object") {
    throw new Error(`Oferta ${row.id} sin payload normalizado`);
  }
  return normalizeSupplierItem(
    row.raw_payload as unknown as SupplierCatalogItem,
  );
}

function supplierItemAsProduct(
  item: NormalizedSupplierCatalogItem,
): DevirProduct {
  const displayName =
    item.variantName && item.variantName !== item.productName
      ? `${item.productName} ${item.variantName}`
      : item.productName;
  return {
    sku: item.supplierSku,
    name: displayName,
    url: item.sourceUrl ?? "",
    purchasePrice: item.normalizedCost,
    referencePriceNet: item.referencePriceNet ?? null,
    availability: item.availability,
    availabilityLabel:
      typeof item.metadata?.availabilityLabel === "string"
        ? item.metadata.availabilityLabel
        : null,
    releaseDate: item.releaseDate ?? null,
    imageUrls: item.imageUrls,
    categoryKeyOverride: item.categoryKey ?? null,
    supplierMinimumQuantity:
      Number.isInteger(Number(item.metadata?.minimumOrderQuantity)) &&
      Number(item.metadata?.minimumOrderQuantity) > 1
        ? Number(item.metadata?.minimumOrderQuantity)
        : null,
  };
}

async function updateCatalogSpreeMapping(
  resolution: { product: CatalogProductRow; variant: CatalogVariantRow },
  synced: {
    productId: string;
    variantId: string | null;
    lastAutoPrice: number | null;
  },
): Promise<void> {
  const now = new Date().toISOString();
  const { error: productError } = await supabase
    .from("catalog_products")
    .update({ spree_product_id: synced.productId, updated_at: now })
    .eq("id", resolution.product.id);
  if (productError) throw productError;
  resolution.product.spree_product_id = synced.productId;

  const { error: variantError } = await supabase
    .from("catalog_variants")
    .update({
      spree_variant_id: synced.variantId,
      ...(synced.lastAutoPrice !== null
        ? { last_auto_price: synced.lastAutoPrice }
        : {}),
      updated_at: now,
    })
    .eq("id", resolution.variant.id);
  if (variantError) throw variantError;
  resolution.variant.spree_variant_id = synced.variantId;
}

async function checkpointCatalogSpreeMapping(
  context: CatalogSpreeContext,
  spreeProductId: string,
  spreeVariantId: string | null,
): Promise<void> {
  const now = new Date().toISOString();
  const { error: productError } = await supabase
    .from("catalog_products")
    .update({ spree_product_id: spreeProductId, updated_at: now })
    .eq("id", context.catalogProductId);
  if (productError) throw productError;
  if (!spreeVariantId) return;
  const { error: variantError } = await supabase
    .from("catalog_variants")
    .update({ spree_variant_id: spreeVariantId, updated_at: now })
    .eq("id", context.catalogVariantId);
  if (variantError) throw variantError;
}

async function reconcileCatalogVariantUnlocked(
  config: ConfigRow,
  resolution: { product: CatalogProductRow; variant: CatalogVariantRow },
  categories: SpreeCategory[],
  defs: Map<string, SpreeFieldDefinition>,
): Promise<{
  productId: string | null;
  variantId: string | null;
  images: number;
  review: boolean;
  reviewReasons: string[];
  backorderItems: number;
  lastAutoPrice: number | null;
  selectedSupplierCode: string | null;
}> {
  const selection = await chooseCatalogOffer(resolution.variant);
  const mapping = await catalogSpreeMapping(
    config,
    resolution.product,
    resolution.variant,
  );

  if (!selection.selected || !selection.selectedSupplier) {
    const mappedProductId =
      mapping.product?.id ?? resolution.product.spree_product_id;
    if (resolution.variant.spree_variant_id) {
      await enforceVariantFulfillmentFlags(
        config,
        mappedProductId,
        resolution.variant.spree_variant_id,
        "unavailable",
        resolution.variant.fulfillment_mode ?? "supplier_or_physical",
      );
    }
    await syncApprovedSupplierPackChildren(
      config,
      {
        catalogProductId: resolution.product.id,
        reviewDecision: resolution.product.review_decision ?? "pending",
        approvedReviewFingerprint:
          resolution.product.approved_review_fingerprint ?? null,
      },
      mappedProductId,
      "unavailable",
      null,
    );
    if (mapping.product && resolution.variant.spree_variant_id) {
      await upsertVariantProvenance(
        config,
        mapping.product.id,
        defs,
        resolution.variant.spree_variant_id,
        resolution.variant.canonical_sku,
        resolution.variant.option_values ?? {},
        null,
        selection.offers,
      );
    }
    return {
      productId: mapping.product?.id ?? null,
      variantId: mapping.variant?.id ?? null,
      images: 0,
      review: false,
      reviewReasons: [],
      backorderItems: 0,
      lastAutoPrice: null,
      selectedSupplierCode: null,
    };
  }

  const selectedItem = offerItem(selection.selected);
  const product = supplierItemAsProduct(selectedItem);
  const lastAutoPrice = Number(resolution.variant.last_auto_price);
  const synced = await syncProductToSpree(config, product, categories, defs, {
    catalogProductId: resolution.product.id,
    catalogVariantId: resolution.variant.id,
    productName: resolution.product.name || selectedItem.productName,
    variantName: resolution.variant.name ?? selectedItem.variantName ?? null,
    canonicalSku:
      mapping.variant?.sku?.trim() || resolution.variant.canonical_sku,
    options: resolution.variant.option_values ?? selectedItem.options,
    supplier: selection.selectedSupplier,
    offer: selection.selected,
    offers: selection.offers,
    existingProduct: mapping.product,
    existingVariant: mapping.variant,
    lastAutoPrice: Number.isFinite(lastAutoPrice) ? lastAutoPrice : null,
    reviewDecision: resolution.product.review_decision ?? "pending",
    approvedReviewFingerprint:
      resolution.product.approved_review_fingerprint ?? null,
    fulfillmentMode:
      resolution.variant.fulfillment_mode ?? "supplier_or_physical",
  });
  await updateCatalogSpreeMapping(resolution, synced);
  return {
    ...synced,
    selectedSupplierCode: selection.selectedSupplier.code,
  };
}

async function reconcileCatalogVariant(
  config: ConfigRow,
  resolution: { product: CatalogProductRow; variant: CatalogVariantRow },
  categories: SpreeCategory[],
  defs: Map<string, SpreeFieldDefinition>,
): Promise<Awaited<ReturnType<typeof reconcileCatalogVariantUnlocked>>> {
  const token = crypto.randomUUID();
  let claimed = false;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const { data, error } = await supabase.rpc("catalog_claim_product_sync", {
      p_product_id: resolution.product.id,
      p_token: token,
      p_seconds: 300,
    });
    if (error) throw error;
    if (data === true) {
      claimed = true;
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
  }
  if (!claimed) {
    throw new Error(
      `El producto ${resolution.product.id} está siendo sincronizado por otro worker`,
    );
  }

  try {
    const freshResolution = await loadCatalogVariant(resolution.variant.id);
    return await reconcileCatalogVariantUnlocked(
      config,
      freshResolution,
      categories,
      defs,
    );
  } finally {
    const { error } = await supabase.rpc("catalog_release_product_sync", {
      p_product_id: resolution.product.id,
      p_token: token,
    });
    if (error) console.error("No se pudo liberar el lock de producto", error);
  }
}

async function ingestCatalogItem(
  config: ConfigRow,
  rawItem: SupplierCatalogItem,
  runId: string | null,
  categories: SpreeCategory[],
  defs: Map<string, SpreeFieldDefinition>,
): Promise<{
  resolution: CatalogResolution;
  synced: Awaited<ReturnType<typeof reconcileCatalogVariant>>;
}> {
  const resolution = await persistCatalogOffer(rawItem, runId);
  const synced = await reconcileCatalogVariant(
    config,
    resolution,
    categories,
    defs,
  );
  return { resolution, synced };
}

async function syncProductToSpree(
  config: ConfigRow,
  product: DevirProduct,
  categories: SpreeCategory[],
  defs: Map<string, SpreeFieldDefinition>,
  catalogContext?: CatalogSpreeContext,
): Promise<{
  productId: string;
  variantId: string | null;
  images: number;
  review: boolean;
  reviewReasons: string[];
  backorderItems: number;
  lastAutoPrice: number | null;
}> {
  if (!product.purchasePrice || product.purchasePrice <= 0) {
    throw new Error("Producto sin coste comparable: " + product.sku);
  }
  const key = categoryKey(product);
  const category = key ? (categoryForKey(categories, key) ?? null) : null;
  const configuredMargin = await categoryMargin(config, category);
  const commercialProfile = commercialPricingProfile({
    name: product.name,
    categoryKey: key,
    unitCostNet: product.purchasePrice,
  });
  const categoryBaseMargin =
    configuredMargin ?? DEFAULT_CATEGORY_MARGINS[key] ?? 0.08;
  const targetMargin = commercialTargetMargin(
    product,
    key,
    categoryBaseMargin,
  );
  const pricing = competitivePricing(
    product,
    key,
    targetMargin,
    catalogContext?.supplier.code,
    catalogContext?.supplier.config,
  );
  const shipping = shippingDefaults(key, product);
  const packRequiresSplit = isPack(product);
  const reasons: string[] = [];
  if (!category) reasons.push("category_unclassified");
  else if (configuredMargin === null)
    reasons.push("category_margin_unconfigured");
  if (pricing.reviewReason) reasons.push(pricing.reviewReason);
  if (!product.imageUrls.length) reasons.push("product_image_missing");
  if (packRequiresSplit) reasons.push("pack_requires_operator_split");
  if (isCatalanCatalogProduct(product)) {
    reasons.push("catalan_requires_operator_review");
  }
  const grouping = groupingInfo(product);
  const languageGrouping =
    grouping.itemKind === "standalone" ? languageGroupingInfo(product) : null;
  if (grouping.confidence === "ambiguous")
    reasons.push("grouping_requires_operator_review");
  if (catalogContext?.reviewDecision === "rejected") {
    reasons.push("operator_rejected");
  }
  let review = shouldRequireCatalogReview({
    reasons,
    decision: catalogContext?.reviewDecision ?? "pending",
    approvedFingerprint: catalogContext?.approvedReviewFingerprint ?? null,
  });
  const fulfillmentMode = effectiveCatalogFulfillmentMode({
    fulfillmentMode:
      catalogContext?.fulfillmentMode ?? "supplier_or_physical",
    requiresPackSplit: packRequiresSplit,
  });
  const supplierSellable = shouldAllowSupplierBackorder({
    availability: product.availability,
    fulfillmentMode,
  });
  const supplierPreorderable =
    product.availability === "preorder" && supplierSellable;
  const spreeSku = catalogContext?.canonicalSku ?? product.sku;
  const spreeProductName = catalogContext?.productName ?? product.name;
  const variantOptions = Object.entries(catalogContext?.options ?? {}).map(
    ([name, value]) => ({ name, value }),
  );
  let existing =
    catalogContext?.existingProduct && catalogContext.existingVariant
      ? {
          product: catalogContext.existingProduct,
          variant: catalogContext.existingVariant,
        }
      : catalogContext
        ? null
        : await findSpreeProduct(config, product.sku);
  let grouped = catalogContext ? variantOptions.length > 0 : false;
  let createdVariant = false;

  if (catalogContext && !existing && !catalogContext.existingProduct) {
    existing = await findSpreeProduct(config, spreeSku);
    if (existing) {
      await checkpointCatalogSpreeMapping(
        catalogContext,
        existing.product.id,
        existing.variant.id,
      );
    }
  }

  if (!catalogContext && !existing && languageGrouping) {
    const groupedMatch = await appendToExistingLanguageProduct(
      config,
      product,
      languageGrouping,
      pricing.retail,
    );
    if (groupedMatch) {
      existing = groupedMatch;
      grouped = true;
    }
  }

  if (
    !catalogContext &&
    !existing &&
    grouping.itemKind === "variant_candidate" &&
    grouping.groupKey
  ) {
    const groupedMatch = await appendToExistingGroupedProduct(
      config,
      product,
      grouping,
      pricing.retail,
    );
    if (groupedMatch) {
      existing = groupedMatch;
      grouped = true;
    }
  } else if (
    existing &&
    (existing.product.tags ?? []).includes("devir-group")
  ) {
    grouped = true;
  }

  if (!existing && catalogContext?.existingProduct) {
    const currentVariants = await spreeList<SpreeVariant>(
      config,
      "/products/" +
        encodeURIComponent(catalogContext.existingProduct.id) +
        "/variants",
    );
    const matchingVariant = currentVariants.find(
      (variant) => variant.sku?.trim() === spreeSku,
    );
    if (matchingVariant) {
      existing = {
        product: catalogContext.existingProduct,
        variant: matchingVariant,
      };
    } else {
      const created = await spreeRequest<SpreeVariant>(
        config,
        "POST",
        "/products/" +
          encodeURIComponent(catalogContext.existingProduct.id) +
          "/variants",
        {
          sku: spreeSku,
          cost_price: product.purchasePrice,
          cost_currency: catalogContext.offer.currency,
          ...shipping,
          track_inventory: true,
          backorder_limit: null,
          preorderable: supplierPreorderable,
          preorder_ships_at: supplierPreorderable ? product.releaseDate : null,
          options: variantOptions,
          prices: [{ currency: "EUR", amount: pricing.retail }],
        },
      );
      existing = { product: catalogContext.existingProduct, variant: created };
      createdVariant = true;
    }
    await checkpointCatalogSpreeMapping(
      catalogContext,
      existing.product.id,
      existing.variant.id,
    );
  }

  if (existing && catalogContext) {
    const adopted = await adoptPublishedCatalogReview(config, existing.product, reasons);
    if (adopted) {
      catalogContext.reviewDecision = adopted.review_decision;
      catalogContext.approvedReviewFingerprint = adopted.approved_review_fingerprint;
      review = shouldRequireCatalogReview({ reasons, decision: adopted.review_decision,
        approvedFingerprint: adopted.approved_review_fingerprint });
    }
  }

  let productId: string;
  let variantId: string | null = null;
  let manualPrice = false;
  const sourceCode = catalogContext?.supplier.code ?? "devir";
  const managedTag = catalogContext ? "catalog-managed" : "devir";
  const readyTag = catalogContext ? "catalog-ready" : "devir-ready";
  const reviewTag = catalogContext ? "catalog-review" : "devir-review";
  const sourceTags = [
    managedTag,
    ...(sourceCode === "devir" ? ["devir"] : []),
    review ? reviewTag : readyTag,
    ...(review ? ["REVISION-HUMANA", "NECESITA-TU-AYUDA"] : []),
  ];

  if (!existing) {
    const created = await spreeRequest<SpreeProduct>(
      config,
      "POST",
      "/products",
      {
        name: spreeProductName,
        status: "draft",
        tags: sourceTags,
        ...(category ? { category_ids: [category.id] } : {}),
        variants: [
          {
            options: variantOptions,
            sku: spreeSku,
            cost_price: product.purchasePrice,
            cost_currency: catalogContext?.offer.currency ?? "EUR",
            ...shipping,
            track_inventory: true,
            backorder_limit: null,
            preorderable: supplierPreorderable,
            preorder_ships_at: supplierPreorderable
              ? product.releaseDate
              : null,
            prices: [{ currency: "EUR", amount: pricing.retail }],
          },
        ],
      },
    );
    productId = created.id;
    const variants = await spreeList<SpreeVariant>(
      config,
      "/products/" + productId + "/variants",
    );
    variantId = variants.find((v) => v.sku === spreeSku)?.id ?? null;
    if (catalogContext) {
      await checkpointCatalogSpreeMapping(catalogContext, productId, variantId);
    }
  } else {
    productId = existing.product.id;
    variantId = existing.variant.id;
    const fields = await productFields(config, productId);
    let catalogLastAuto = Number(catalogContext?.lastAutoPrice);
    let needsManagedCleanup = false;
    if (sourceCode === "devir") {
      const { data: catalogPricing } = await supabase
        .from("devir_sync_catalog")
        .select("last_auto_price,title_cleanup_version")
        .eq("supplier_sku", product.sku)
        .maybeSingle();
      if (!catalogContext) {
        catalogLastAuto = Number(catalogPricing?.last_auto_price);
      }
      needsManagedCleanup =
        catalogPricing?.title_cleanup_version !== "devir-title-v3";
    }
    const legacyLastAuto = Number(
      fields.find((f) => f.key === "pricing.last_synced_price")?.value,
    );
    const lastAuto = Number.isFinite(catalogLastAuto)
      ? catalogLastAuto
      : legacyLastAuto;
    const currentPrice = variantPrice(existing.variant);
    const active = existing.product.status === "active";
    const managed =
      (existing.product.tags ?? []).includes("devir") ||
      (existing.product.tags ?? []).includes("catalog-managed");
    const forceDraftForSplit = packRequiresSplit && managed && review;
    const canWritePrice = canWriteManagedCatalogPrice({
      createdVariant,
      managed,
      forceDraftForSplit,
      currentPrice,
      lastAutoPrice: Number.isFinite(lastAuto) ? lastAuto : null,
    });
    manualPrice = currentPrice !== null && !canWritePrice;
    const tags = Array.from(
      new Set([
        ...(existing.product.tags ?? []).filter(
          (tag) =>
            !tag.startsWith("sourced:") &&
            ![
              "catalog-ready",
              "catalog-review",
              "devir-ready",
              "devir-review",
              "NECESITA-TU-AYUDA",
            ].includes(tag),
        ),
        ...sourceTags,
      ]),
    ).filter(
      (tag) =>
        review || (tag !== "REVISION-HUMANA" && tag !== "NECESITA-TU-AYUDA"),
    );
    const refreshManagedMetadata =
      managed && (!active || forceDraftForSplit || needsManagedCleanup);
    const markedProduct = await spreeRequest<SpreeProduct>(config, "PATCH", "/products/" + productId, {
      tags,
      ...(review ? { status: "draft" } : {}),
      ...(refreshManagedMetadata ? { name: spreeProductName } : {}),
      ...(refreshManagedMetadata && category
        ? { category_ids: [category.id] }
        : {}),
    });
    if (review && markedProduct.status !== "draft") {
      throw new Error("Spree no confirmó el borrador; no registrar nuevos motivos de revisión");
    }
    await spreeRequest(
      config,
      "PATCH",
      "/products/" +
        encodeURIComponent(productId) +
        "/variants/" +
        encodeURIComponent(existing.variant.id),
      {
        sku: spreeSku,
        cost_price: product.purchasePrice,
        cost_currency: catalogContext?.offer.currency ?? "EUR",
        ...shipping,
        track_inventory: true,
        backorder_limit: null,
        preorderable: supplierPreorderable,
        preorder_ships_at: supplierPreorderable ? product.releaseDate : null,
      },
    );
    if (canWritePrice) {
      await upsertBasePrice(config, existing.variant.id, pricing.retail);
    }
  }

  const effectivePrice =
    existing && manualPrice
      ? (variantPrice(existing.variant) ?? pricing.retail)
      : pricing.retail;
  const stripeFee =
    effectivePrice * STANDARD_EEA_CARD_RATE + STANDARD_EEA_CARD_FIXED_EUR;
  const effectiveProfit =
    effectivePrice / (1 + pricing.vatRate) - product.purchasePrice - stripeFee;
  const effectiveMargin =
    effectivePrice > 0 ? effectiveProfit / effectivePrice : 0;
  await upsertProductFields(config, productId, defs, {
    "devir.supplier_sku": catalogContext || grouped ? undefined : product.sku,
    "devir.source_url": catalogContext || grouped ? undefined : product.url,
    "devir.category_key": catalogContext ? undefined : key,
    "devir.availability":
      catalogContext || grouped ? undefined : product.availability,
    "devir.release_date":
      catalogContext || grouped
        ? undefined
        : (product.releaseDate ?? undefined),
    "devir.review_status": catalogContext
      ? undefined
      : review
        ? "⚠ REVISIÓN HUMANA"
        : "LISTO",
    "devir.review_reasons": catalogContext
      ? undefined
      : reasons.length
        ? humanizeReviewReasons(reasons)
        : "Sin revisión pendiente.",
    "devir.last_sync_at": catalogContext ? undefined : new Date().toISOString(),
    "catalog.review_status": review
      ? "⚠ NECESITA TU AYUDA"
      : reasons.length > 0 && catalogContext?.reviewDecision === "approved"
        ? "✓ APROBADO"
        : "LISTO",
    "catalog.review_pending_fingerprint": review ? catalogReviewFingerprint(reasons) : "none",
    "catalog.review_reason": review
      ? humanizeReviewReasons(reasons)
      : reasons.length > 0 && catalogContext?.reviewDecision === "approved"
        ? "Aprobado por ti: " + humanizeReviewReasons(reasons)
        : "Sin revisión pendiente.",
    "pricing.applied_margin": targetMargin,
    "pricing.effective_margin": effectiveMargin,
    "pricing.profile": commercialProfile.code,
    "pricing.rule_source":
      pricing.ruleSource +
      ":profile=" +
      commercialProfile.code +
      (category ? ":category=" + category.id : "") +
      (catalogContext ? ":supplier=" + sourceCode : ""),
    "pricing.vat_rate": pricing.vatRate,
    "pricing.cost_includes_vat": false,
    "pricing.last_synced_price": manualPrice ? undefined : pricing.retail,
    "pricing.manual_price_override": manualPrice,
  });

  if (catalogContext && variantId) {
    await upsertVariantProvenance(
      config,
      productId,
      defs,
      variantId,
      spreeSku,
      catalogContext.options,
      { supplier: catalogContext.supplier, offer: catalogContext.offer },
      catalogContext.offers,
    );
  }

  let backorderItems = await syncBackorderability(
    config,
    productId,
    variantId,
    product.availability,
    fulfillmentMode,
  );
  if (catalogContext && packRequiresSplit) {
    backorderItems += await syncApprovedSupplierPackChildren(
      config,
      {
        catalogProductId: catalogContext.catalogProductId,
        reviewDecision: catalogContext.reviewDecision,
        approvedReviewFingerprint: catalogContext.approvedReviewFingerprint,
      },
      productId,
      product.availability,
      product.releaseDate,
    );
  }
  if (
    sourceCode === TCGFACTORY_SUPPLIER_CODE &&
    variantId &&
    (product.availability === "available" ||
      product.availability === "preorder")
  ) {
    const current = await spreeRequest<SpreeVariant>(
      config,
      "GET",
      "/products/" +
        encodeURIComponent(productId) +
        "/variants/" +
        encodeURIComponent(variantId),
    );
    await patchVariantInventory(
      config,
      productId,
      variantId,
      Number(current.total_on_hand ?? 0),
      shouldAllowSupplierBackorder({
        availability: product.availability,
        fulfillmentMode,
      }),
      supplierPreorderable,
      supplierPreorderable ? product.releaseDate : null,
    );
    backorderItems += 1;
  }
  const images = await syncImages(config, productId, product);

  const physicalStockOnHand = existing
    ? Number(existing.variant.total_on_hand ?? 0)
    : 0;
  const autoPublish = shouldAutoPublishCatalogProduct({
    review,
    availability: product.availability,
    physicalStockOnHand,
    fulfillmentMode,
  });
  const shouldList =
    catalogContext
      ? shouldListCatalogProduct({ review, fulfillmentMode })
      : autoPublish;
  if (shouldList) {
    await spreeRequest(
      config,
      "PATCH",
      "/products/" + encodeURIComponent(productId),
      {
        status: "active",
      },
    );
    await ensureProductsInDefaultChannel(config, [productId]);
  } else if (review || fulfillmentMode === "disabled") {
    await spreeRequest(
      config,
      "PATCH",
      "/products/" + encodeURIComponent(productId),
      {
        status: "draft",
      },
    );
  }

  return {
    productId,
    variantId,
    images,
    review,
    reviewReasons: reasons,
    backorderItems,
    lastAutoPrice: manualPrice ? null : pricing.retail,
  };
}

interface CatalogGroupRow {
  supplier_sku: string;
  name: string;
  source_url: string | null;
  snapshot: Json | null;
  image_urls: string[] | null;
  spree_product_id: string | null;
  spree_variant_id: string | null;
  supplier_status:
    | "available"
    | "preorder"
    | "unavailable"
    | "unknown"
    | "missing";
  last_auto_price: number | string | null;
  group_key: string | null;
  group_name: string | null;
  variant_label: string | null;
  variant_position: number | null;
  grouping_confidence: "none" | "high" | "ambiguous";
  language_group_key?: string | null;
  language_label?: string | null;
  language_base_name?: string | null;
}

interface LanguageGroupingInfo {
  groupKey: string;
  baseName: string;
  language: string;
}

function variantEdition(label: string | null): string | null {
  if (!label) return null;
  const parts = label.split(" · ");
  return parts.length > 1 ? parts.slice(1).join(" · ").trim() || null : null;
}

function standardEditionStorageValue(copyIndex: number): string {
  if (copyIndex <= 0) return "Estándar";
  if (copyIndex === 1) return "Estándar · reimpresión";
  return "Estándar · reimpresión " + String(copyIndex);
}

function languageGroupingInfo(
  product: DevirProduct,
): LanguageGroupingInfo | null {
  const patterns: Array<[string, RegExp]> = [
    ["Español", /\b(?:español|castellano)\b/i],
    ["Inglés", /\b(?:inglés|ingles|english)\b/i],
    ["Francés", /\b(?:francés|frances|french)\b/i],
    ["Alemán", /\b(?:alemán|aleman|german)\b/i],
    ["Italiano", /\b(?:italiano|italian)\b/i],
    ["Portugués", /\b(?:portugués|portugues|portuguese)\b/i],
    ["Japonés", /\b(?:japonés|japones|japanese)\b/i],
  ];
  const match = patterns.find(([, regex]) => regex.test(product.name));
  if (!match) return null;

  const [language] = match;
  const baseName = product.name
    .replace(
      /\s*[-–—]?\s*\(?\s*(?:español|castellano|inglés|ingles|ngles|english|francés|frances|french|alemán|aleman|german|italiano|italian|portugués|portugues|portuguese|japonés|japones|japanese)\s*\)?\s*/gi,
      " ",
    )
    .replace(/\s+/g, " ")
    .replace(/\s+([,:;])/g, "$1")
    .replace(/\s+([-–—])\s+/g, " $1 ")
    .trim()
    .replace(/^[-–—]\s*|\s*[-–—]$/g, "")
    .trim();

  const groupKey = normalizeGroupKey(baseName);
  if (!groupKey || baseName.length < 4) return null;
  return { groupKey, baseName, language };
}

function devirCatalogItem(product: DevirProduct): SupplierCatalogItem {
  const grouping = groupingInfo(product);
  const language =
    grouping.itemKind === "standalone" ? languageGroupingInfo(product) : null;
  const edition = variantEdition(grouping.variantLabel);
  const options =
    grouping.itemKind === "variant_candidate"
      ? {
          tomo: String(grouping.variantPosition ?? 0).padStart(2, "0"),
          ...(edition ? { edicion: edition } : {}),
        }
      : language
        ? { idioma: language.language }
        : {};
  const productName =
    grouping.itemKind === "variant_candidate"
      ? (grouping.groupName ?? product.name)
      : (language?.baseName ?? product.name);
  const variantName =
    grouping.itemKind === "variant_candidate"
      ? grouping.variantLabel
      : (language?.language ?? null);
  const groupKey =
    grouping.itemKind === "variant_candidate"
      ? grouping.groupKey
      : language
        ? language.groupKey
        : null;

  return {
    supplierCode: "devir",
    supplierName: "Devir",
    adapterKey: "devir_b2b",
    externalProductId: product.url,
    externalVariantId: product.sku,
    supplierSku: product.sku,
    productName,
    variantName,
    sourceUrl: product.url,
    categoryKey: categoryKey(product),
    groupKey,
    gtin: product.sku,
    options,
    purchasePrice: Number(product.purchasePrice),
    normalizedCost: Number(product.purchasePrice),
    currency: "EUR",
    taxIncluded: false,
    referencePriceNet: product.referencePriceNet,
    availability: product.availability,
    releaseDate: product.releaseDate,
    imageUrls: product.imageUrls,
    metadata: {
      availabilityLabel: product.availabilityLabel,
      groupingConfidence: grouping.confidence,
    },
  };
}

function catalogRowProduct(row: CatalogGroupRow): DevirProduct {
  const snapshot =
    row.snapshot && typeof row.snapshot === "object"
      ? (row.snapshot as Json)
      : {};
  const availability =
    row.supplier_status === "available" ||
    row.supplier_status === "preorder" ||
    row.supplier_status === "unavailable"
      ? row.supplier_status
      : snapshot.availability === "available" ||
          snapshot.availability === "preorder" ||
          snapshot.availability === "unavailable"
        ? snapshot.availability
        : "unknown";
  return {
    sku: row.supplier_sku,
    name: cleanDevirTitle(row.name),
    url:
      row.source_url ?? (typeof snapshot.url === "string" ? snapshot.url : ""),
    purchasePrice:
      snapshot.purchasePrice !== null &&
      snapshot.purchasePrice !== undefined &&
      Number.isFinite(Number(snapshot.purchasePrice))
        ? Number(snapshot.purchasePrice)
        : null,
    referencePriceNet:
      snapshot.referencePriceNet !== null &&
      snapshot.referencePriceNet !== undefined &&
      Number.isFinite(Number(snapshot.referencePriceNet))
        ? Number(snapshot.referencePriceNet)
        : null,
    availability,
    availabilityLabel:
      typeof snapshot.availabilityLabel === "string"
        ? snapshot.availabilityLabel
        : null,
    releaseDate:
      typeof snapshot.releaseDate === "string" ? snapshot.releaseDate : null,
    imageUrls: Array.isArray(row.image_urls)
      ? row.image_urls.filter(
          (item): item is string => typeof item === "string",
        )
      : Array.isArray(snapshot.imageUrls)
        ? snapshot.imageUrls.filter(
            (item): item is string => typeof item === "string",
          )
        : [],
    retailUnitNormalized: snapshot.retailUnitNormalized === true,
    supplierPackUnits: Number.isFinite(Number(snapshot.supplierPackUnits))
      ? Number(snapshot.supplierPackUnits)
      : undefined,
  };
}

async function retireReplacementSource(
  config: ConfigRow,
  productId: string,
  replacementId: string,
): Promise<void> {
  if (!productId || productId === replacementId) return;
  try {
    const old = await spreeRequest<SpreeProduct>(
      config,
      "GET",
      "/products/" + encodeURIComponent(productId),
    );
    const tags = Array.from(new Set([...(old.tags ?? []), "devir-merged"]));
    await spreeRequest(
      config,
      "PATCH",
      "/products/" + encodeURIComponent(productId),
      {
        status: "archived",
        tags,
      },
    );
  } catch {
    // It may already have been removed during an earlier repair.
  }
}

async function createGroupedVariant(
  config: ConfigRow,
  productId: string,
  row: CatalogGroupRow,
  options: Array<{ name: string; value: string }>,
  key: string,
  position: number,
): Promise<SpreeVariant> {
  const product = catalogRowProduct(row);
  if (!product.purchasePrice || product.purchasePrice <= 0) {
    throw new Error("Producto sin coste Devir: " + row.supplier_sku);
  }
  const pricing = competitivePricing(
    product,
    key,
    commercialTargetMargin(product, key),
  );
  const shipping = shippingDefaults(key, product);
  const created = await spreeRequest<SpreeVariant>(
    config,
    "POST",
    "/products/" + encodeURIComponent(productId) + "/variants",
    {
      sku: product.sku,
      cost_price: product.purchasePrice,
      cost_currency: "EUR",
      ...shipping,
      position,
      track_inventory: true,
      backorder_limit: null,
      preorderable: product.availability === "preorder",
      preorder_ships_at:
        product.availability === "preorder" ? product.releaseDate : null,
      options,
      prices: [{ currency: "EUR", amount: pricing.retail }],
    },
  );
  return await patchVariantInventory(
    config,
    productId,
    created.id,
    0,
    product.availability === "available" || product.availability === "preorder",
    product.availability === "preorder",
    product.releaseDate,
    true,
  );
}

async function repointCanonicalCatalogSku(
  supplierCode: string,
  supplierSku: string,
  spreeProductId: string,
  spreeVariantId: string,
  targetCatalogProductId: string | null,
  categoryKeyValue: string,
  productName: string,
): Promise<string | null> {
  const { data: supplier, error: supplierError } = await supabase
    .from("catalog_suppliers")
    .select("id")
    .eq("code", supplierCode)
    .maybeSingle();
  if (supplierError)
    throw new Error("catalog supplier lookup: " + supplierError.message);
  if (!supplier?.id) return targetCatalogProductId;

  let targetProductId = targetCatalogProductId;
  if (!targetProductId) {
    const { data: mappedProduct, error: mappedError } = await supabase
      .from("catalog_products")
      .select("id")
      .eq("spree_product_id", spreeProductId)
      .maybeSingle();
    if (mappedError)
      throw new Error("catalog grouped product lookup: " + mappedError.message);
    targetProductId = mappedProduct?.id ?? null;
  }

  const { data: offers, error: offersError } = await supabase
    .from("catalog_supplier_offers")
    .select("variant_id")
    .eq("supplier_id", supplier.id)
    .eq("supplier_sku", supplierSku);
  if (offersError)
    throw new Error("catalog offer lookup: " + offersError.message);

  const canonicalVariantIds = Array.from(
    new Set((offers ?? []).map((offer) => offer.variant_id).filter(Boolean)),
  ) as string[];
  const now = new Date().toISOString();

  for (const canonicalVariantId of canonicalVariantIds) {
    const { data: canonicalVariant, error: variantLookupError } = await supabase
      .from("catalog_variants")
      .select("id,product_id")
      .eq("id", canonicalVariantId)
      .maybeSingle();
    if (variantLookupError) {
      throw new Error("catalog variant lookup: " + variantLookupError.message);
    }
    if (!canonicalVariant?.id || !canonicalVariant.product_id) continue;

    if (!targetProductId) {
      targetProductId = canonicalVariant.product_id;
      const { error: firstProductError } = await supabase
        .from("catalog_products")
        .update({
          name: productName,
          category_key: categoryKeyValue,
          spree_product_id: spreeProductId,
          updated_at: now,
        })
        .eq("id", targetProductId);
      if (firstProductError) {
        throw new Error(
          "catalog group product seed: " + firstProductError.message,
        );
      }
    }

    const { error: variantUpdateError } = await supabase
      .from("catalog_variants")
      .update({
        product_id: targetProductId,
        spree_variant_id: spreeVariantId,
        updated_at: now,
      })
      .eq("id", canonicalVariant.id);
    if (variantUpdateError) {
      throw new Error(
        "catalog group variant update: " + variantUpdateError.message,
      );
    }
  }

  if (targetProductId) {
    const { error: productUpdateError } = await supabase
      .from("catalog_products")
      .update({
        name: productName,
        category_key: categoryKeyValue,
        spree_product_id: spreeProductId,
        updated_at: now,
      })
      .eq("id", targetProductId);
    if (productUpdateError) {
      throw new Error(
        "catalog group product update: " + productUpdateError.message,
      );
    }
  }

  return targetProductId;
}

async function rebuildMangaGroup(
  config: ConfigRow,
  groupKey: string,
): Promise<{
  ok: boolean;
  group_key: string;
  product_id?: string;
  variants?: number;
  skipped?: string;
}> {
  const { data, error } = await supabase
    .from("devir_sync_catalog")
    .select(
      "supplier_sku,name,source_url,snapshot,image_urls,spree_product_id,spree_variant_id,supplier_status,last_auto_price,group_key,group_name,variant_label,variant_position,grouping_confidence",
    )
    .eq("group_key", groupKey)
    .eq("item_kind", "variant_candidate")
    .order("variant_position", { ascending: true })
    .order("supplier_sku", { ascending: true });
  if (error) throw error;
  const rows = (data ?? []) as CatalogGroupRow[];
  if (rows.length < 2) {
    return {
      ok: true,
      group_key: groupKey,
      skipped: "needs_at_least_two_variants",
    };
  }
  if (
    rows.some((row) => categoryKey(catalogRowProduct(row)) !== "manga-comic")
  ) {
    return { ok: true, group_key: groupKey, skipped: "not_manga_group" };
  }

  const categories = await spreeCategories(config);
  const category = categoryForKey(categories, "manga-comic");
  if (!category) throw new Error("No existe la categoría Manga y cómic");

  const groupName = rows.find((row) => row.group_name)?.group_name ?? groupKey;
  const positions = new Map<number, number>();
  for (const row of rows) {
    const pos = Number(row.variant_position ?? -1);
    positions.set(pos, (positions.get(pos) ?? 0) + 1);
  }
  const hasEditionDimension =
    rows.some((row) => Boolean(variantEdition(row.variant_label))) ||
    Array.from(positions.values()).some((count) => count > 1);

  const created = await spreeRequest<SpreeProduct>(
    config,
    "POST",
    "/products",
    {
      name: groupName,
      slug: groupKey,
      status: "draft",
      category_ids: [category.id],
      tags: ["devir", "devir-group", "devir-group-" + groupKey],
    },
  );

  const createdBySku = new Map<string, SpreeVariant>();
  const displayRows = [...rows].sort((a, b) => {
    const editionRank = (row: CatalogGroupRow) =>
      variantEdition(row.variant_label) ? 1 : 0;
    return (
      Number(a.variant_position ?? 0) - Number(b.variant_position ?? 0) ||
      editionRank(a) - editionRank(b) ||
      a.supplier_sku.localeCompare(b.supplier_sku)
    );
  });
  const displayPosition = new Map(
    displayRows.map((row, index) => [row.supplier_sku, index + 1]),
  );
  const creationRows = [...rows].sort((a, b) => {
    const availabilityRank = (row: CatalogGroupRow) =>
      row.supplier_status === "available"
        ? 0
        : row.supplier_status === "preorder"
          ? 1
          : 2;
    const editionRank = (row: CatalogGroupRow) =>
      variantEdition(row.variant_label) ? 1 : 0;
    return (
      availabilityRank(a) - availabilityRank(b) ||
      editionRank(a) - editionRank(b) ||
      Number(a.variant_position ?? 0) - Number(b.variant_position ?? 0) ||
      a.supplier_sku.localeCompare(b.supplier_sku)
    );
  });
  const standardEditionCounts = new Map<number, number>();
  for (const row of creationRows) {
    const position = Number(row.variant_position ?? 0);
    const duplicated = (positions.get(position) ?? 0) > 1;
    const explicitEdition = variantEdition(row.variant_label);
    const standardCopyIndex = standardEditionCounts.get(position) ?? 0;
    const edition =
      explicitEdition ??
      (duplicated
        ? standardEditionStorageValue(standardCopyIndex)
        : "Estándar");
    if (!explicitEdition) {
      standardEditionCounts.set(position, standardCopyIndex + 1);
    }
    const variant = await createGroupedVariant(
      config,
      created.id,
      row,
      [
        { name: "tomo", value: String(position).padStart(2, "0") },
        ...(hasEditionDimension ? [{ name: "edicion", value: edition }] : []),
      ],
      "manga-comic",
      displayPosition.get(row.supplier_sku) ?? 1,
    );
    createdBySku.set(row.supplier_sku, variant);
  }

  const verified = await spreeList<SpreeVariant>(
    config,
    "/products/" + encodeURIComponent(created.id) + "/variants",
  );
  const verifiedSkus = new Set(
    verified.map((variant) => variant.sku?.trim()).filter(Boolean),
  );
  for (const row of rows) {
    if (!verifiedSkus.has(row.supplier_sku)) {
      throw new Error(
        "No se pudo verificar la variante migrada " + row.supplier_sku,
      );
    }
  }

  const anyAvailable = rows.some((row) => row.supplier_status === "available");
  const anyPreorder = rows.some((row) => row.supplier_status === "preorder");
  const anySellable = anyAvailable || anyPreorder;
  await spreeRequest(
    config,
    "PATCH",
    "/products/" + encodeURIComponent(created.id),
    {
      status: anySellable ? "active" : "draft",
      category_ids: [category.id],
      tags: [
        "devir",
        "devir-group",
        "devir-group-" + groupKey,
        ...(anySellable
          ? ["devir-ready", "devir-published"]
          : ["devir-waiting-stock"]),
        ...(anyAvailable ? ["devir-buy-now"] : []),
        ...(anyPreorder ? ["devir-preorder"] : []),
      ],
    },
  );
  await ensureProductsInCategories(config, [created.id], [category.id]);
  if (anySellable) {
    await ensureProductsInDefaultChannel(config, [created.id]);
  }

  const imageSource = rows
    .map(catalogRowProduct)
    .find((product) => product.imageUrls.length);
  if (imageSource) {
    await syncImages(config, created.id, imageSource);
  }

  const oldProductIds = Array.from(
    new Set(rows.map((row) => row.spree_product_id).filter(Boolean)),
  ) as string[];
  let canonicalGroupProductId: string | null = null;

  for (const row of rows) {
    const variant = createdBySku.get(row.supplier_sku)!;
    const state =
      row.supplier_status === "available"
        ? "published"
        : row.supplier_status === "preorder"
          ? "preorder"
          : "waiting_supplier";
    const { error: updateError } = await supabase
      .from("devir_sync_catalog")
      .update({
        spree_product_id: created.id,
        spree_variant_id: variant.id,
        catalog_state: state,
        catalog_version: "devir-taxonomy-v2",
        sellability_version: "devir-stock-v1",
        last_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq("supplier_sku", row.supplier_sku);
    if (updateError) throw updateError;
    canonicalGroupProductId = await repointCanonicalCatalogSku(
      "devir",
      row.supplier_sku,
      created.id,
      variant.id,
      canonicalGroupProductId,
      "manga-comic",
      groupName,
    );
  }

  for (const oldId of oldProductIds) {
    await retireReplacementSource(config, oldId, created.id);
  }

  return {
    ok: true,
    group_key: groupKey,
    product_id: created.id,
    variants: rows.length,
  };
}

async function repairExistingMangaGroup(
  config: ConfigRow,
  groupKey: string,
): Promise<{
  ok: boolean;
  group_key: string;
  product_id?: string;
  variants?: number;
  skipped?: string;
  reused?: boolean;
}> {
  const { data, error } = await supabase
    .from("devir_sync_catalog")
    .select(
      "supplier_sku,name,source_url,snapshot,image_urls,spree_product_id,spree_variant_id,supplier_status,last_auto_price,group_key,group_name,variant_label,variant_position,grouping_confidence",
    )
    .eq("group_key", groupKey)
    .eq("item_kind", "variant_candidate")
    .order("variant_position", { ascending: true })
    .order("supplier_sku", { ascending: true });
  if (error) throw error;
  const rows = (data ?? []) as CatalogGroupRow[];
  if (rows.length < 2) {
    return {
      ok: true,
      group_key: groupKey,
      skipped: "needs_at_least_two_variants",
    };
  }

  const groupName = rows.find((row) => row.group_name)?.group_name ?? groupKey;
  const candidates = await spreeList<SpreeProduct>(
    config,
    "/products?q[search]=" + encodeURIComponent(groupName),
  );
  const tag = "devir-group-" + groupKey;
  const existing = candidates.find(
    (product) =>
      product.status !== "archived" && (product.tags ?? []).includes(tag),
  );
  if (!existing) return await rebuildMangaGroup(config, groupKey);

  const category = categoryForKey(await spreeCategories(config), "manga-comic");
  if (!category) throw new Error("No existe la categoría Manga y cómic");

  const positions = new Map<number, number>();
  for (const row of rows) {
    const position = Number(row.variant_position ?? -1);
    positions.set(position, (positions.get(position) ?? 0) + 1);
  }
  const hasEditionDimension =
    rows.some((row) => Boolean(variantEdition(row.variant_label))) ||
    Array.from(positions.values()).some((count) => count > 1);

  const displayRows = [...rows].sort(
    (a, b) =>
      Number(a.variant_position ?? 0) - Number(b.variant_position ?? 0) ||
      a.supplier_sku.localeCompare(b.supplier_sku),
  );
  const displayPosition = new Map(
    displayRows.map((row, index) => [row.supplier_sku, index + 1]),
  );

  const currentVariants = await spreeList<SpreeVariant>(
    config,
    "/products/" + encodeURIComponent(existing.id) + "/variants",
  );
  const variantsBySku = new Map(
    currentVariants
      .filter((variant) => variant.sku?.trim())
      .map((variant) => [variant.sku!.trim(), variant]),
  );
  const standardEditionCounts = new Map<number, number>();
  let canonicalGroupProductId: string | null = null;

  for (const row of rows) {
    const position = Number(row.variant_position ?? 0);
    const duplicated = (positions.get(position) ?? 0) > 1;
    const explicitEdition = variantEdition(row.variant_label);
    const standardCopyIndex = standardEditionCounts.get(position) ?? 0;
    const edition =
      explicitEdition ??
      (duplicated
        ? standardEditionStorageValue(standardCopyIndex)
        : "Estándar");
    if (!explicitEdition) {
      standardEditionCounts.set(position, standardCopyIndex + 1);
    }

    let variant = variantsBySku.get(row.supplier_sku);
    if (!variant) {
      variant = await createGroupedVariant(
        config,
        existing.id,
        row,
        [
          { name: "tomo", value: String(position).padStart(2, "0") },
          ...(hasEditionDimension ? [{ name: "edicion", value: edition }] : []),
        ],
        "manga-comic",
        displayPosition.get(row.supplier_sku) ?? 1,
      );
      variantsBySku.set(row.supplier_sku, variant);
    }

    const state =
      row.supplier_status === "available"
        ? "published"
        : row.supplier_status === "preorder"
          ? "preorder"
          : "waiting_supplier";
    const { error: updateError } = await supabase
      .from("devir_sync_catalog")
      .update({
        spree_product_id: existing.id,
        spree_variant_id: variant.id,
        catalog_state: state,
        catalog_version: "devir-taxonomy-v2",
        sellability_version: "devir-stock-v1",
        last_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq("supplier_sku", row.supplier_sku);
    if (updateError) throw updateError;

    canonicalGroupProductId = await repointCanonicalCatalogSku(
      "devir",
      row.supplier_sku,
      existing.id,
      variant.id,
      canonicalGroupProductId,
      "manga-comic",
      groupName,
    );
  }

  const anyAvailable = rows.some((row) => row.supplier_status === "available");
  const anyPreorder = rows.some((row) => row.supplier_status === "preorder");
  const anySellable = anyAvailable || anyPreorder;
  await spreeRequest(
    config,
    "PATCH",
    "/products/" + encodeURIComponent(existing.id),
    {
      name: groupName,
      slug: groupKey,
      status: anySellable ? "active" : "draft",
      category_ids: [category.id],
      tags: [
        "devir",
        "devir-group",
        tag,
        ...(anySellable
          ? ["devir-ready", "devir-published"]
          : ["devir-waiting-stock"]),
        ...(anyAvailable ? ["devir-buy-now"] : []),
        ...(anyPreorder ? ["devir-preorder"] : []),
      ],
    },
  );
  await ensureProductsInCategories(config, [existing.id], [category.id]);
  if (anySellable) await ensureProductsInDefaultChannel(config, [existing.id]);

  const imageSource = rows
    .map(catalogRowProduct)
    .find((product) => product.imageUrls.length);
  if (imageSource) await syncImages(config, existing.id, imageSource);

  const oldProductIds = Array.from(
    new Set(
      rows
        .map((row) => row.spree_product_id)
        .filter((id): id is string => Boolean(id) && id !== existing.id),
    ),
  );
  for (const oldId of oldProductIds) {
    await retireReplacementSource(config, oldId, existing.id);
  }

  return {
    ok: true,
    group_key: groupKey,
    product_id: existing.id,
    variants: rows.length,
    reused: true,
  };
}

async function normalizeMangaGroupProductMetadata(
  config: ConfigRow,
  groupKeys: string[],
): Promise<Array<Record<string, unknown>>> {
  const results: Array<Record<string, unknown>> = [];
  for (const groupKey of groupKeys) {
    try {
      const { data, error } = await supabase
        .from("devir_sync_catalog")
        .select("group_name,spree_product_id,item_kind")
        .eq("group_key", groupKey)
        .eq("item_kind", "variant_candidate");
      if (error) throw error;
      const rows = data ?? [];
      const productIds = Array.from(
        new Set(
          rows.map((row) => String(row.spree_product_id ?? "")).filter(Boolean),
        ),
      );
      if (rows.length < 2 || productIds.length !== 1) {
        results.push({
          group_key: groupKey,
          ok: false,
          skipped: "group_mapping_not_consolidated",
          product_ids: productIds,
        });
        continue;
      }

      const groupName =
        rows.find(
          (row) => typeof row.group_name === "string" && row.group_name.trim(),
        )?.group_name ?? groupKey;
      const productId = productIds[0];

      const conflicts = await spreeList<SpreeProduct & { slug?: string }>(
        config,
        "/products?q[slug_eq]=" + encodeURIComponent(groupKey),
      );
      const released: string[] = [];
      for (const conflict of conflicts) {
        if (conflict.id === productId) continue;
        const legacy =
          conflict.status === "archived" ||
          (conflict.tags ?? []).includes("devir-merged");
        if (!legacy) {
          throw new Error("slug_conflict_with_active_product:" + conflict.id);
        }
        const legacySlug =
          groupKey +
          "-legacy-" +
          conflict.id.replace(/^prod_/, "").toLowerCase();
        await spreeRequest(
          config,
          "PATCH",
          "/products/" + encodeURIComponent(conflict.id),
          { slug: legacySlug },
        );
        released.push(conflict.id);
      }

      const product = await spreeRequest<SpreeProduct & { slug?: string }>(
        config,
        "PATCH",
        "/products/" + encodeURIComponent(productId),
        {
          name: groupName,
          slug: groupKey,
        },
      );
      results.push({
        group_key: groupKey,
        ok: true,
        product_id: productId,
        name: product.name,
        slug: product.slug ?? groupKey,
        released_legacy_products: released,
      });
    } catch (error) {
      results.push({
        group_key: groupKey,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return results;
}

async function migrateCatalogGroup(
  config: ConfigRow,
  groupKey: string,
): Promise<{
  ok: boolean;
  group_key: string;
  product_id?: string;
  variants?: number;
  skipped?: string;
  reused?: boolean;
}> {
  return await repairExistingMangaGroup(config, groupKey);
}

async function migrateLanguageGroup(
  config: ConfigRow,
  groupKey: string,
): Promise<{
  ok: boolean;
  group_key: string;
  product_id?: string;
  variants?: number;
  skipped?: string;
}> {
  const { data, error } = await supabase
    .from("devir_sync_catalog")
    .select(
      "supplier_sku,name,source_url,snapshot,image_urls,spree_product_id,spree_variant_id,supplier_status,last_auto_price,group_key,group_name,variant_label,variant_position,grouping_confidence,language_group_key,language_label,language_base_name",
    )
    .eq("language_group_key", groupKey)
    .order("language_label", { ascending: true });
  if (error) throw error;
  const rows = (data ?? []) as CatalogGroupRow[];
  const languages = new Set(
    rows.map((row) => row.language_label).filter(Boolean),
  );
  if (rows.length < 2 || languages.size < 2) {
    return { ok: true, group_key: groupKey, skipped: "needs_two_languages" };
  }

  const products = rows.map(catalogRowProduct);
  const categoryKeys = new Set(products.map(categoryKey));
  if (categoryKeys.size !== 1) {
    return { ok: true, group_key: groupKey, skipped: "category_mismatch" };
  }
  const categoryKeyValue = Array.from(categoryKeys)[0];
  const categories = await spreeCategories(config);
  const category = categoryForKey(categories, categoryKeyValue);
  if (!category)
    return { ok: true, group_key: groupKey, skipped: "category_missing" };

  const baseName =
    rows.find((row) => row.language_base_name)?.language_base_name ??
    languageGroupingInfo(products[0])?.baseName ??
    products[0].name;

  const created = await spreeRequest<SpreeProduct>(
    config,
    "POST",
    "/products",
    {
      name: baseName,
      status: "draft",
      category_ids: [category.id],
      tags: [
        "devir",
        "devir-group",
        "devir-language-group",
        "devir-language-group-" + groupKey,
      ],
    },
  );

  const languageOrder: Record<string, number> = {
    Español: 1,
    Inglés: 2,
    Francés: 3,
    Alemán: 4,
    Italiano: 5,
    Portugués: 6,
  };
  const availabilityRank = (row: CatalogGroupRow) =>
    row.supplier_status === "available"
      ? 0
      : row.supplier_status === "preorder"
        ? 1
        : 2;
  const displayRows = [...rows].sort(
    (a, b) =>
      availabilityRank(a) - availabilityRank(b) ||
      (languageOrder[a.language_label ?? ""] ?? 99) -
        (languageOrder[b.language_label ?? ""] ?? 99),
  );
  const displayPosition = new Map(
    displayRows.map((row, index) => [row.supplier_sku, index + 1]),
  );
  const creationRows = [...displayRows];
  const createdBySku = new Map<string, SpreeVariant>();
  for (const row of creationRows) {
    const language =
      row.language_label ??
      languageGroupingInfo(catalogRowProduct(row))?.language;
    if (!language)
      throw new Error("Idioma no resuelto para " + row.supplier_sku);
    const variant = await createGroupedVariant(
      config,
      created.id,
      row,
      [{ name: "idioma", value: language }],
      categoryKeyValue,
      displayPosition.get(row.supplier_sku) ?? languageOrder[language] ?? 99,
    );
    createdBySku.set(row.supplier_sku, variant);
  }

  const verified = await spreeList<SpreeVariant>(
    config,
    "/products/" + encodeURIComponent(created.id) + "/variants",
  );
  const verifiedSkus = new Set(
    verified.map((variant) => variant.sku?.trim()).filter(Boolean),
  );
  for (const row of rows) {
    if (!verifiedSkus.has(row.supplier_sku)) {
      throw new Error(
        "No se pudo verificar la variante de idioma " + row.supplier_sku,
      );
    }
  }

  const anyAvailable = rows.some((row) => row.supplier_status === "available");
  const anyPreorder = rows.some((row) => row.supplier_status === "preorder");
  const anySellable = anyAvailable || anyPreorder;
  await spreeRequest(
    config,
    "PATCH",
    "/products/" + encodeURIComponent(created.id),
    {
      status: anySellable ? "active" : "draft",
      category_ids: [category.id],
      tags: [
        "devir",
        "devir-group",
        "devir-language-group",
        "devir-language-group-" + groupKey,
        ...(anySellable
          ? ["devir-ready", "devir-published"]
          : ["devir-waiting-stock"]),
        ...(anyAvailable ? ["devir-buy-now"] : []),
        ...(anyPreorder ? ["devir-preorder"] : []),
      ],
    },
  );
  await ensureProductsInCategories(config, [created.id], [category.id]);
  if (anySellable) {
    await ensureProductsInDefaultChannel(config, [created.id]);
  }

  const imageSource = products.find((product) => product.imageUrls.length);
  if (imageSource) await syncImages(config, created.id, imageSource);

  const oldProductIds = Array.from(
    new Set(rows.map((row) => row.spree_product_id).filter(Boolean)),
  ) as string[];
  let canonicalGroupProductId: string | null = null;

  for (const row of rows) {
    const variant = createdBySku.get(row.supplier_sku)!;
    const state =
      row.supplier_status === "available"
        ? "published"
        : row.supplier_status === "preorder"
          ? "preorder"
          : "waiting_supplier";
    const { error: updateError } = await supabase
      .from("devir_sync_catalog")
      .update({
        spree_product_id: created.id,
        spree_variant_id: variant.id,
        catalog_state: state,
        sellability_version: "devir-stock-v1",
        last_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq("supplier_sku", row.supplier_sku);
    if (updateError) throw updateError;
    canonicalGroupProductId = await repointCanonicalCatalogSku(
      "devir",
      row.supplier_sku,
      created.id,
      variant.id,
      canonicalGroupProductId,
      categoryKeyValue,
      baseName,
    );
  }

  for (const oldId of oldProductIds) {
    await retireReplacementSource(config, oldId, created.id);
  }

  return {
    ok: true,
    group_key: groupKey,
    product_id: created.id,
    variants: rows.length,
  };
}

const DEFAULT_CATEGORY_MARGINS: Record<string, number> = {
  // Minimum contribution after VAT and a standard EEA Stripe card fee.
  // Product-level commercial profiles can raise these category baselines.
  "juegos-de-mesa/general": 0.085,
  "juegos-de-mesa/expansiones": 0.1,
  "juegos-de-mesa/infantil": 0.095,
  "tcg/mtg": 0.045,
  "tcg/yugioh": 0.05,
  "rol/dungeons-dragons": 0.09,
  "rol/pathfinder": 0.09,
  "rol/warhammer": 0.09,
  "rol/otros": 0.09,
  "manga-comic": 0.05,
  accesorios: 0.14,
  ...Object.fromEntries(
    TCGFACTORY_ACCESSORY_CATEGORY_SPECS.map((spec) => [spec.key, 0.14]),
  ),
};


const STANDARD_EEA_CARD_RATE = 0.015;
const STANDARD_EEA_CARD_FIXED_EUR = 0.25;

function isBookSku(sku: string): boolean {
  return /^(978|979)/.test(sku.replace(/\D/g, ""));
}

function vatRateForSku(sku: string): number {
  return isBookSku(sku) ? 0.04 : 0.21;
}

function isBookProduct(product: DevirProduct, key: string): boolean {
  if (isBookSku(product.sku)) return true;
  if (!key.startsWith("rol/")) return false;

  // Do not classify an entire RPG brand as a fixed-price book. D&D,
  // Pathfinder and Warhammer also contain starter sets, screens, map packs,
  // cards and other accessories with non-book EANs. Keep the fallback only
  // for clearly editorial product names when an ISBN is unavailable.
  return /manual|gu[ií]a|libro|compendio|aventura|campaña|bestiario|suplemento|reglamento/i.test(
    product.name,
  );
}

function commercialTargetMargin(
  product: DevirProduct,
  key: string,
  categoryBaseMargin?: number | null,
): number {
  if (isBookProduct(product, key)) return 0.05;
  const profile = commercialPricingProfile({
    name: product.name,
    categoryKey: key,
    unitCostNet: product.purchasePrice,
  });
  const base =
    Number.isFinite(Number(categoryBaseMargin)) && Number(categoryBaseMargin) >= 0
      ? Number(categoryBaseMargin)
      : DEFAULT_CATEGORY_MARGINS[key] ?? 0.08;
  return Math.max(base, profile.targetMargin);
}

function roundUpToProfessionalPrice(value: number): number {
  // Keep the profitability floor untouched: choose the first clean retail
  // ending at or above it instead of mathematically rounding down.
  const euros = Math.floor(value);
  const endings = [0.5, 0.9, 0.95, 0.99, 1.0];

  for (const ending of endings) {
    const candidate = euros + ending;
    if (candidate + 1e-9 >= value) {
      return Math.round(candidate * 100) / 100;
    }
  }

  return Math.ceil(value * 100 - 1e-9) / 100;
}

function paymentAwareFloor(
  costNet: number,
  vatRate: number,
  targetProfitRate: number,
): number {
  const denominator =
    1 / (1 + vatRate) - STANDARD_EEA_CARD_RATE - targetProfitRate;
  if (denominator <= 0)
    throw new Error("Margen objetivo incompatible con IVA/comisiones");
  return (costNet + STANDARD_EEA_CARD_FIXED_EUR) / denominator;
}

const TCGFACTORY_MOQ_DEFAULT_THRESHOLD = 4;
const TCGFACTORY_MOQ_DEFAULT_EXCESS_COVERAGE_RATE = 0.08;
const TCGFACTORY_MOQ_DEFAULT_MAX_UNIT_COST_SHARE = 0.3;

function tcgFactoryMoqPricingConfig(
  supplierConfig?: Record<string, unknown> | null,
): {
  threshold: number;
  excessCoverageRate: number;
  maxUnitCostShare: number;
  quantityBySku: Record<string, number>;
} {
  const raw =
    supplierConfig?.minimumOrder &&
    typeof supplierConfig.minimumOrder === "object" &&
    !Array.isArray(supplierConfig.minimumOrder)
      ? (supplierConfig.minimumOrder as Record<string, unknown>)
      : {};
  const threshold = Number(raw.surchargeThreshold);
  const excessCoverageRate = Number(raw.excessCoverageRate);
  const maxUnitCostShare = Number(raw.maxUnitCostShare);
  const rawQuantities =
    raw.quantityBySku &&
    typeof raw.quantityBySku === "object" &&
    !Array.isArray(raw.quantityBySku)
      ? (raw.quantityBySku as Record<string, unknown>)
      : {};
  const quantityBySku = Object.fromEntries(
    Object.entries(rawQuantities).flatMap(([sku, value]) => {
      const quantity = Number(value);
      return Number.isInteger(quantity) && quantity > 1
        ? [[sku.trim().toUpperCase(), quantity] as const]
        : [];
    }),
  );

  return {
    threshold:
      Number.isInteger(threshold) && threshold >= 2
        ? threshold
        : TCGFACTORY_MOQ_DEFAULT_THRESHOLD,
    excessCoverageRate:
      Number.isFinite(excessCoverageRate) &&
      excessCoverageRate >= 0 &&
      excessCoverageRate <= 1
        ? excessCoverageRate
        : TCGFACTORY_MOQ_DEFAULT_EXCESS_COVERAGE_RATE,
    maxUnitCostShare:
      Number.isFinite(maxUnitCostShare) &&
      maxUnitCostShare >= 0 &&
      maxUnitCostShare <= 1
        ? maxUnitCostShare
        : TCGFACTORY_MOQ_DEFAULT_MAX_UNIT_COST_SHARE,
    quantityBySku,
  };
}

function tcgFactoryMinimumOrderQuantity(
  supplier: CatalogSupplierRow,
  sku: string,
  detected: number | null,
): number | null {
  const config = tcgFactoryMoqPricingConfig(supplier.config);
  const override = config.quantityBySku[sku.trim().toUpperCase()];
  return override ?? detected;
}

function minimumOrderRiskSurcharge(
  product: DevirProduct,
  supplierCode?: string | null,
  supplierConfig?: Record<string, unknown> | null,
): number {
  if (
    !supplierCode ||
    normalizeSupplierCode(supplierCode) !== TCGFACTORY_SUPPLIER_CODE
  ) {
    return 0;
  }
  const quantity = Number(product.supplierMinimumQuantity);
  if (!Number.isInteger(quantity) || quantity <= 1 || !product.purchasePrice) {
    return 0;
  }
  const config = tcgFactoryMoqPricingConfig(supplierConfig);
  if (quantity < config.threshold) return 0;
  return supplierMinimumOrderRiskSurcharge({
    supplierCode,
    unitCostNet: product.purchasePrice,
    minimumOrderQuantity: quantity,
    threshold: config.threshold,
    excessCoverageRate: config.excessCoverageRate,
    maxUnitCostShare: config.maxUnitCostShare,
  });
}

function competitivePricing(
  product: DevirProduct,
  key: string,
  targetProfitRate = DEFAULT_CATEGORY_MARGINS[key] ?? 0.05,
  supplierCode?: string | null,
  supplierConfig?: Record<string, unknown> | null,
): {
  retail: number;
  vatRate: number;
  referenceGross: number | null;
  floor: number;
  effectiveProfitRate: number;
  ruleSource: string;
  reviewReason: string | null;
  minimumOrderSurchargeNet: number;
  minimumOrderSurchargeGross: number;
} {
  if (!product.purchasePrice || product.purchasePrice <= 0) {
    throw new Error("Producto sin coste Devir: " + product.sku);
  }

  const book = isBookProduct(product, key);
  const vatRate = supplierVatRate({ supplierCode, isBook: book });
  const minimumOrderSurchargeNet = minimumOrderRiskSurcharge(
    product,
    supplierCode,
    supplierConfig,
  );
  const pricingCostNet = product.purchasePrice + minimumOrderSurchargeNet;
  const floor = paymentAwareFloor(pricingCostNet, vatRate, targetProfitRate);
  // Convert the net inventory-risk amount into the gross checkout amount
  // required to recover it after VAT and Stripe's percentage fee.
  const surchargeRecoveryDenominator =
    1 / (1 + vatRate) - STANDARD_EEA_CARD_RATE;
  const minimumOrderSurchargeGross =
    minimumOrderSurchargeNet > 0 && surchargeRecoveryDenominator > 0
      ? minimumOrderSurchargeNet / surchargeRecoveryDenominator
      : 0;
  const referenceNet = Number(product.referencePriceNet);
  const hasReference =
    Number.isFinite(referenceNet) && referenceNet > product.purchasePrice;
  const referenceGross = hasReference ? referenceNet * (1 + vatRate) : null;
  let raw = floor;
  let ruleSource = "cost_floor";
  let reviewReason: string | null = null;

  if (referenceGross !== null) {
    const commercialProfile = commercialPricingProfile({
      name: product.name,
      categoryKey: key,
      unitCostNet: product.purchasePrice,
    });
    const discount = book ? 0.05 : commercialProfile.referenceDiscount;
    const marketTarget = referenceGross * (1 - discount);
    raw = Math.max(floor, marketTarget + minimumOrderSurchargeGross);
    ruleSource = book
      ? "devir_rrp_fixed_book_5pct"
      : "devir_rrp_competitive_discount";

    if (book && floor > referenceGross + 0.005) {
      reviewReason = "fixed_book_cost_floor_above_rrp";
    } else if (!book && floor > referenceGross + 0.005) {
      reviewReason = "cost_floor_above_reference_rrp";
    }
  } else if (book) {
    // A book cannot safely be auto-priced without its fixed publisher price.
    reviewReason = "fixed_book_reference_price_missing";
  }

  let retail: number;
  if (book && referenceGross !== null) {
    // Books keep the legal fixed-price ceiling, but customer-facing prices
    // should still look like normal retail prices (9.50, 9.90, 9.95, 9.99…)
    // instead of calculation artefacts such as 9.46 or 10.41.
    retail = roundUpToProfessionalPrice(raw);
    // Never exceed the publisher/reference PVP automatically. If the next
    // commercial ending is above it, the PVP itself is the safe ceiling.
    retail = Math.min(retail, Math.round(referenceGross * 100) / 100);
  } else {
    retail = roundUpToProfessionalPrice(raw);
  }

  const stripeFee =
    retail * STANDARD_EEA_CARD_RATE + STANDARD_EEA_CARD_FIXED_EUR;
  const netSale = retail / (1 + vatRate);
  const profit = netSale - pricingCostNet - stripeFee;
  const effectiveProfitRate = retail > 0 ? profit / retail : 0;
  if (minimumOrderSurchargeNet > 0) {
    ruleSource += "+tcgfactory_moq_risk";
  }

  return {
    retail,
    vatRate,
    referenceGross:
      referenceGross === null ? null : Math.round(referenceGross * 100) / 100,
    floor: Math.round(floor * 100) / 100,
    effectiveProfitRate,
    ruleSource,
    reviewReason,
    minimumOrderSurchargeNet: Math.round(minimumOrderSurchargeNet * 100) / 100,
    minimumOrderSurchargeGross:
      Math.round(minimumOrderSurchargeGross * 100) / 100,
  };
}

function shippingDefaults(
  key: string,
  product: DevirProduct,
): {
  weight: number;
  height: number;
  width: number;
  depth: number;
  weight_unit: string;
  dimensions_unit: string;
} {
  const name = product.name.toLowerCase();
  if (key === "manga-comic") {
    return {
      weight: 0.35,
      height: 21,
      width: 15,
      depth: 2.5,
      weight_unit: "kg",
      dimensions_unit: "cm",
    };
  }
  if (key.startsWith("rol/") && isBookProduct(product, key)) {
    return {
      weight: 1.2,
      height: 29,
      width: 22,
      depth: 3.5,
      weight_unit: "kg",
      dimensions_unit: "cm",
    };
  }
  if (key === "tcg/mtg" || key === "tcg/yugioh") {
    if (/display|cart[oó]n|caja|\(\s*\d{2,}\s*\)|booster box/i.test(name)) {
      return {
        weight: 1.5,
        height: 25,
        width: 18,
        depth: 15,
        weight_unit: "kg",
        dimensions_unit: "cm",
      };
    }
    return {
      weight: 0.5,
      height: 20,
      width: 14,
      depth: 8,
      weight_unit: "kg",
      dimensions_unit: "cm",
    };
  }
  if (key === "accesorios" || key.startsWith("accesorios/")) {
    if (key === "accesorios/tapetes") {
      return {
        weight: 0.65,
        height: 42,
        width: 8,
        depth: 8,
        weight_unit: "kg",
        dimensions_unit: "cm",
      };
    }
    if (key === "accesorios/albumes" || key === "accesorios/almacenaje") {
      return {
        weight: 0.65,
        height: 32,
        width: 25,
        depth: 8,
        weight_unit: "kg",
        dimensions_unit: "cm",
      };
    }
    return {
      weight: 0.3,
      height: 22,
      width: 16,
      depth: 6,
      weight_unit: "kg",
      dimensions_unit: "cm",
    };
  }
  if (key === "rol/warhammer") {
    return {
      weight: 0.9,
      height: 30,
      width: 22,
      depth: 7,
      weight_unit: "kg",
      dimensions_unit: "cm",
    };
  }
  return {
    weight: 1.5,
    height: 30,
    width: 30,
    depth: 8,
    weight_unit: "kg",
    dimensions_unit: "cm",
  };
}

async function ensureCategory(
  config: ConfigRow,
  categories: SpreeCategory[],
  name: string,
  permalink: string,
): Promise<SpreeCategory> {
  const existing = categories.find(
    (category) => category.permalink === permalink,
  );
  if (existing) return existing;
  const created = await spreeRequest<SpreeCategory>(
    config,
    "POST",
    "/categories",
    {
      name,
      permalink,
    },
  );
  categories.push(created);
  return created;
}

async function ensureCategoryAlias(
  config: ConfigRow,
  categories: SpreeCategory[],
  name: string,
  permalink: string,
  aliases: string[] = [],
): Promise<SpreeCategory> {
  let existing = categories.find(
    (category) =>
      category.permalink === permalink ||
      aliases.includes(category.permalink ?? ""),
  );
  if (!existing) {
    return await ensureCategory(config, categories, name, permalink);
  }
  if (existing.permalink !== permalink || existing.name !== name) {
    existing = await spreeRequest<SpreeCategory>(
      config,
      "PATCH",
      "/categories/" + encodeURIComponent(existing.id),
      { name, permalink },
    );
    const index = categories.findIndex((item) => item.id === existing!.id);
    if (index >= 0) categories[index] = existing;
  }
  return existing;
}

async function setCategoryMargin(
  config: ConfigRow,
  category: SpreeCategory,
  margin: number,
): Promise<void> {
  const defs = await spreeList<SpreeFieldDefinition>(
    config,
    "/custom_field_definitions",
  );
  const def = defs.find(
    (item) =>
      item.resource_type === "Spree::Taxon" &&
      item.namespace === "pricing" &&
      item.key === "target_margin",
  );
  if (!def)
    throw new Error("Falta custom field pricing.target_margin para categorías");

  const fields = await spreeList<SpreeCustomField>(
    config,
    "/categories/" + encodeURIComponent(category.id) + "/custom_fields",
  );
  const current = fields.find(
    (field) =>
      field.key === "pricing.target_margin" || field.key === "target_margin",
  );
  if (current) {
    if (Math.abs(Number(current.value) - margin) > 0.0001) {
      await spreeRequest(
        config,
        "PATCH",
        "/categories/" +
          encodeURIComponent(category.id) +
          "/custom_fields/" +
          current.id,
        { value: margin },
      );
    }
  } else {
    await spreeRequest(
      config,
      "POST",
      "/categories/" + encodeURIComponent(category.id) + "/custom_fields",
      { custom_field_definition_id: def.id, value: margin },
    );
  }
}

async function setupCatalogCategoriesAndMargins(config: ConfigRow): Promise<
  Array<{
    id: string;
    name: string;
    permalink: string;
    target_margin: number;
  }>
> {
  let categories = await spreeCategories(config);
  const juegos = await ensureCategory(
    config,
    categories,
    "Juegos de mesa",
    "juegos-de-mesa",
  );
  const rol = await ensureCategory(config, categories, "Rol", "rol");
  const tcg = await ensureCategory(config, categories, "TCG", "tcg");
  await ensureCategory(config, categories, "Manga y cómic", "manga-comic");
  const accesorios = await ensureCategory(
    config,
    categories,
    "Accesorios",
    "accesorios",
  );

  const specs: Array<{
    key: string;
    name: string;
    slug: string;
    parent: SpreeCategory | null;
    position: number;
  }> = [
    {
      key: "juegos-de-mesa/general",
      name: "General",
      slug: "general",
      parent: juegos,
      position: 0,
    },
    {
      key: "juegos-de-mesa/expansiones",
      name: "Expansiones",
      slug: "expansiones",
      parent: juegos,
      position: 1,
    },
    {
      key: "juegos-de-mesa/infantil",
      name: "Infantil",
      slug: "infantil",
      parent: juegos,
      position: 2,
    },
    {
      key: "rol/dungeons-dragons",
      name: "Dungeons & Dragons",
      slug: "dungeons-dragons",
      parent: rol,
      position: 0,
    },
    {
      key: "rol/pathfinder",
      name: "Pathfinder",
      slug: "pathfinder",
      parent: rol,
      position: 1,
    },
    {
      key: "rol/warhammer",
      name: "Warhammer",
      slug: "warhammer",
      parent: rol,
      position: 2,
    },
    {
      key: "rol/otros",
      name: "Otros juegos de rol",
      slug: "otros",
      parent: rol,
      position: 3,
    },
    { key: "tcg/mtg", name: "MTG", slug: "mtg", parent: tcg, position: 0 },
    {
      key: "tcg/yugioh",
      name: "Yugioh",
      slug: "yugioh",
      parent: tcg,
      position: 1,
    },
    {
      key: "manga-comic",
      name: "Manga y cómic",
      slug: "manga-comic",
      parent: null,
      position: 0,
    },
    {
      key: "accesorios",
      name: "Accesorios",
      slug: "accesorios",
      parent: null,
      position: 0,
    },
    ...TCGFACTORY_ACCESSORY_CATEGORY_SPECS.map((spec, position) => ({
      ...spec,
      parent: accesorios,
      position,
    })),
  ];

  for (const spec of specs) {
    if (categoryForKey(categories, spec.key)) continue;
    const created = await spreeRequest<SpreeCategory>(
      config,
      "POST",
      "/categories",
      {
        name: spec.name,
        permalink: spec.slug,
      },
    );
    if (spec.parent) {
      await spreeRequest(
        config,
        "PATCH",
        "/categories/" + encodeURIComponent(created.id) + "/reposition",
        { new_parent_id: spec.parent.id, new_position: spec.position },
      );
    }
    categories = await spreeCategories(config);
  }

  const output = [];
  for (const spec of specs) {
    const category = categoryForKey(categories, spec.key);
    if (!category) continue;
    const margin = DEFAULT_CATEGORY_MARGINS[spec.key] ?? 0.05;
    await setCategoryMargin(config, category, margin);
    output.push({
      id: category.id,
      name: category.name,
      permalink: category.permalink ?? spec.key,
      target_margin: margin,
    });
  }
  return output;
}

async function categorizeDraftBatch(
  config: ConfigRow,
  offset: number,
  limit: number,
): Promise<{
  processed: number;
  updated: number;
  repriced: number;
  failed: number;
  next_offset: number | null;
}> {
  const categories = await spreeCategories(config);
  const { data, error } = await supabase
    .from("devir_sync_catalog")
    .select(
      "supplier_sku,name,source_url,snapshot,spree_product_id,spree_variant_id",
    )
    .not("spree_product_id", "is", null)
    .order("supplier_sku")
    .range(offset, offset + limit - 1);
  if (error) throw error;

  const rows = data ?? [];
  const productIds = Array.from(
    new Set(
      rows.map((row) => String(row.spree_product_id ?? "")).filter(Boolean),
    ),
  );
  const products = new Map<string, SpreeProduct | null>();

  for (let index = 0; index < productIds.length; index += 5) {
    const chunk = productIds.slice(index, index + 5);
    await Promise.all(
      chunk.map(async (productId) => {
        try {
          products.set(
            productId,
            await spreeRequest<SpreeProduct>(
              config,
              "GET",
              "/products/" + encodeURIComponent(productId),
            ),
          );
        } catch {
          products.set(productId, null);
        }
      }),
    );
  }

  let updated = 0;
  let repriced = 0;
  let failed = 0;

  const processRow = async (row: Record<string, unknown>) => {
    const productId = String(row.spree_product_id ?? "");
    let variantId = String(row.spree_variant_id ?? "");
    const legacySku = String(row.supplier_sku ?? "");
    const spreeProduct = products.get(productId);
    if (!productId || !variantId || !legacySku || !spreeProduct) return;
    if (
      spreeProduct.status !== "draft" ||
      !(spreeProduct.tags ?? []).includes("devir")
    )
      return;

    const selectedSupply = await selectedSupplyForSpreeVariant(variantId);
    if (!selectedSupply?.supplier_code) return;
    const snapshot =
      row.snapshot && typeof row.snapshot === "object"
        ? (row.snapshot as Json)
        : null;
    const cost = Number(selectedSupply.normalized_cost);
    const product: DevirProduct = {
      sku: selectedSupply.canonical_sku || legacySku,
      name: String(row.name),
      url: selectedSupply.source_url ?? String(row.source_url),
      purchasePrice: Number.isFinite(cost) ? cost : null,
      referencePriceNet: Number.isFinite(
        Number(selectedSupply.reference_price_net),
      )
        ? Number(selectedSupply.reference_price_net)
        : snapshot && Number.isFinite(Number(snapshot.referencePriceNet))
          ? Number(snapshot.referencePriceNet)
          : null,
      availability: selectedSupply.availability ?? "unknown",
      availabilityLabel: null,
      releaseDate: null,
      imageUrls: [],
      supplierMinimumQuantity: selectedSupply.minimum_order_quantity ?? null,
    };
    const key = categoryKey(product);
    const category = categoryForKey(categories, key);
    const margin = commercialTargetMargin(product, key);
    if (
      !category ||
      !Number.isFinite(margin) ||
      !product.purchasePrice ||
      product.purchasePrice <= 0
    )
      return;

    const pricing = competitivePricing(
      product,
      key,
      margin,
      selectedSupply.supplier_code,
      selectedSupply.supplier_config,
    );

    const patch = async () => {
      await spreeRequest(
        config,
        "PATCH",
        "/products/" + encodeURIComponent(productId),
        {
          category_ids: [category.id],
        },
      );
      await spreeRequest(
        config,
        "PATCH",
        "/products/" +
          encodeURIComponent(productId) +
          "/variants/" +
          encodeURIComponent(variantId),
        {
          sku: product.sku,
          cost_price: product.purchasePrice,
          cost_currency: "EUR",
        },
      );
      await upsertBasePrice(config, variantId, pricing.retail);
    };

    try {
      try {
        await patch();
      } catch (patchError) {
        const message =
          patchError instanceof Error ? patchError.message : String(patchError);
        if (!/variant_not_found|Variant no encontrado/i.test(message))
          throw patchError;

        const variants = await spreeList<SpreeVariant>(
          config,
          "/products/" + encodeURIComponent(productId) + "/variants",
        );
        const repaired = variants.find(
          (variant) => variant.sku?.trim() === product.sku,
        );
        if (!repaired) throw patchError;

        variantId = repaired.id;
        const { error: repairError } = await supabase
          .from("devir_sync_catalog")
          .update({
            spree_variant_id: variantId,
            updated_at: new Date().toISOString(),
          })
          .eq("supplier_sku", legacySku);
        if (repairError) throw repairError;
        await patch();
      }

      const { error: catalogUpdateError } = await supabase
        .from("devir_sync_catalog")
        .update({
          spree_variant_id: variantId,
          last_auto_price: pricing.retail,
          last_error: null,
          updated_at: new Date().toISOString(),
        })
        .eq("supplier_sku", legacySku);
      if (catalogUpdateError) throw catalogUpdateError;
      const { error: canonicalUpdateError } = await supabase
        .from("catalog_variants")
        .update({
          last_auto_price: pricing.retail,
          updated_at: new Date().toISOString(),
        })
        .eq("id", selectedSupply.variant_id);
      if (canonicalUpdateError) throw canonicalUpdateError;

      updated += 1;
      repriced += 1;
    } catch (rowError) {
      failed += 1;
      await supabase
        .from("devir_sync_catalog")
        .update({
          last_error:
            rowError instanceof Error ? rowError.message : String(rowError),
          updated_at: new Date().toISOString(),
        })
        .eq("supplier_sku", legacySku);
    }
  };

  for (let index = 0; index < rows.length; index += 5) {
    await Promise.all(
      rows
        .slice(index, index + 5)
        .map((row) => processRow(row as Record<string, unknown>)),
    );
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  return {
    processed: rows.length,
    updated,
    repriced,
    failed,
    next_offset: rows.length < limit ? null : offset + limit,
  };
}

async function repriceCommercialBooksBatch(
  config: ConfigRow,
  offset: number,
  limit: number,
): Promise<{
  processed: number;
  repriced: number;
  unchanged: number;
  failed: number;
  next_offset: number | null;
}> {
  const { data, error } = await supabase
    .from("devir_sync_catalog")
    .select(
      "supplier_sku,name,source_url,snapshot,spree_product_id,spree_variant_id,last_auto_price",
    )
    .or("supplier_sku.like.978%,supplier_sku.like.979%")
    .not("spree_product_id", "is", null)
    .not("spree_variant_id", "is", null)
    .order("supplier_sku")
    .range(offset, offset + limit - 1);
  if (error) throw error;

  const rows = data ?? [];
  const priceRows: Array<{
    sku: string;
    legacySku: string;
    catalogVariantId: string;
    productId: string;
    variantId: string;
    retail: number;
  }> = [];
  let unchanged = 0;
  let failed = 0;
  const variantsByProduct = new Map<string, SpreeVariant[]>();

  for (const row of rows) {
    const legacySku = String(row.supplier_sku ?? "");
    const productId = String(row.spree_product_id ?? "");
    const variantId = String(row.spree_variant_id ?? "");
    const selectedSupply = await selectedSupplyForSpreeVariant(variantId);
    const sku = selectedSupply?.canonical_sku || legacySku;
    const snapshot =
      row.snapshot && typeof row.snapshot === "object"
        ? (row.snapshot as Json)
        : {};
    const purchasePrice = Number(selectedSupply?.normalized_cost);
    const selectedReferencePrice = Number(selectedSupply?.reference_price_net);
    const referencePriceNet = Number.isFinite(selectedReferencePrice)
      ? selectedReferencePrice
      : Number(snapshot.referencePriceNet);

    if (
      !selectedSupply?.supplier_code ||
      !sku ||
      !productId ||
      !variantId ||
      !Number.isFinite(purchasePrice) ||
      purchasePrice <= 0
    ) {
      unchanged += 1;
      continue;
    }

    const product: DevirProduct = {
      sku,
      name: String(row.name ?? sku),
      url: selectedSupply.source_url ?? String(row.source_url ?? ""),
      purchasePrice,
      referencePriceNet:
        Number.isFinite(referencePriceNet) && referencePriceNet > 0
          ? referencePriceNet
          : null,
      availability: "unknown",
      availabilityLabel: null,
      releaseDate: null,
      imageUrls: [],
      supplierMinimumQuantity: selectedSupply.minimum_order_quantity ?? null,
    };

    try {
      const key = categoryKey(product);
      const pricing = competitivePricing(
        product,
        key,
        0.05,
        selectedSupply.supplier_code,
        selectedSupply.supplier_config,
      );

      let resolvedProductId = productId;
      let resolvedVariantId = variantId;
      let productVariants = variantsByProduct.get(productId);

      if (!productVariants) {
        try {
          productVariants = await spreeList<SpreeVariant>(
            config,
            "/products/" + encodeURIComponent(productId) + "/variants",
          );
          variantsByProduct.set(productId, productVariants);
        } catch {
          productVariants = [];
        }
      }

      const currentVariant = productVariants.find(
        (variant) => variant.sku?.trim() === sku,
      );

      if (currentVariant) {
        resolvedVariantId = currentVariant.id;
      } else {
        const repaired = await findSpreeProduct(config, sku);
        if (!repaired) {
          throw new Error("No se encontró la variante actual para SKU " + sku);
        }
        resolvedProductId = repaired.product.id;
        resolvedVariantId = repaired.variant.id;
      }

      if (resolvedProductId !== productId || resolvedVariantId !== variantId) {
        const { error: repairError } = await supabase
          .from("devir_sync_catalog")
          .update({
            spree_product_id: resolvedProductId,
            spree_variant_id: resolvedVariantId,
            updated_at: new Date().toISOString(),
          })
          .eq("supplier_sku", legacySku);
        if (repairError) throw repairError;
        const { error: canonicalProductError } = await supabase
          .from("catalog_products")
          .update({
            spree_product_id: resolvedProductId,
            updated_at: new Date().toISOString(),
          })
          .eq("id", selectedSupply.product_id);
        if (canonicalProductError) throw canonicalProductError;
        const { error: canonicalVariantError } = await supabase
          .from("catalog_variants")
          .update({
            spree_variant_id: resolvedVariantId,
            updated_at: new Date().toISOString(),
          })
          .eq("id", selectedSupply.variant_id);
        if (canonicalVariantError) throw canonicalVariantError;
      }

      priceRows.push({
        sku,
        legacySku,
        catalogVariantId: selectedSupply.variant_id,
        productId: resolvedProductId,
        variantId: resolvedVariantId,
        retail: pricing.retail,
      });
    } catch (rowError) {
      failed += 1;
      await supabase
        .from("devir_sync_catalog")
        .update({
          last_error:
            "COMMERCIAL-PRICE: " +
            (rowError instanceof Error ? rowError.message : String(rowError)),
          updated_at: new Date().toISOString(),
        })
        .eq("supplier_sku", legacySku);
    }
  }

  if (priceRows.length) {
    const now = new Date().toISOString();

    for (let index = 0; index < priceRows.length; index += 6) {
      await Promise.all(
        priceRows.slice(index, index + 6).map(async (row) => {
          try {
            await updateVariantRetailPrice(
              config,
              row.productId,
              row.variantId,
              row.retail,
            );
            const { error: updateError } = await supabase
              .from("devir_sync_catalog")
              .update({
                last_auto_price: row.retail,
                last_error: null,
                updated_at: now,
              })
              .eq("supplier_sku", row.legacySku);
            if (updateError) throw updateError;
            const { error: canonicalUpdateError } = await supabase
              .from("catalog_variants")
              .update({ last_auto_price: row.retail, updated_at: now })
              .eq("id", row.catalogVariantId);
            if (canonicalUpdateError) throw canonicalUpdateError;
          } catch (priceError) {
            failed += 1;
            await supabase
              .from("devir_sync_catalog")
              .update({
                last_error:
                  "COMMERCIAL-PRICE: " +
                  (priceError instanceof Error
                    ? priceError.message
                    : String(priceError)),
                updated_at: new Date().toISOString(),
              })
              .eq("supplier_sku", row.legacySku);
          }
        }),
      );
      await new Promise((resolve) => setTimeout(resolve, 80));
    }
  }

  return {
    processed: rows.length,
    repriced: Math.max(0, priceRows.length - failed),
    unchanged,
    failed,
    next_offset: rows.length < limit ? null : offset + limit,
  };
}

interface CatalogAuditRow {
  supplier_sku: string;
  source_url: string;
  name: string;
  snapshot: Json | null;
  image_urls: unknown;
  spree_product_id: string | null;
  spree_variant_id: string | null;
  supplier_status: string | null;
  item_kind: string | null;
  grouping_confidence: string | null;
  last_error: string | null;
  catalog_version?: string | null;
  catalog_state?: string | null;
}

interface SpreeChannel {
  id: string;
  name: string;
  code?: string;
  active?: boolean;
  default?: boolean;
}

function productFromCatalogRow(row: CatalogAuditRow): DevirProduct {
  const snapshot = row.snapshot ?? {};
  const cost = Number(snapshot.purchasePrice);
  const reference = Number(snapshot.referencePriceNet);
  const imageUrls = Array.isArray(snapshot.imageUrls)
    ? snapshot.imageUrls.filter(
        (value): value is string => typeof value === "string",
      )
    : Array.isArray(row.image_urls)
      ? (row.image_urls as unknown[]).filter(
          (value): value is string => typeof value === "string",
        )
      : [];
  const availability =
    row.supplier_status === "available" ||
    row.supplier_status === "preorder" ||
    row.supplier_status === "unavailable"
      ? row.supplier_status
      : "unknown";

  return {
    sku: row.supplier_sku,
    name: row.name,
    url: row.source_url,
    purchasePrice: Number.isFinite(cost) ? cost : null,
    referencePriceNet:
      Number.isFinite(reference) && reference > 0 ? reference : null,
    availability,
    availabilityLabel:
      typeof snapshot.availabilityLabel === "string"
        ? snapshot.availabilityLabel
        : null,
    releaseDate:
      typeof snapshot.releaseDate === "string" ? snapshot.releaseDate : null,
    imageUrls,
  };
}

async function verifyDevirBatch(
  config: ConfigRow,
  offset: number,
  limit: number,
): Promise<{
  processed: number;
  confirmed: number;
  available: number;
  unavailable: number;
  preorder: number;
  unknown: number;
  failed: number;
  next_offset: number | null;
}> {
  const { data, error } = await supabase
    .from("devir_sync_catalog")
    .select(
      "supplier_sku,source_url,name,snapshot,image_urls,spree_product_id,spree_variant_id,supplier_status,item_kind,grouping_confidence,last_error",
    )
    .order("supplier_sku")
    .range(offset, offset + limit - 1);
  if (error) throw error;

  const rows = (data ?? []) as CatalogAuditRow[];
  let confirmed = 0;
  let available = 0;
  let unavailable = 0;
  let preorder = 0;
  let unknown = 0;
  let failed = 0;

  const verifyOne = async (row: CatalogAuditRow) => {
    const now = new Date().toISOString();
    try {
      const html = await devirFetch(config, row.source_url);
      const current = parseProduct(html, row.source_url);
      if (!current) throw new Error("source_page_without_sku");
      if (current.sku.trim() !== row.supplier_sku.trim()) {
        throw new Error("source_sku_mismatch:" + current.sku);
      }

      const signature = await sha256(current.imageUrls.join("\n"));
      const enrichedSnapshot = {
        ...current,
        sourceVerifiedAt: now,
        sourceVerified: true,
      };
      const update: Record<string, unknown> = {
        name: current.name,
        source_url: current.url,
        snapshot: enrichedSnapshot,
        image_urls: current.imageUrls,
        image_signature: signature,
        supplier_status: current.availability,
        last_seen_at: now,
        last_synced_at: now,
        missing_cycles: 0,
        last_error: null,
        updated_at: now,
        ...(row.supplier_status !== current.availability
          ? {
              catalog_version: null,
              catalog_state: null,
              catalog_prepared_at: null,
            }
          : {}),
      };
      if (current.availability === "available") {
        update.last_confirmed_available_at = now;
        available += 1;
      } else if (current.availability === "unavailable") {
        unavailable += 1;
      } else if (current.availability === "preorder") {
        preorder += 1;
      } else {
        unknown += 1;
      }
      const { error: updateError } = await supabase
        .from("devir_sync_catalog")
        .update(update)
        .eq("supplier_sku", row.supplier_sku);
      if (updateError) throw updateError;
      confirmed += 1;
    } catch (sourceError) {
      failed += 1;
      const message =
        sourceError instanceof Error
          ? sourceError.message
          : String(sourceError);
      const previous = row.snapshot ?? {};
      await supabase
        .from("devir_sync_catalog")
        .update({
          supplier_status: "unknown",
          snapshot: {
            ...previous,
            sourceVerifiedAt: now,
            sourceVerified: false,
          },
          last_error: "SOURCE-VERIFY: " + message,
          updated_at: now,
        })
        .eq("supplier_sku", row.supplier_sku);
    }
  };

  for (let index = 0; index < rows.length; index += 8) {
    await Promise.all(rows.slice(index, index + 8).map(verifyOne));
    await new Promise((resolve) => setTimeout(resolve, 120));
  }

  return {
    processed: rows.length,
    confirmed,
    available,
    unavailable,
    preorder,
    unknown,
    failed,
    next_offset: rows.length < limit ? null : offset + limit,
  };
}

async function repairCategoryTreeAndMembership(
  config: ConfigRow,
  offset = 0,
  limit = 100,
): Promise<{
  categories: Array<{ id: string; name: string; permalink?: string }>;
  processed: number;
  products_assigned: number;
  canonical_keys_updated: number;
  conflicts: number;
  missing_categories: number;
  failed: number;
  next_offset: number | null;
}> {
  // Keep the repair path aligned with the canonical category setup. The old
  // implementation predated the RPG subcategories and treated "Rol" itself
  // as a leaf, which left D&D/Pathfinder products outside their visible nodes.
  await setupCatalogCategoriesAndMargins(config);
  const categories = await spreeCategories(config);
  const managedKeys = [
    "juegos-de-mesa/general",
    "juegos-de-mesa/expansiones",
    "juegos-de-mesa/infantil",
    "rol/dungeons-dragons",
    "rol/pathfinder",
    "rol/warhammer",
    "rol/otros",
    "tcg/mtg",
    "tcg/yugioh",
    "manga-comic",
    "accesorios",
  ];
  const managedCategories = managedKeys.flatMap((key) => {
    const category = categoryForKey(categories, key);
    return category ? [category] : [];
  });

  const { data, error } = await supabase
    .from("devir_sync_catalog")
    .select("supplier_sku,name,source_url,spree_product_id")
    .not("spree_product_id", "is", null);
  if (error) throw error;

  const productKeys = new Map<string, Set<string>>();
  for (const row of data ?? []) {
    const productId = String(row.spree_product_id ?? "");
    if (!productId) continue;
    const product: DevirProduct = {
      sku: String(row.supplier_sku),
      name: String(row.name),
      url: String(row.source_url),
      purchasePrice: null,
      referencePriceNet: null,
      availability: "unknown",
      availabilityLabel: null,
      releaseDate: null,
      imageUrls: [],
    };
    const set = productKeys.get(productId) ?? new Set<string>();
    set.add(categoryKey(product));
    productKeys.set(productId, set);
  }

  const entries = Array.from(productKeys.entries()).sort(([left], [right]) =>
    left.localeCompare(right),
  );
  const batch = entries.slice(offset, offset + limit);

  let productsAssigned = 0;
  let canonicalKeysUpdated = 0;
  let conflicts = 0;
  let missingCategories = 0;
  let failed = 0;

  const repairOne = async ([productId, keys]: [string, Set<string>]) => {
    try {
      if (keys.size !== 1) {
        conflicts += 1;
        await supabase
          .from("devir_sync_catalog")
          .update({
            last_error: "CATEGORY-CONFLICT: " + Array.from(keys).join(","),
            updated_at: new Date().toISOString(),
          })
          .eq("spree_product_id", productId);
        return;
      }

      const key = Array.from(keys)[0];
      const category = categoryForKey(categories, key);
      if (!category) {
        missingCategories += 1;
        return;
      }

      await spreeRequest(
        config,
        "PATCH",
        "/products/" + encodeURIComponent(productId),
        { category_ids: [category.id] },
      );
      productsAssigned += 1;

      const { data: updatedProducts, error: canonicalUpdateError } =
        await supabase
          .from("catalog_products")
          .update({
            category_key: key,
            updated_at: new Date().toISOString(),
          })
          .eq("spree_product_id", productId)
          .select("id");
      if (canonicalUpdateError) throw canonicalUpdateError;
      canonicalKeysUpdated += updatedProducts?.length ?? 0;

      await supabase
        .from("devir_sync_catalog")
        .update({
          last_error: null,
          updated_at: new Date().toISOString(),
        })
        .eq("spree_product_id", productId);
    } catch (error) {
      failed += 1;
      await supabase
        .from("devir_sync_catalog")
        .update({
          last_error:
            "CATEGORY-REPAIR: " +
            (error instanceof Error ? error.message : String(error)),
          updated_at: new Date().toISOString(),
        })
        .eq("spree_product_id", productId);
    }
  };

  for (let index = 0; index < batch.length; index += 8) {
    await Promise.all(batch.slice(index, index + 8).map(repairOne));
  }

  return {
    categories: managedCategories.map((item) => ({
      id: item.id,
      name: item.name,
      permalink: item.permalink,
    })),
    processed: batch.length,
    products_assigned: productsAssigned,
    canonical_keys_updated: canonicalKeysUpdated,
    conflicts,
    missing_categories: missingCategories,
    failed,
    next_offset:
      offset + batch.length < entries.length ? offset + batch.length : null,
  };
}

async function updateReviewFieldLabels(config: ConfigRow): Promise<void> {
  const defs = await spreeList<SpreeFieldDefinition>(
    config,
    "/custom_field_definitions",
  );
  const status = defs.find(
    (item) =>
      item.resource_type === "Spree::Product" &&
      item.namespace === "devir" &&
      item.key === "review_status",
  );
  const reasons = defs.find(
    (item) =>
      item.resource_type === "Spree::Product" &&
      item.namespace === "devir" &&
      item.key === "review_reasons",
  );
  if (status) {
    await spreeRequest(
      config,
      "PATCH",
      "/custom_field_definitions/" + status.id,
      {
        label: "⚠ Devir · Intervención humana",
      },
    );
  }
  if (reasons) {
    await spreeRequest(
      config,
      "PATCH",
      "/custom_field_definitions/" + reasons.id,
      {
        label: "⚠ Devir · Motivo de revisión",
      },
    );
  }
}

async function preparePublishBatch(
  config: ConfigRow,
  offset: number,
  limit: number,
  targetSpreeProductId?: string | null,
): Promise<{
  processed_products: number;
  published: number;
  waiting_supplier: number;
  human_review: number;
  variants_updated: number;
  next_offset: number | null;
}> {
  let pendingQuery = supabase
    .from("devir_sync_catalog")
    .select(
      "supplier_sku,source_url,name,snapshot,image_urls,spree_product_id,spree_variant_id,supplier_status,item_kind,grouping_confidence,last_error,catalog_version,catalog_state",
    )
    .not("spree_product_id", "is", null)
    .or("catalog_version.is.null,catalog_version.neq.devir-taxonomy-v2");
  if (targetSpreeProductId) {
    pendingQuery = pendingQuery.eq("spree_product_id", targetSpreeProductId);
  }
  const { data, error } = await pendingQuery
    .order("spree_product_id")
    .order("supplier_sku");
  if (error) throw error;

  const allRows = (data ?? []) as CatalogAuditRow[];
  const groups = new Map<string, CatalogAuditRow[]>();
  for (const row of allRows) {
    const productId = String(row.spree_product_id ?? "");
    if (!productId) continue;
    const rows = groups.get(productId) ?? [];
    rows.push(row);
    groups.set(productId, rows);
  }
  const productIds = Array.from(groups.keys()).sort();
  // Pending products only: always consume from the front. A completed product
  // is checkpointed below, so repeated calls are naturally resumable.
  const selected = productIds.slice(0, limit);
  const defs = await definitions(config);
  const categories = await spreeCategories(config);
  const channels = await spreeList<SpreeChannel>(config, "/channels");
  const channel =
    channels.find((item) => item.active && item.default) ??
    channels.find((item) => item.active) ??
    channels[0];
  if (!channel) throw new Error("No hay canal de venta activo en Spree");

  let published = 0;
  let waitingSupplier = 0;
  let humanReview = 0;
  let variantsUpdated = 0;

  const processProduct = async (productId: string) => {
    const rows = groups.get(productId) ?? [];
    let spreeProduct: SpreeProduct;
    try {
      spreeProduct = await spreeRequest<SpreeProduct>(
        config,
        "GET",
        "/products/" + encodeURIComponent(productId),
      );
    } catch (productError) {
      await supabase
        .from("devir_sync_catalog")
        .update({
          last_error:
            "SPREE-PRODUCT: " +
            (productError instanceof Error
              ? productError.message
              : String(productError)),
          updated_at: new Date().toISOString(),
        })
        .eq("spree_product_id", productId);
      humanReview += 1;
      return;
    }

    const originalTags = spreeProduct.tags ?? [];
    if (!originalTags.includes("devir")) {
      humanReview += 1;
      await supabase
        .from("devir_sync_catalog")
        .update({
          catalog_state: "review",
          catalog_version: "devir-taxonomy-v2",
          catalog_prepared_at: new Date().toISOString(),
          last_error: "CATALOG: product not managed by Devir",
          updated_at: new Date().toISOString(),
        })
        .eq("spree_product_id", productId);
      return;
    }

    await adoptPublishedCatalogReview(config, spreeProduct, await currentCatalogReviewReasonsForSpreeProduct(productId));
    // Product-level policy is required below for every variant in this batch.
    const { data: catalogProductPolicy, error: catalogProductPolicyError } =
      await supabase
        .from("catalog_products")
        .select(
          "id,review_decision,approved_review_fingerprint,review_decided_at,review_note",
        )
        .eq("spree_product_id", productId)
        .maybeSingle();
    if (catalogProductPolicyError) throw catalogProductPolicyError;

    const reviewDecision =
      (catalogProductPolicy?.review_decision as CatalogReviewDecision | null) ??
      "pending";
    const approvedReviewFingerprint =
      typeof catalogProductPolicy?.approved_review_fingerprint === "string"
        ? catalogProductPolicy.approved_review_fingerprint
        : null;

    const { data: catalogVariantPolicies, error: catalogVariantPoliciesError } =
      catalogProductPolicy?.id
        ? await supabase
            .from("catalog_variants")
            .select("spree_variant_id,fulfillment_mode")
            .eq("product_id", catalogProductPolicy.id)
        : { data: [], error: null };
    if (catalogVariantPoliciesError) throw catalogVariantPoliciesError;
    const fulfillmentModeByVariant = new Map<string, CatalogFulfillmentMode>(
      (catalogVariantPolicies ?? []).flatMap((row) => {
        const variantId = String(row.spree_variant_id ?? "");
        if (!variantId) return [];
        return [
          [
            variantId,
            (row.fulfillment_mode as CatalogFulfillmentMode | null) ??
              "supplier_or_physical",
          ] as const,
        ];
      }),
    );

    const variants = await spreeList<SpreeVariant>(
      config,
      "/products/" + encodeURIComponent(productId) + "/variants",
    );
    const productReasons = new Set<string>();
    const categoryKeys = new Set<string>();
    const hasAnyEnabledVariant = variants.some((variant) => {
      const mode =
        fulfillmentModeByVariant.get(variant.id) ?? "supplier_or_physical";
      return mode !== "disabled";
    });
    const hasAnyPhysicalRetailStock = variants.some((variant) => {
      const mode =
        fulfillmentModeByVariant.get(variant.id) ?? "supplier_or_physical";
      return mode !== "disabled" && Number(variant.total_on_hand ?? 0) > 0;
    });
    let anySellable = hasAnyPhysicalRetailStock;
    let anyWaiting = false;
    let hasPreorder = false;
    let hasAvailable = hasAnyPhysicalRetailStock;
    let updatedForProduct = 0;

    for (const row of rows) {
      const legacyProduct = productFromCatalogRow(row);
      const snapshot = row.snapshot ?? {};
      const sourceVerified = snapshot.sourceVerified === true;
      const sourceVerifiedAt =
        typeof snapshot.sourceVerifiedAt === "string"
          ? snapshot.sourceVerifiedAt
          : null;
      const key = categoryKey(legacyProduct);
      categoryKeys.add(key);

      if (!legacyProduct.imageUrls.length) {
        productReasons.add("product_image_missing");
      }
      const packRequiresSplit = isPack(legacyProduct);
      if (packRequiresSplit) {
        productReasons.add("pack_requires_operator_split");
      }
      if (isCatalanCatalogProduct(legacyProduct)) {
        productReasons.add("catalan_requires_operator_review");
      }
      if (groupingInfo(legacyProduct).confidence === "ambiguous") {
        productReasons.add("grouping_requires_operator_review");
      }

      let variant = row.spree_variant_id
        ? variants.find((item) => item.id === row.spree_variant_id)
        : undefined;
      if (!variant) {
        variant = variants.find(
          (item) => item.sku?.trim() === legacyProduct.sku,
        );
      }
      if (!variant) {
        productReasons.add("variant_not_found_for_sku:" + legacyProduct.sku);
        continue;
      }

      const fulfillmentMode = effectiveCatalogFulfillmentMode({
        fulfillmentMode:
          fulfillmentModeByVariant.get(variant.id) ?? "supplier_or_physical",
        requiresPackSplit: packRequiresSplit,
      });
      const physicalStockOnHand = Math.max(
        0,
        Number(variant.total_on_hand ?? 0),
      );
      const physicalSellable =
        fulfillmentMode !== "disabled" && physicalStockOnHand > 0;
      if (physicalSellable) {
        anySellable = true;
        hasAvailable = true;
      }

      if (variant.id !== row.spree_variant_id) {
        await supabase
          .from("devir_sync_catalog")
          .update({
            spree_variant_id: variant.id,
            updated_at: new Date().toISOString(),
          })
          .eq("supplier_sku", legacyProduct.sku);
      }

      const selectedSupply = await selectedSupplyForSpreeVariant(variant.id);
      if (!selectedSupply?.supplier_code) {
        await enforceVariantFulfillmentFlags(
          config,
          productId,
          variant.id,
          "unavailable",
          fulfillmentMode,
        );
        if (!physicalSellable) anyWaiting = true;
        continue;
      }

      // Fulfillment policy is a safety control, not a merchandising decision.
      // Apply it before any review-related early exit so a draft/review product
      // cannot retain stale supplier backorder or preorder flags in Spree.
      if (fulfillmentMode !== "supplier_or_physical") {
        await enforceVariantFulfillmentFlags(
          config,
          productId,
          variant.id,
          selectedSupply.availability ?? "unavailable",
          fulfillmentMode,
        );
      }
      if (
        selectedSupply.supplier_code === "devir" &&
        (!sourceVerified || !sourceVerifiedAt)
      ) {
        productReasons.add("supplier_source_not_verified");
        continue;
      }

      const selectedCost = Number(selectedSupply.normalized_cost);
      if (!Number.isFinite(selectedCost) || selectedCost <= 0) {
        productReasons.add("supplier_cost_missing");
        continue;
      }
      const selectedReference = Number(selectedSupply.reference_price_net);
      const selectedProduct: DevirProduct = {
        ...legacyProduct,
        sku: selectedSupply.canonical_sku || legacyProduct.sku,
        url: selectedSupply.source_url ?? legacyProduct.url,
        purchasePrice: selectedCost,
        referencePriceNet:
          Number.isFinite(selectedReference) && selectedReference > 0
            ? selectedReference
            : legacyProduct.referencePriceNet,
        availability: selectedSupply.availability ?? "unknown",
        supplierMinimumQuantity: selectedSupply.minimum_order_quantity ?? null,
      };
      const targetMargin = commercialTargetMargin(selectedProduct, key);
      const pricing = competitivePricing(
        selectedProduct,
        key,
        targetMargin,
        selectedSupply.supplier_code,
        selectedSupply.supplier_config,
      );
      if (pricing.reviewReason) productReasons.add(pricing.reviewReason);

      const reconciled = await reconcileSpreeVariantFromCatalog(
        config,
        variant.id,
        categories,
        defs,
      );
      if (!reconciled) {
        productReasons.add("canonical_variant_not_found:" + variant.id);
        continue;
      }
      if (reconciled.lastAutoPrice !== null) {
        await supabase
          .from("devir_sync_catalog")
          .update({
            last_auto_price: reconciled.lastAutoPrice,
            last_error: null,
            updated_at: new Date().toISOString(),
          })
          .eq("supplier_sku", legacyProduct.sku);
      }

      variantsUpdated += 1;
      updatedForProduct += 1;
      const supplierSellable = shouldAllowSupplierBackorder({
        availability: selectedSupply.availability ?? "unknown",
        fulfillmentMode,
      });
      if (supplierSellable && selectedSupply.availability === "available") {
        anySellable = true;
        hasAvailable = true;
      } else if (
        supplierSellable &&
        selectedSupply.availability === "preorder"
      ) {
        anySellable = true;
        hasPreorder = true;
      } else if (!physicalSellable) {
        anyWaiting = true;
      }
    }

    if (categoryKeys.size !== 1) {
      productReasons.add(
        "product_category_conflict:" + Array.from(categoryKeys).join(","),
      );
    }

    if (reviewDecision === "rejected") {
      productReasons.add("operator_rejected");
    }
    const human = shouldRequireCatalogReview({
      reasons: productReasons,
      decision: reviewDecision,
      approvedFingerprint: approvedReviewFingerprint,
    });
    const publish = !human && anySellable;
    const waiting = !human && !anySellable && anyWaiting;
    const visible = shouldListCatalogProduct({
      review: human,
      fulfillmentMode: hasAnyEnabledVariant
        ? "supplier_or_physical"
        : "disabled",
    });
    const catalogState = human
      ? "review"
      : waiting
        ? "waiting_supplier"
        : hasPreorder && hasAvailable
          ? "published_mixed"
          : hasPreorder
            ? "preorder"
            : "published";

    const cleanTags = originalTags.filter(
      (tag) =>
        ![
          "devir-ready",
          "devir-published",
          "devir-preorder",
          "devir-buy-now",
          "devir-waiting-stock",
          "devir-review",
          "REVISION-HUMANA",
          "NECESITA-TU-AYUDA",
        ].includes(tag),
    );
    let tags = Array.from(
      new Set([
        ...cleanTags,
        "devir",
        ...(publish
          ? [
              "devir-ready",
              "devir-published",
              ...(hasPreorder ? ["devir-preorder"] : []),
              ...(hasAvailable ? ["devir-buy-now"] : []),
            ]
          : []),
        ...(waiting ? ["devir-waiting-stock"] : []),
        ...(human
          ? ["devir-review", "REVISION-HUMANA", "NECESITA-TU-AYUDA"]
          : []),
      ]),
    );
    if (publish) {
      tags = tags.filter(
        (tag) =>
          tag !== "devir-review" &&
          tag !== "REVISION-HUMANA" &&
          tag !== "NECESITA-TU-AYUDA" &&
          tag !== "devir-waiting-stock",
      );
    } else if (waiting) {
      tags = tags.filter(
        (tag) =>
          tag !== "devir-ready" &&
          tag !== "devir-published" &&
          tag !== "devir-review" &&
          tag !== "REVISION-HUMANA" &&
          tag !== "NECESITA-TU-AYUDA" &&
          tag !== "devir-preorder" &&
          tag !== "devir-buy-now",
      );
    } else {
      tags = tags.filter(
        (tag) => tag !== "devir-ready" && tag !== "devir-published",
      );
    }

    const resolvedCategory =
      categoryKeys.size === 1
        ? categoryForKey(categories, Array.from(categoryKeys)[0])
        : undefined;

    const preparedProduct = await spreeRequest<SpreeProduct>(
      config,
      "PATCH",
      "/products/" + encodeURIComponent(productId),
      {
        status: visible ? "active" : "draft",
        tags,
        ...(resolvedCategory ? { category_ids: [resolvedCategory.id] } : {}),
      },
    );
    if (human && preparedProduct.status !== "draft") throw new Error("Spree no confirmó el borrador de revisión");

    if (visible) {
      await spreeRequest(
        config,
        "POST",
        "/channels/" + encodeURIComponent(channel.id) + "/add_products",
        { product_ids: [productId] },
      );
      if (publish) published += 1;
      else if (waiting) waitingSupplier += 1;
    } else {
      try {
        await spreeRequest(
          config,
          "POST",
          "/channels/" + encodeURIComponent(channel.id) + "/remove_products",
          { product_ids: [productId] },
        );
      } catch {
        // Draft status is the primary visibility control if channel removal is
        // unavailable on a particular Spree patch level.
      }
      if (human) humanReview += 1;
      else if (waiting) waitingSupplier += 1;
    }

    await upsertProductFields(config, productId, defs, {
      "catalog.review_status": human
        ? "⚠ NECESITA TU AYUDA"
        : productReasons.size > 0 && reviewDecision === "approved"
          ? "✓ APROBADO"
          : "LISTO",
      "catalog.review_pending_fingerprint": human ? catalogReviewFingerprint(productReasons) : "none",
      "catalog.review_reason": human
        ? humanizeReviewReasons(productReasons)
        : productReasons.size > 0 && reviewDecision === "approved"
          ? "Aprobado por ti: " + humanizeReviewReasons(productReasons)
          : "Sin revisión pendiente.",
      ...(human
        ? {
            "devir.review_status": "⚠ REVISIÓN HUMANA",
            "devir.review_reasons": humanizeReviewReasons(productReasons),
            "devir.last_sync_at": new Date().toISOString(),
          }
        : {}),
    });

    if (!human && updatedForProduct === 0 && rows.length > 0) {
      await supabase
        .from("devir_sync_catalog")
        .update({
          last_error: "PREPARE: no variants updated",
          updated_at: new Date().toISOString(),
        })
        .eq("spree_product_id", productId);
    }

    await supabase
      .from("devir_sync_catalog")
      .update({
        catalog_state: catalogState,
        catalog_version: "devir-taxonomy-v2",
        catalog_prepared_at: new Date().toISOString(),
        last_error: human
          ? "REVIEW: " + Array.from(productReasons).join(", ")
          : null,
        updated_at: new Date().toISOString(),
      })
      .eq("spree_product_id", productId);

    await new Promise((resolve) => setTimeout(resolve, 80));
  };

  for (let index = 0; index < selected.length; index += 4) {
    await Promise.all(selected.slice(index, index + 4).map(processProduct));
    await new Promise((resolve) => setTimeout(resolve, 120));
  }

  return {
    processed_products: selected.length,
    published,
    waiting_supplier: waitingSupplier,
    human_review: humanReview,
    variants_updated: variantsUpdated,
    next_offset: selected.length < limit ? null : 0,
  };
}

async function repairSellabilityBatch(
  config: ConfigRow,
  limit: number,
): Promise<{
  processed: number;
  repaired: number;
  failed: number;
  remaining: number;
}> {
  const version = "catalog-stock-v4";
  const categories = await spreeCategories(config);
  const defs = await definitions(config);
  const { data, error } = await supabase
    .from("devir_sync_catalog")
    .select(
      "supplier_sku,spree_product_id,spree_variant_id,supplier_status,snapshot,catalog_state",
    )
    .in("catalog_state", ["published", "preorder", "published_mixed"])
    .or("sellability_version.is.null,sellability_version.neq." + version)
    .not("spree_product_id", "is", null)
    .not("spree_variant_id", "is", null)
    .order("supplier_sku")
    .limit(limit);
  if (error) throw error;

  const rows = data ?? [];
  let repaired = 0;
  let failed = 0;

  const processRow = async (row: Record<string, unknown>) => {
    const sku = String(row.supplier_sku ?? "");
    const productId = String(row.spree_product_id ?? "");
    const variantId = String(row.spree_variant_id ?? "");
    if (!sku || !productId || !variantId) return;

    try {
      const selectedSupply = await selectedSupplyForSpreeVariant(variantId);
      await reconcileSpreeVariantFromCatalog(
        config,
        variantId,
        categories,
        defs,
      );
      const current = await spreeRequest<SpreeVariant>(
        config,
        "GET",
        "/products/" +
          encodeURIComponent(productId) +
          "/variants/" +
          encodeURIComponent(variantId),
      );
      const preorder = selectedSupply?.availability === "preorder";
      const supplierSellable = shouldAllowSupplierBackorder({
        availability: selectedSupply?.availability ?? "unavailable",
        fulfillmentMode:
          selectedSupply?.fulfillment_mode ?? "supplier_or_physical",
      });

      const updated = await patchVariantInventory(
        config,
        productId,
        variantId,
        Number(current.total_on_hand ?? 0),
        supplierSellable,
        preorder && supplierSellable,
        null,
      );

      if (supplierSellable && !updated.backorderable && !updated.purchasable) {
        throw new Error("Spree no dejó la variante backorderable/comprable");
      }

      const { error: updateError } = await supabase
        .from("devir_sync_catalog")
        .update({
          sellability_version: version,
          last_error: null,
          updated_at: new Date().toISOString(),
        })
        .eq("supplier_sku", sku);
      if (updateError) throw updateError;
      repaired += 1;
    } catch (err) {
      failed += 1;
      await supabase
        .from("devir_sync_catalog")
        .update({
          last_error:
            "SELLABILITY: " +
            (err instanceof Error ? err.message : String(err)),
          updated_at: new Date().toISOString(),
        })
        .eq("supplier_sku", sku);
    }
  };

  for (let index = 0; index < rows.length; index += 5) {
    await Promise.all(
      rows
        .slice(index, index + 5)
        .map((row) => processRow(row as Record<string, unknown>)),
    );
    await new Promise((resolve) => setTimeout(resolve, 150));
  }

  const { count, error: countError } = await supabase
    .from("devir_sync_catalog")
    .select("supplier_sku", { count: "exact", head: true })
    .in("catalog_state", ["published", "preorder", "published_mixed"])
    .or("sellability_version.is.null,sellability_version.neq." + version);
  if (countError) throw countError;

  return {
    processed: rows.length,
    repaired,
    failed,
    remaining: count ?? 0,
  };
}

async function repairTcgFactorySellabilityBatch(
  config: ConfigRow,
  offset: number,
  limit: number,
): Promise<Record<string, unknown>> {
  const { data, error, count } = await supabase
    .from("catalog_selected_supply")
    .select(
      "variant_id,spree_product_id,spree_variant_id,availability,supplier_code,fulfillment_mode",
      { count: "exact" },
    )
    .eq("supplier_code", TCGFACTORY_SUPPLIER_CODE)
    .in("availability", ["available", "preorder"])
    .not("spree_product_id", "is", null)
    .not("spree_variant_id", "is", null)
    .order("variant_id")
    .range(offset, offset + limit - 1);
  if (error) throw error;

  let repaired = 0;
  let failed = 0;
  const results: Array<Record<string, unknown>> = [];

  const processRow = async (row: Record<string, unknown>) => {
    const variantId = String(row.variant_id ?? "");
    const productId = String(row.spree_product_id ?? "");
    const spreeVariantId = String(row.spree_variant_id ?? "");
    try {
      const current = await spreeRequest<SpreeVariant>(
        config,
        "GET",
        "/products/" +
          encodeURIComponent(productId) +
          "/variants/" +
          encodeURIComponent(spreeVariantId),
      );
      const preorder = row.availability === "preorder";
      const supplierSellable = shouldAllowSupplierBackorder({
        availability:
          row.availability === "preorder" ? "preorder" : "available",
        fulfillmentMode:
          (row.fulfillment_mode as CatalogFulfillmentMode | null) ??
          "supplier_or_physical",
      });
      const updated = await patchVariantInventory(
        config,
        productId,
        spreeVariantId,
        Number(current.total_on_hand ?? 0),
        supplierSellable,
        preorder && supplierSellable,
        null,
      );
      if (supplierSellable && !updated.backorderable && !updated.purchasable) {
        throw new Error("Spree no dejó la variante comprable");
      }
      repaired += 1;
      results.push({ variant_id: variantId, ok: true });
    } catch (repairError) {
      failed += 1;
      results.push({
        variant_id: variantId,
        ok: false,
        error:
          repairError instanceof Error
            ? repairError.message
            : String(repairError),
      });
    }
  };

  const rows = (data ?? []) as Array<Record<string, unknown>>;
  for (let index = 0; index < rows.length; index += 5) {
    await Promise.all(rows.slice(index, index + 5).map(processRow));
    await new Promise((resolve) => setTimeout(resolve, 150));
  }

  const total = count ?? 0;
  return {
    processed: data?.length ?? 0,
    repaired,
    failed,
    total,
    offset,
    nextOffset:
      offset + (data?.length ?? 0) < total
        ? offset + (data?.length ?? 0)
        : null,
    results,
  };
}

function spreeMediaReference(media: Record<string, unknown>): string | null {
  for (const key of [
    "original_url",
    "download_url",
    "xlarge_url",
    "large_url",
    "medium_url",
    "small_url",
    "mini_url",
  ]) {
    const value = media[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function mediaFilename(value: string): string {
  try {
    return decodeURIComponent(new URL(value).pathname.split("/").pop() ?? "");
  } catch {
    return value;
  }
}

async function repairTcgFactoryImagesBatch(
  config: ConfigRow,
  offset: number,
  limit: number,
  dryRun = true,
): Promise<Record<string, unknown>> {
  const supplier = await tcgFactorySupplierRow();
  const { data, error, count } = await supabase
    .from("catalog_selected_supply")
    .select(
      "variant_id,spree_product_id,supplier_sku,source_url,supplier_code",
      { count: "exact" },
    )
    .eq("supplier_code", TCGFACTORY_SUPPLIER_CODE)
    .not("spree_product_id", "is", null)
    .not("source_url", "is", null)
    .order("variant_id")
    .range(offset, offset + limit - 1);
  if (error) throw error;

  const uniqueProducts = new Map<
    string,
    { productId: string; supplierSku: string; sourceUrl: string }
  >();
  for (const row of data ?? []) {
    const productId = String(row.spree_product_id ?? "");
    const sourceUrl = String(row.source_url ?? "");
    const supplierSku = String(row.supplier_sku ?? "");
    if (
      productId &&
      sourceUrl &&
      supplierSku &&
      !uniqueProducts.has(productId)
    ) {
      uniqueProducts.set(productId, { productId, supplierSku, sourceUrl });
    }
  }

  let inspected = 0;
  let productsWithInvalidMedia = 0;
  let deleted = 0;
  let uploaded = 0;
  let failed = 0;
  const results: Array<Record<string, unknown>> = [];

  for (const product of uniqueProducts.values()) {
    try {
      const media = await spreeList<Record<string, unknown>>(
        config,
        "/products/" + encodeURIComponent(product.productId) + "/media",
      );
      const { data: discovery, error: discoveryError } = await supabase
        .from("catalog_supplier_discovery")
        .select("id,image_urls,source_url")
        .eq("supplier_id", supplier.id)
        .eq("source_url", product.sourceUrl)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (discoveryError) throw discoveryError;

      const originalImageUrls = Array.isArray(discovery?.image_urls)
        ? discovery.image_urls.filter(
            (value): value is string => typeof value === "string",
          )
        : [];
      const supplierImportedFilenames = new Set(
        originalImageUrls.map(mediaFilename),
      );
      const filteredImageUrls = originalImageUrls.filter((value) =>
        isTcgFactoryProductImageReference(value, product.sourceUrl),
      );
      const invalid = media.filter((item) => {
        const reference = spreeMediaReference(item);
        if (
          typeof item.id !== "string" ||
          reference === null ||
          isTcgFactoryProductImageReference(reference, product.sourceUrl)
        ) {
          return false;
        }
        return (
          supplierImportedFilenames.has(mediaFilename(reference)) ||
          isTcgFactoryKnownPollutionMediaReference(reference)
        );
      });
      const valid = media.filter((item) => {
        const reference = spreeMediaReference(item);
        return (
          reference !== null &&
          isTcgFactoryProductImageReference(reference, product.sourceUrl)
        );
      });
      inspected += 1;
      if (invalid.length > 0) productsWithInvalidMedia += 1;

      const wouldLoseAllImages =
        invalid.length > 0 &&
        valid.length === 0 &&
        filteredImageUrls.length === 0;
      if (wouldLoseAllImages) {
        results.push({
          productId: product.productId,
          supplierSku: product.supplierSku,
          valid: 0,
          invalid: invalid.length,
          skipped: "no_safe_replacement_image",
          dryRun,
        });
        continue;
      }

      if (!dryRun) {
        for (const item of invalid) {
          await spreeRequest(
            config,
            "DELETE",
            "/products/" +
              encodeURIComponent(product.productId) +
              "/media/" +
              encodeURIComponent(String(item.id)),
          );
          deleted += 1;
        }

        if (discovery?.id) {
          const { error: updateDiscoveryError } = await supabase
            .from("catalog_supplier_discovery")
            .update({
              image_urls: filteredImageUrls,
              updated_at: new Date().toISOString(),
            })
            .eq("id", discovery.id);
          if (updateDiscoveryError) throw updateDiscoveryError;
        }

        const { data: offers, error: offersError } = await supabase
          .from("catalog_supplier_offers")
          .select("id,raw_payload")
          .eq("supplier_id", supplier.id)
          .eq("source_url", product.sourceUrl);
        if (offersError) throw offersError;
        for (const offer of offers ?? []) {
          const payload =
            offer.raw_payload && typeof offer.raw_payload === "object"
              ? (offer.raw_payload as Record<string, unknown>)
              : {};
          const { error: updateOfferError } = await supabase
            .from("catalog_supplier_offers")
            .update({
              raw_payload: {
                ...payload,
                imageUrls: filteredImageUrls,
              },
              updated_at: new Date().toISOString(),
            })
            .eq("id", offer.id);
          if (updateOfferError) throw updateOfferError;
        }

        if (valid.length === 0) {
          for (const [index, url] of filteredImageUrls.entries()) {
            await spreeRequest(
              config,
              "POST",
              "/products/" + encodeURIComponent(product.productId) + "/media",
              { url, position: index + 1 },
            );
            uploaded += 1;
          }
        }
      }

      results.push({
        productId: product.productId,
        supplierSku: product.supplierSku,
        valid: valid.length,
        invalid: invalid.length,
        invalidFiles: invalid
          .map(spreeMediaReference)
          .filter((value): value is string => Boolean(value))
          .map(mediaFilename)
          .slice(0, 20),
        cleanSourceImages: filteredImageUrls.length,
        dryRun,
      });
    } catch (repairError) {
      failed += 1;
      results.push({
        productId: product.productId,
        supplierSku: product.supplierSku,
        error:
          repairError instanceof Error
            ? repairError.message
            : String(repairError),
      });
    }
  }

  const total = count ?? 0;
  const consumed = data?.length ?? 0;
  return {
    dryRun,
    inspected,
    productsWithInvalidMedia,
    deleted,
    uploaded,
    failed,
    total,
    offset,
    nextOffset: offset + consumed < total ? offset + consumed : null,
    results,
  };
}

async function repairRetailUnitProducts(
  config: ConfigRow,
): Promise<Record<string, unknown>> {
  const { data, error } = await supabase
    .from("devir_sync_catalog")
    .select(
      "supplier_sku,source_url,name,snapshot,image_urls,spree_product_id,spree_variant_id,supplier_status,last_auto_price,group_key,group_name,variant_label,variant_position,grouping_confidence",
    )
    .or("name.ilike.%scene box%,name.ilike.%theme deck%")
    .order("supplier_sku");
  if (error) throw error;

  const supplier = await configuredCatalogSupplier("devir");
  const categories = await spreeCategories(config);
  const defs = await definitions(config);
  let repaired = 0;
  let skipped = 0;
  const results: Array<Record<string, unknown>> = [];

  for (const rawRow of data ?? []) {
    const row = rawRow as CatalogGroupRow;
    const snapshot =
      row.snapshot && typeof row.snapshot === "object"
        ? (row.snapshot as Json)
        : {};
    if (snapshot.retailUnitNormalized === true) {
      skipped += 1;
      continue;
    }
    const original = catalogRowProduct(row);
    if (requiresManualPackSplitReview(original)) {
      skipped += 1;
      continue;
    }
    const retail = normalizeDevirRetailUnit(original);
    if (retail.unitsPerSupplierPack === 1) {
      skipped += 1;
      continue;
    }
    const product: DevirProduct = {
      ...original,
      name: retail.name,
      purchasePrice: retail.purchasePrice,
      referencePriceNet: retail.referencePriceNet,
    };
    const item = normalizeSupplierItem(devirCatalogItem(product));
    const { data: offer, error: offerError } = await supabase
      .from("catalog_supplier_offers")
      .select("id,variant_id,raw_payload")
      .eq("supplier_id", supplier.id)
      .eq("external_variant_id", row.supplier_sku)
      .single();
    if (offerError) throw offerError;

    const now = new Date().toISOString();
    const { error: offerUpdateError } = await supabase
      .from("catalog_supplier_offers")
      .update({
        purchase_price: item.purchasePrice,
        normalized_cost: item.normalizedCost,
        reference_price_net: item.referencePriceNet ?? null,
        raw_payload: {
          ...(offer.raw_payload && typeof offer.raw_payload === "object"
            ? offer.raw_payload
            : {}),
          ...item,
          metadata: {
            ...item.metadata,
            retailUnitNormalized: true,
            supplierPackUnits: retail.unitsPerSupplierPack,
          },
        },
        updated_at: now,
      })
      .eq("id", offer.id);
    if (offerUpdateError) throw offerUpdateError;

    const currentResolution = await loadCatalogVariant(
      String(offer.variant_id),
    );
    const { error: productUpdateError } = await supabase
      .from("catalog_products")
      .update({
        name: item.productName,
        category_key:
          item.categoryKey ?? currentResolution.product.category_key,
        updated_at: now,
      })
      .eq("id", currentResolution.product.id);
    if (productUpdateError) throw productUpdateError;
    const resolution = await loadCatalogVariant(String(offer.variant_id));
    const synced = await reconcileCatalogVariant(
      config,
      resolution,
      categories,
      defs,
    );
    const { error: catalogError } = await supabase
      .from("devir_sync_catalog")
      .update({
        name: product.name,
        snapshot: {
          ...snapshot,
          ...product,
          retailUnitNormalized: true,
          supplierPackUnits: retail.unitsPerSupplierPack,
        },
        last_auto_price: synced.lastAutoPrice,
        last_error: null,
        title_cleanup_version: null,
        catalog_version: null,
        updated_at: new Date().toISOString(),
      })
      .eq("supplier_sku", row.supplier_sku);
    if (catalogError) throw catalogError;
    repaired += 1;
    results.push({
      sku: row.supplier_sku,
      name: product.name,
      units: retail.unitsPerSupplierPack,
      price: synced.lastAutoPrice,
      ok: true,
    });
  }

  return { processed: data?.length ?? 0, repaired, skipped, results };
}

const HUMAN_REVIEW_MARKER_VERSION = "catalog-review-v1";

async function adoptPublishedCatalogReview(
  config: ConfigRow,
  product: SpreeProduct,
  currentReasons: Iterable<string> = [],
): Promise<Pick<CatalogProductRow, "review_decision" | "approved_review_fingerprint"> | null> {
  const { data: policy, error } = await supabase.from("catalog_products")
    .select("id,review_decision,approved_review_fingerprint,updated_at")
    .eq("spree_product_id", product.id).maybeSingle();
  if (error) throw error;
  if (!policy) return null;
  if (policy.review_decision === "rejected" || product.status !== "active" || !(product.tags ?? []).some(tag =>
    ["catalog-review", "devir-review", "REVISION-HUMANA", "NECESITA-TU-AYUDA"].includes(tag))) return policy;
  const fields = await productFields(config, product.id);
  const recorded = String(fields.find(field => field.key === "catalog.review_pending_fingerprint")?.value ?? "");
  // Legacy products already have the human-readable reasons displayed in Spree.
  // Only adopt reasons actually displayed there, never newly discovered issues.
  const displayed = String(fields.find(field => field.key === "catalog.review_reason")?.value ?? "");
  const legacy = Array.from(currentReasons).filter(reason => displayed.includes(humanizeReviewReason(reason)));
  const pending = recorded && recorded !== "none" ? recorded.split("|") : legacy;
  if (!pending.length) return policy;
  const fingerprint = catalogReviewFingerprint([
    ...String(policy.approved_review_fingerprint ?? "").split("|"), ...pending,
  ]);
  if (policy.review_decision === "approved" && policy.approved_review_fingerprint === fingerprint) return policy;
  const { data: approved, error: approvalError } = await supabase.from("catalog_products")
    .update({ review_decision: "approved", approved_review_fingerprint: fingerprint,
      review_decided_at: new Date().toISOString(), review_note: "Aprobación detectada al publicar en Spree",
      updated_at: new Date().toISOString() })
    .eq("id", policy.id).eq("review_decision", policy.review_decision)
    .eq("updated_at", policy.updated_at).select("*").maybeSingle();
  if (approvalError) throw approvalError;
  if (!approved) throw new Error("La revisión cambió durante la aprobación; reintentar");
  return approved as CatalogProductRow;
}

function reviewReasonsFromLastError(value: unknown): string[] {
  const text = String(value ?? "")
    .replace(/^REVIEW:\s*/i, "")
    .trim();
  if (!text) return [];
  return text
    .split(", ")
    .map((item) => item.trim())
    .filter(Boolean);
}

async function currentCatalogReviewReasonsForSpreeProduct(
  spreeProductId: string,
): Promise<Set<string>> {
  const { data, error } = await supabase
    .from("devir_sync_catalog")
    .select(
      "supplier_sku,source_url,name,snapshot,image_urls,spree_product_id,spree_variant_id,supplier_status,item_kind,grouping_confidence,last_error,catalog_state",
    )
    .eq("spree_product_id", spreeProductId)
    .order("supplier_sku");
  if (error) throw error;

  const reasons = new Set<string>();
  for (const row of (data ?? []) as CatalogAuditRow[]) {
    const product = productFromCatalogRow(row);
    const grouping = groupingInfo(product);
    if (
      row.catalog_state === "review" ||
      /^REVIEW:/i.test(String(row.last_error ?? ""))
    ) {
      for (const reason of reviewReasonsFromLastError(row.last_error)) {
        if (
          reason === "grouping_requires_operator_review" &&
          grouping.confidence !== "ambiguous"
        ) {
          continue;
        }
        reasons.add(reason);
      }
    }

    if (!product.imageUrls.length) reasons.add("product_image_missing");
    if (isPack(product)) reasons.add("pack_requires_operator_split");
    if (isCatalanCatalogProduct(product)) {
      reasons.add("catalan_requires_operator_review");
    }
    if (grouping.confidence === "ambiguous") {
      reasons.add("grouping_requires_operator_review");
    }
  }

  return reasons;
}

async function markCatalogProductDirty(spreeProductId: string): Promise<void> {
  const { error } = await supabase
    .from("devir_sync_catalog")
    .update({
      catalog_version: null,
      catalog_prepared_at: null,
      review_marker_version: null,
      updated_at: new Date().toISOString(),
    })
    .eq("spree_product_id", spreeProductId);
  if (error) throw error;
}

async function refreshHumanReviewMarkersBatch(
  config: ConfigRow,
  limit = 5,
): Promise<{ processed: number; remaining: number }> {
  const { data, error, count } = await supabase
    .from("devir_sync_catalog")
    .select("spree_product_id,last_error,review_marker_version,updated_at", {
      count: "exact",
    })
    .eq("catalog_state", "review")
    .not("spree_product_id", "is", null)
    .or(
      "review_marker_version.is.null,review_marker_version.neq." +
        HUMAN_REVIEW_MARKER_VERSION,
    )
    .order("updated_at")
    .limit(limit * 10);
  if (error) throw error;

  const productIds: string[] = [];
  for (const row of data ?? []) {
    const productId = String(row.spree_product_id ?? "");
    if (!productId || productIds.includes(productId)) continue;
    if (productIds.length >= limit) continue;
    productIds.push(productId);
  }

  if (productIds.length === 0) return { processed: 0, remaining: 0 };

  const defs = await definitions(config);
  let processed = 0;
  for (const productId of productIds) {
    const reasons = await currentCatalogReviewReasonsForSpreeProduct(productId);
    if (reasons.size === 0) {
      await markCatalogProductDirty(productId);
      await preparePublishBatch(config, 0, 1, productId);
      const { error: markerError } = await supabase
        .from("devir_sync_catalog")
        .update({
          review_marker_version: HUMAN_REVIEW_MARKER_VERSION,
          updated_at: new Date().toISOString(),
        })
        .eq("spree_product_id", productId);
      if (markerError) throw markerError;
      processed += 1;
      continue;
    }
    const product = await spreeRequest<SpreeProduct>(
      config,
      "GET",
      "/products/" + encodeURIComponent(productId),
    );
    const adopted = await adoptPublishedCatalogReview(config, product, reasons);
    if (adopted && !shouldRequireCatalogReview({ reasons, decision: adopted.review_decision,
      approvedFingerprint: adopted.approved_review_fingerprint })) {
      const { error: markerError } = await supabase.from("devir_sync_catalog")
        .update({ review_marker_version: HUMAN_REVIEW_MARKER_VERSION, updated_at: new Date().toISOString() })
        .eq("spree_product_id", productId).eq("catalog_state", "review");
      if (markerError) throw markerError;
      processed += 1;
      continue;
    }
    const tags = Array.from(
      new Set([
        ...(product.tags ?? []).filter(
          (tag) =>
            !["catalog-ready", "devir-ready", "devir-published"].includes(tag),
        ),
        "catalog-review",
        "REVISION-HUMANA",
        "NECESITA-TU-AYUDA",
      ]),
    );
    const drafted = await spreeRequest<SpreeProduct>(
      config,
      "PATCH",
      "/products/" + encodeURIComponent(productId),
      { status: "draft", tags },
    );
    if (drafted.status !== "draft") throw new Error("Spree no confirmó el borrador de revisión");
    await upsertProductFields(config, productId, defs, {
      "catalog.review_status": "⚠ NECESITA TU AYUDA",
      "catalog.review_pending_fingerprint": catalogReviewFingerprint(reasons),
      "catalog.review_reason": humanizeReviewReasons(reasons),
      "devir.review_status": "⚠ REVISIÓN HUMANA",
      "devir.review_reasons": humanizeReviewReasons(reasons),
      "devir.last_sync_at": new Date().toISOString(),
    });
    const { error: markerError } = await supabase
      .from("devir_sync_catalog")
      .update({
        review_marker_version: HUMAN_REVIEW_MARKER_VERSION,
        updated_at: new Date().toISOString(),
      })
      .eq("spree_product_id", productId)
      .eq("catalog_state", "review");
    if (markerError) throw markerError;
    processed += 1;
  }

  return {
    processed,
    remaining: Math.max(0, (count ?? 0) - processed),
  };
}

async function hideCatalogPolicyViolations(
  config: ConfigRow,
): Promise<Record<string, unknown>> {
  const { data, error } = await supabase
    .from("devir_sync_catalog")
    .select(
      "supplier_sku,source_url,name,snapshot,image_urls,spree_product_id,spree_variant_id,supplier_status,item_kind,grouping_confidence,last_error,catalog_state",
    )
    .in("catalog_state", ["published", "preorder", "published_mixed"])
    .not("spree_product_id", "is", null);
  if (error) throw error;

  const violations = new Map<string, Set<string>>();
  for (const row of (data ?? []) as CatalogAuditRow[]) {
    const product = productFromCatalogRow(row);
    const productId = String(row.spree_product_id ?? "");
    const reasons = violations.get(productId) ?? new Set<string>();
    if (isCatalanCatalogProduct(product)) {
      reasons.add("catalan_requires_operator_review");
    }
    if (isPack(product)) reasons.add("pack_requires_operator_split");
    if (reasons.size) violations.set(productId, reasons);
  }

  const { data: catalanProducts, error: catalanProductsError } = await supabase
    .from("catalog_products")
    .select("name,spree_product_id")
    .not("spree_product_id", "is", null)
    .ilike("name", "%catal%");
  if (catalanProductsError) throw catalanProductsError;
  for (const product of catalanProducts ?? []) {
    if (!isCatalanCatalogProduct({ name: String(product.name ?? "") })) {
      continue;
    }
    const productId = String(product.spree_product_id ?? "");
    const reasons = violations.get(productId) ?? new Set<string>();
    reasons.add("catalan_requires_operator_review");
    violations.set(productId, reasons);
  }

  const defs = await definitions(config);
  const channels = await spreeList<SpreeChannel>(config, "/channels");
  const channel =
    channels.find((item) => item.active && item.default) ??
    channels.find((item) => item.active) ??
    channels[0];
  const hidden: Array<Record<string, unknown>> = [];
  for (const [productId, reasons] of violations) {
    const { data: reviewPolicy, error: reviewPolicyError } = await supabase
      .from("catalog_products")
      .select("review_decision,approved_review_fingerprint")
      .eq("spree_product_id", productId)
      .maybeSingle();
    if (reviewPolicyError) throw reviewPolicyError;
    if (
      reviewPolicy &&
      !shouldRequireCatalogReview({
        reasons,
        decision:
          (reviewPolicy.review_decision as CatalogReviewDecision | null) ??
          "pending",
        approvedFingerprint:
          typeof reviewPolicy.approved_review_fingerprint === "string"
            ? reviewPolicy.approved_review_fingerprint
            : null,
      })
    ) {
      continue;
    }

    const product = await spreeRequest<SpreeProduct>(
      config,
      "GET",
      "/products/" + encodeURIComponent(productId),
    );
    const adopted = await adoptPublishedCatalogReview(config, product, reasons);
    if (adopted && !shouldRequireCatalogReview({ reasons, decision: adopted.review_decision,
      approvedFingerprint: adopted.approved_review_fingerprint })) continue;
    const tags = Array.from(
      new Set([
        ...(product.tags ?? []).filter(
          (tag) =>
            ![
              "devir-ready",
              "devir-published",
              "devir-preorder",
              "devir-buy-now",
            ].includes(tag),
        ),
        "devir-review",
        "REVISION-HUMANA",
        "NECESITA-TU-AYUDA",
      ]),
    );
    const drafted = await spreeRequest<SpreeProduct>(
      config,
      "PATCH",
      "/products/" + encodeURIComponent(productId),
      { status: "draft", tags },
    );
    if (drafted.status !== "draft") throw new Error("Spree no confirmó el borrador de revisión");
    if (channel) {
      try {
        await spreeRequest(
          config,
          "POST",
          "/channels/" + encodeURIComponent(channel.id) + "/remove_products",
          { product_ids: [productId] },
        );
      } catch {
        // Draft status is the primary visibility control.
      }
    }
    const reason = Array.from(reasons).join(", ");
    await upsertProductFields(config, productId, defs, {
      "catalog.review_status": "⚠ NECESITA TU AYUDA",
      "catalog.review_pending_fingerprint": catalogReviewFingerprint(reasons),
      "catalog.review_reason": humanizeReviewReasons(reasons),
      "devir.review_status": "⚠ REVISIÓN HUMANA",
      "devir.review_reasons": humanizeReviewReasons(reasons),
      "devir.last_sync_at": new Date().toISOString(),
    });
    await supabase
      .from("devir_sync_catalog")
      .update({
        catalog_state: "review",
        last_error: "REVIEW: " + reason,
        updated_at: new Date().toISOString(),
      })
      .eq("spree_product_id", productId);
    hidden.push({ product_id: productId, name: product.name, reason });
  }
  return { hidden: hidden.length, products: hidden };
}

async function cleanCatalogTitlesBatch(
  config: ConfigRow,
  limit: number,
): Promise<{
  processed_products: number;
  titles_changed: number;
  categories_changed: number;
  remaining_products: number;
}> {
  const version = "devir-title-v3";
  const categories = await spreeCategories(config);
  const { data, error } = await supabase
    .from("devir_sync_catalog")
    .select(
      "supplier_sku,name,snapshot,source_url,spree_product_id,title_cleanup_version",
    )
    .not("spree_product_id", "is", null)
    .or("title_cleanup_version.is.null,title_cleanup_version.neq." + version)
    .order("spree_product_id")
    .order("supplier_sku");
  if (error) throw error;

  const groups = new Map<string, Array<Record<string, unknown>>>();
  for (const raw of data ?? []) {
    const row = raw as Record<string, unknown>;
    const productId = String(row.spree_product_id ?? "");
    if (!productId) continue;
    const list = groups.get(productId) ?? [];
    list.push(row);
    groups.set(productId, list);
  }

  const selected = Array.from(groups.entries()).slice(0, limit);
  let titlesChanged = 0;
  let categoriesChanged = 0;

  const processProduct = async (
    productId: string,
    rows: Array<Record<string, unknown>>,
  ) => {
    const keys = new Set<string>();
    let singleCleanName: string | null = null;

    for (const row of rows) {
      const rawName = String(row.name ?? "");
      const cleanName = cleanDevirTitle(rawName);
      const snapshot =
        row.snapshot && typeof row.snapshot === "object"
          ? (row.snapshot as Json)
          : {};
      const product: DevirProduct = {
        sku: String(row.supplier_sku ?? ""),
        name: cleanName,
        url: String(row.source_url ?? ""),
        purchasePrice: Number.isFinite(Number(snapshot.purchasePrice))
          ? Number(snapshot.purchasePrice)
          : null,
        referencePriceNet: Number.isFinite(Number(snapshot.referencePriceNet))
          ? Number(snapshot.referencePriceNet)
          : null,
        availability:
          snapshot.availability === "available" ||
          snapshot.availability === "preorder" ||
          snapshot.availability === "unavailable"
            ? snapshot.availability
            : "unknown",
        availabilityLabel:
          typeof snapshot.availabilityLabel === "string"
            ? snapshot.availabilityLabel
            : null,
        releaseDate:
          typeof snapshot.releaseDate === "string"
            ? snapshot.releaseDate
            : null,
        imageUrls: Array.isArray(snapshot.imageUrls)
          ? snapshot.imageUrls.filter(
              (item): item is string => typeof item === "string",
            )
          : [],
      };
      keys.add(categoryKey(product));

      const nextSnapshot = { ...snapshot, name: cleanName };
      await supabase
        .from("devir_sync_catalog")
        .update({
          name: cleanName,
          snapshot: nextSnapshot,
          title_cleanup_version: version,
          updated_at: new Date().toISOString(),
        })
        .eq("supplier_sku", product.sku);

      if (cleanName !== rawName) titlesChanged += 1;
      if (rows.length === 1) singleCleanName = cleanName;
    }

    const categoryKeyValue = keys.size === 1 ? Array.from(keys)[0] : null;
    const category = categoryKeyValue
      ? categoryForKey(categories, categoryKeyValue)
      : null;

    const patch: Record<string, unknown> = {};
    if (singleCleanName) patch.name = singleCleanName;
    if (category) {
      patch.category_ids = [category.id];
      categoriesChanged += 1;
    }
    if (Object.keys(patch).length) {
      await spreeRequest(
        config,
        "PATCH",
        "/products/" + encodeURIComponent(productId),
        patch,
      );
    }
  };

  for (let index = 0; index < selected.length; index += 5) {
    await Promise.all(
      selected
        .slice(index, index + 5)
        .map(([productId, rows]) => processProduct(productId, rows)),
    );
    await new Promise((resolve) => setTimeout(resolve, 120));
  }

  const { data: remainingRows, error: remainingError } = await supabase
    .from("devir_sync_catalog")
    .select("spree_product_id")
    .not("spree_product_id", "is", null)
    .or("title_cleanup_version.is.null,title_cleanup_version.neq." + version);
  if (remainingError) throw remainingError;

  return {
    processed_products: selected.length,
    titles_changed: titlesChanged,
    categories_changed: categoriesChanged,
    remaining_products: new Set(
      (remainingRows ?? [])
        .map((row) => String(row.spree_product_id ?? ""))
        .filter(Boolean),
    ).size,
  };
}

interface SpecialPricingProgram {
  code: string;
  name: string;
  target_margin: number | string;
  active: boolean;
  requires_approval: boolean;
  exclude_fixed_price_books: boolean;
  spree_price_list_id: string | null;
}

interface SpreePriceList {
  id: string;
  name: string;
  status?: string;
}

function specialProgramPrice(
  cost: number,
  targetMargin: number,
  sku: string,
): number {
  const vatRate = vatRateForSku(sku);
  return (
    Math.ceil(paymentAwareFloor(cost, vatRate, targetMargin) * 100 - 1e-9) / 100
  );
}

function isFixedPriceBookSku(sku: string): boolean {
  return isBookSku(sku);
}

async function getSpecialProgram(code: string): Promise<SpecialPricingProgram> {
  const { data, error } = await supabase
    .from("special_pricing_programs")
    .select("*")
    .eq("code", code.toUpperCase())
    .single();
  if (error) throw error;
  return data as SpecialPricingProgram;
}

async function ensureSpecialPriceList(
  config: ConfigRow,
  program: SpecialPricingProgram,
): Promise<SpreePriceList> {
  if (program.spree_price_list_id) {
    try {
      return await spreeRequest<SpreePriceList>(
        config,
        "GET",
        "/price_lists/" + encodeURIComponent(program.spree_price_list_id),
      );
    } catch {
      // Recreate if the stored list was removed manually.
    }
  }

  const created = await spreeRequest<SpreePriceList>(
    config,
    "POST",
    "/price_lists",
    {
      name: program.code + " · " + program.name,
      description:
        "Precio por cuenta aprobada. Margen objetivo configurable; no altera el PVP público.",
      match_policy: "all",
    },
  );

  const { error } = await supabase
    .from("special_pricing_programs")
    .update({
      spree_price_list_id: created.id,
      updated_at: new Date().toISOString(),
    })
    .eq("code", program.code);
  if (error) throw error;

  program.spree_price_list_id = created.id;
  return created;
}

async function approvedSpecialCustomerIds(
  programCode: string,
): Promise<string[]> {
  const { data, error } = await supabase
    .from("special_pricing_requests")
    .select("spree_customer_id")
    .eq("program_code", programCode)
    .eq("status", "approved");
  if (error) throw error;
  return Array.from(
    new Set(
      (data ?? []).map((row) => String(row.spree_customer_id)).filter(Boolean),
    ),
  );
}

async function syncSpecialPriceListRules(
  config: ConfigRow,
  program: SpecialPricingProgram,
  priceList: SpreePriceList,
): Promise<number> {
  const customerIds = await approvedSpecialCustomerIds(program.code);

  await spreeRequest(
    config,
    "PATCH",
    "/price_lists/" + encodeURIComponent(priceList.id),
    {
      rules: customerIds.length
        ? [
            {
              type: "user_rule",
              preferences: { user_ids: customerIds },
            },
          ]
        : [],
    },
  );

  if (customerIds.length && program.active) {
    await spreeRequest(
      config,
      "PATCH",
      "/price_lists/" + encodeURIComponent(priceList.id) + "/activate",
    );
  } else {
    try {
      await spreeRequest(
        config,
        "PATCH",
        "/price_lists/" + encodeURIComponent(priceList.id) + "/deactivate",
      );
    } catch {
      // A fresh draft list is already inactive.
    }
  }

  return customerIds.length;
}

async function syncSpecialPriceRows(
  config: ConfigRow,
  program: SpecialPricingProgram,
  priceList: SpreePriceList,
): Promise<number> {
  const targetMargin = Number(program.target_margin);
  if (
    !Number.isFinite(targetMargin) ||
    targetMargin < 0 ||
    targetMargin >= 0.95
  ) {
    throw new Error("Margen especial inválido");
  }

  const data: Array<Record<string, unknown>> = [];
  // PostgREST caps unpaginated results; a successful first page is not a
  // complete price synchronization. Read all pages before writing prices.
  for (let offset = 0; ; offset += 500) {
    const { data: page, error } = await supabase
      .from("catalog_selected_supply")
      .select("variant_id,canonical_sku,spree_variant_id,normalized_cost,supplier_code")
      .not("spree_variant_id", "is", null)
      .not("supplier_code", "is", null)
      .order("variant_id")
      .range(offset, offset + 499);
    if (error) throw error;
    const batch = page ?? [];
    data.push(...batch);
    if (batch.length < 500) break;
  }

  // BISON3 is a discount overlay, never an alternative tariff that can make
  // a product more expensive than its normal automatic storefront price.
  // If the base price is unknown we leave the variant untouched so Spree
  // falls back to its regular price instead of risking an upward override.
  const catalogVariantIds = Array.from(
    new Set(
      (data ?? [])
        .map((row) => String(row.variant_id ?? ""))
        .filter(Boolean),
    ),
  );
  const publicPriceByCatalogVariant = new Map<string, number>();
  for (let index = 0; index < catalogVariantIds.length; index += 200) {
    const { data: variants, error: variantsError } = await supabase
      .from("catalog_variants")
      .select("id,last_auto_price")
      .in("id", catalogVariantIds.slice(index, index + 200));
    if (variantsError) throw variantsError;

    for (const variant of variants ?? []) {
      const publicPrice = Number(variant.last_auto_price);
      if (Number.isFinite(publicPrice) && publicPrice > 0) {
        publicPriceByCatalogVariant.set(String(variant.id), publicPrice);
      }
    }
  }

  const rows = [];
  const seenVariants = new Set<string>();
  for (const row of data ?? []) {
    const catalogVariantId = String(row.variant_id ?? "");
    const sku = String(row.canonical_sku ?? "");
    const variantId = String(row.spree_variant_id ?? "");
    if (
      !catalogVariantId ||
      !sku ||
      !variantId ||
      seenVariants.has(variantId)
    ) {
      continue;
    }
    if (program.exclude_fixed_price_books && isFixedPriceBookSku(sku)) continue;
    const cost = Number(row.normalized_cost);
    const publicPrice = publicPriceByCatalogVariant.get(catalogVariantId);
    if (
      !Number.isFinite(cost) ||
      cost <= 0 ||
      !Number.isFinite(publicPrice) ||
      Number(publicPrice) <= 0
    ) {
      continue;
    }

    const calculatedSpecialPrice = specialProgramPrice(
      cost,
      targetMargin,
      sku,
    );
    const amount =
      Math.round(
        Math.min(calculatedSpecialPrice, Number(publicPrice)) * 100,
      ) / 100;

    seenVariants.add(variantId);
    rows.push({
      variant_id: variantId,
      currency: "EUR",
      price_list_id: priceList.id,
      amount,
    });
  }

  for (let index = 0; index < rows.length; index += 100) {
    await spreeRequest(config, "POST", "/prices/bulk_upsert", {
      prices: rows.slice(index, index + 100),
    });
  }

  const { error: updateError } = await supabase
    .from("special_pricing_programs")
    .update({
      last_prices_synced_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("code", program.code);
  if (updateError) throw updateError;

  return rows.length;
}

async function syncSpecialPricingProgram(
  config: ConfigRow,
  code: string,
  syncPrices = true,
): Promise<{
  code: string;
  price_list_id: string;
  target_margin: number;
  price_rows?: number;
  approved_customers: number;
}> {
  const program = await getSpecialProgram(code);
  const priceList = await ensureSpecialPriceList(config, program);
  const priceRows = syncPrices
    ? await syncSpecialPriceRows(config, program, priceList)
    : undefined;
  const approvedCustomers = await syncSpecialPriceListRules(
    config,
    program,
    priceList,
  );

  return {
    code: program.code,
    price_list_id: priceList.id,
    target_margin: Number(program.target_margin),
    ...(priceRows === undefined ? {} : { price_rows: priceRows }),
    approved_customers: approvedCustomers,
  };
}

interface DailyOfferStateRow {
  id: string;
  day_key: string | null;
  spree_price_list_id: string | null;
  special: boolean;
  active_products: Array<{
    productId: string;
    hadSale: boolean;
    hadFeatured: boolean;
  }> | null;
  last_rotated_at: string | null;
  last_error: string | null;
}

async function dailyOfferState(): Promise<DailyOfferStateRow | null> {
  const { data, error } = await supabase
    .from("catalog_daily_offer_state")
    .select(
      "id,day_key,spree_price_list_id,special,active_products,last_rotated_at,last_error",
    )
    .eq("id", "primary")
    .maybeSingle();
  if (error) throw error;
  return data as DailyOfferStateRow | null;
}

async function restoreDailyOfferTags(
  config: ConfigRow,
  state: DailyOfferStateRow | null,
): Promise<void> {
  for (const item of state?.active_products ?? []) {
    try {
      const product = await spreeRequest<SpreeProduct>(
        config,
        "GET",
        "/products/" + encodeURIComponent(item.productId),
      );
      let tags = (product.tags ?? []).filter(
        (tag) =>
          tag !== "daily-offer" &&
          tag !== "saturday-special" &&
          !tag.startsWith("offer-date:") &&
          !tag.startsWith("offer-profile:"),
      );
      if (!item.hadSale) tags = tags.filter((tag) => tag !== "sale");
      if (!item.hadFeatured) tags = tags.filter((tag) => tag !== "featured");
      if (item.hadSale && !tags.includes("sale")) tags.push("sale");
      if (item.hadFeatured && !tags.includes("featured")) tags.push("featured");
      await spreeRequest(
        config,
        "PATCH",
        "/products/" + encodeURIComponent(item.productId),
        { tags: Array.from(new Set(tags)) },
      );
    } catch (error) {
      console.error("No se pudieron restaurar tags de oferta", {
        productId: item.productId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

async function loadDailyOfferSupplyRows(): Promise<Array<Record<string, unknown>>> {
  const rows: Array<Record<string, unknown>> = [];
  for (let offset = 0; offset < 5000; offset += 500) {
    const { data, error } = await supabase
      .from("catalog_selected_supply")
      .select(
        "variant_id,canonical_sku,spree_variant_id,product_id,product_name,spree_product_id,supplier_code,normalized_cost,reference_price_net,availability,source_url",
      )
      .eq("availability", "available")
      .not("spree_variant_id", "is", null)
      .not("spree_product_id", "is", null)
      .not("supplier_code", "is", null)
      .order("variant_id")
      .range(offset, offset + 499);
    if (error) throw error;
    const batch = (data ?? []) as Array<Record<string, unknown>>;
    rows.push(...batch);
    if (batch.length < 500) break;
  }
  return rows;
}

async function acquireDailyOfferRotationLock(): Promise<string | null> {
  const token = crypto.randomUUID();
  const now = new Date();
  const lockUntil = new Date(now.getTime() + 120_000).toISOString();
  const { data, error } = await supabase
    .from("catalog_daily_offer_state")
    .update({
      rotation_lock_until: lockUntil,
      rotation_token: token,
      updated_at: now.toISOString(),
    })
    .eq("id", "primary")
    .or(
      "rotation_lock_until.is.null,rotation_lock_until.lt." +
        now.toISOString(),
    )
    .select("rotation_token")
    .maybeSingle();
  if (error) throw error;
  return data?.rotation_token === token ? token : null;
}

async function releaseDailyOfferRotationLock(token: string): Promise<void> {
  const { error } = await supabase
    .from("catalog_daily_offer_state")
    .update({
      rotation_lock_until: null,
      rotation_token: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", "primary")
    .eq("rotation_token", token);
  if (error) {
    console.error("No se pudo liberar el lock de ofertas diarias", error);
  }
}

async function rotateDailyOffersUnlocked(
  config: ConfigRow,
  force = false,
): Promise<Record<string, unknown>> {
  const calendar = madridCommercialDay();
  const currentState = await dailyOfferState();
  if (!force && currentState?.day_key === calendar.dayKey) {
    return {
      status: "current",
      dayKey: calendar.dayKey,
      saturday: calendar.saturday,
      priceListId: currentState.spree_price_list_id,
      products: currentState.active_products?.length ?? 0,
    };
  }

  const supplyRows = await loadDailyOfferSupplyRows();
  const variantIds = Array.from(
    new Set(supplyRows.map((row) => String(row.variant_id ?? "")).filter(Boolean)),
  );
  const productIds = Array.from(
    new Set(supplyRows.map((row) => String(row.product_id ?? "")).filter(Boolean)),
  );

  const variantRows: Array<Record<string, unknown>> = [];
  for (let index = 0; index < variantIds.length; index += 200) {
    const { data, error } = await supabase
      .from("catalog_variants")
      .select("id,last_auto_price")
      .in("id", variantIds.slice(index, index + 200));
    if (error) throw error;
    variantRows.push(...((data ?? []) as Array<Record<string, unknown>>));
  }
  const productRows: Array<Record<string, unknown>> = [];
  for (let index = 0; index < productIds.length; index += 200) {
    const { data, error } = await supabase
      .from("catalog_products")
      .select("id,name,category_key")
      .in("id", productIds.slice(index, index + 200));
    if (error) throw error;
    productRows.push(...((data ?? []) as Array<Record<string, unknown>>));
  }

  const variantsById = new Map(
    variantRows.map((row) => [String(row.id), row]),
  );
  const productsById = new Map(
    productRows.map((row) => [String(row.id), row]),
  );

  const physicalStockByVariant = new Map<string, number>();
  const stockItems = await spreeListAll<SpreeStockItem>(config, "/stock_items");
  for (const item of stockItems) {
    const variantId = String(item.variant_id ?? "");
    const countOnHand = Number(item.count_on_hand ?? 0);
    if (!variantId || !Number.isFinite(countOnHand) || countOnHand <= 0) continue;
    physicalStockByVariant.set(
      variantId,
      (physicalStockByVariant.get(variantId) ?? 0) + countOnHand,
    );
  }

  const ranked = supplyRows
    .flatMap((row) => {
      const variant = variantsById.get(String(row.variant_id ?? ""));
      const productRow = productsById.get(String(row.product_id ?? ""));
      if (!variant || !productRow) return [];
      const lastAutoPrice = Number(variant.last_auto_price);
      const cost = Number(row.normalized_cost);
      if (
        !Number.isFinite(lastAutoPrice) ||
        lastAutoPrice <= 0 ||
        !Number.isFinite(cost) ||
        cost <= 0
      ) {
        return [];
      }
      const name = String(row.product_name ?? productRow.name ?? "");
      const storedKey = String(productRow.category_key ?? "").trim();
      const key =
        storedKey ||
        inferDevirCategoryKey({
          name,
          url: String(row.source_url ?? ""),
        });
      const profile = commercialPricingProfile({
        name,
        categoryKey: key,
        unitCostNet: cost,
      });
      if (!profile.offerEligible || isBookSku(String(row.canonical_sku ?? ""))) {
        return [];
      }
      const spreeVariantId = String(row.spree_variant_id ?? "");
      const stockOnHand = physicalStockByVariant.get(spreeVariantId) ?? 0;
      return [
        {
          row,
          key,
          profile,
          lastAutoPrice,
          stockOnHand,
          physicalStock: stockOnHand > 0,
          score: deterministicOfferScore(
            calendar.dayKey,
            String(row.variant_id ?? ""),
          ),
        },
      ];
    })
    .sort(
      (left, right) =>
        Number(right.physicalStock) - Number(left.physicalStock) ||
        left.score - right.score,
    );

  const targetCount = calendar.saturday ? 16 : 8;
  const perProfileCap = calendar.saturday ? 4 : 2;
  const selected: Array<{
    variantId: string;
    spreeVariantId: string;
    productId: string;
    sku: string;
    amount: number;
    compareAtAmount: number;
    profile: string;
    discount: number;
    physicalStock: boolean;
    stockOnHand: number;
    hadSale: boolean;
    hadFeatured: boolean;
  }> = [];
  const profileCounts = new Map<string, number>();
  const seenProducts = new Set<string>();

  for (const candidate of ranked.slice(0, 120)) {
    if (selected.length >= targetCount) break;
    const row = candidate.row;
    const productId = String(row.spree_product_id ?? "");
    const spreeVariantId = String(row.spree_variant_id ?? "");
    if (!productId || !spreeVariantId || seenProducts.has(productId)) continue;
    const used = profileCounts.get(candidate.profile.code) ?? 0;
    if (used >= perProfileCap) continue;

    try {
      const [spreeProduct, spreeVariant, selectedSupply] = await Promise.all([
        spreeRequest<SpreeProduct>(
          config,
          "GET",
          "/products/" + encodeURIComponent(productId),
        ),
        spreeRequest<SpreeVariant>(
          config,
          "GET",
          "/products/" +
            encodeURIComponent(productId) +
            "/variants/" +
            encodeURIComponent(spreeVariantId),
        ),
        selectedSupplyForSpreeVariant(spreeVariantId),
      ]);
      if (
        spreeProduct.status !== "active" ||
        (spreeProduct.tags ?? []).some((tag) =>
          ["REVISION-HUMANA", "NECESITA-TU-AYUDA", "catalog-review"].includes(tag),
        )
      ) {
        continue;
      }
      const currentPrice = variantPrice(spreeVariant);
      if (
        currentPrice === null ||
        Math.abs(currentPrice - candidate.lastAutoPrice) >= 0.005 ||
        !selectedSupply?.supplier_code
      ) {
        // A base price that differs from last_auto_price is an operator override.
        continue;
      }

      const purchasePrice = Number(selectedSupply.normalized_cost);
      if (!Number.isFinite(purchasePrice) || purchasePrice <= 0) continue;
      const referencePriceNet = Number(selectedSupply.reference_price_net);
      const product: DevirProduct = {
        sku: selectedSupply.canonical_sku || String(row.canonical_sku ?? ""),
        name: selectedSupply.product_name || String(row.product_name ?? ""),
        url: selectedSupply.source_url ?? String(row.source_url ?? ""),
        purchasePrice,
        referencePriceNet:
          Number.isFinite(referencePriceNet) && referencePriceNet > 0
            ? referencePriceNet
            : null,
        availability: selectedSupply.availability ?? "available",
        availabilityLabel: null,
        releaseDate: null,
        imageUrls: [],
        categoryKeyOverride: candidate.key,
        supplierMinimumQuantity: selectedSupply.minimum_order_quantity ?? null,
      };
      if (isBookProduct(product, candidate.key)) continue;

      const surchargeNet = minimumOrderRiskSurcharge(
        product,
        selectedSupply.supplier_code,
        selectedSupply.supplier_config,
      );
      const vatRate = supplierVatRate({
        supplierCode: selectedSupply.supplier_code,
        isBook: false,
      });
      const offerFloor = paymentAwareFloor(
        purchasePrice + (candidate.physicalStock ? 0 : surchargeNet),
        vatRate,
        rotatingOfferFloorMargin(
          candidate.profile,
          candidate.physicalStock,
        ),
      );
      const discount = rotatingOfferDiscount(
        candidate.profile,
        calendar.saturday,
        candidate.physicalStock,
      );
      const desired = currentPrice * (1 - discount);
      const amount = roundUpToProfessionalPrice(Math.max(offerFloor, desired));
      const realisedDiscount = (currentPrice - amount) / currentPrice;
      if (
        amount + 0.005 >= currentPrice ||
        realisedDiscount < 0.025 ||
        currentPrice - amount < 0.5
      ) {
        continue;
      }

      selected.push({
        variantId: String(row.variant_id ?? ""),
        spreeVariantId,
        productId,
        sku: String(row.canonical_sku ?? ""),
        amount,
        compareAtAmount: currentPrice,
        profile: candidate.profile.code,
        discount: realisedDiscount,
        physicalStock: candidate.physicalStock,
        stockOnHand: candidate.stockOnHand,
        hadSale: (spreeProduct.tags ?? []).includes("sale"),
        hadFeatured: (spreeProduct.tags ?? []).includes("featured"),
      });
      profileCounts.set(candidate.profile.code, used + 1);
      seenProducts.add(productId);
    } catch (error) {
      console.error("Candidato de oferta descartado", {
        variantId: String(row.variant_id ?? ""),
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const priceList = await spreeRequest<SpreePriceList>(
    config,
    "POST",
    "/price_lists",
    {
      name: calendar.saturday
        ? "Bison · Especial sábado · " + calendar.dayKey
        : "Bison · Ofertas 24h · " + calendar.dayKey,
      description: calendar.saturday
        ? "Selección automática de sábado. Mantiene un suelo de contribución por perfil."
        : "Selección automática diaria. Rota por perfil comercial y respeta precios manuales.",
      match_policy: "all",
      starts_at: new Date().toISOString(),
    },
  );

  if (selected.length > 0) {
    await spreeRequest(config, "POST", "/prices/bulk_upsert", {
      prices: selected.map((offer) => ({
        variant_id: offer.spreeVariantId,
        currency: "EUR",
        price_list_id: priceList.id,
        amount: offer.amount,
        compare_at_amount: offer.compareAtAmount,
      })),
    });
  }

  if (currentState?.spree_price_list_id) {
    try {
      await spreeRequest(
        config,
        "PATCH",
        "/price_lists/" +
          encodeURIComponent(currentState.spree_price_list_id) +
          "/deactivate",
      );
    } catch {
      // An already-expired or manually removed list is harmless.
    }
  }
  await restoreDailyOfferTags(config, currentState);

  if (selected.length > 0) {
    await spreeRequest(
      config,
      "PATCH",
      "/price_lists/" + encodeURIComponent(priceList.id) + "/activate",
    );
  }

  for (const offer of selected) {
    const product = await spreeRequest<SpreeProduct>(
      config,
      "GET",
      "/products/" + encodeURIComponent(offer.productId),
    );
    const tags = Array.from(
      new Set([
        ...(product.tags ?? []),
        "sale",
        "featured",
        calendar.saturday ? "saturday-special" : "daily-offer",
        "offer-date:" + calendar.dayKey,
        "offer-profile:" + offer.profile,
      ]),
    );
    await spreeRequest(
      config,
      "PATCH",
      "/products/" + encodeURIComponent(offer.productId),
      { tags },
    );
  }

  const now = new Date().toISOString();
  const { error: stateError } = await supabase
    .from("catalog_daily_offer_state")
    .upsert(
      {
        id: "primary",
        day_key: calendar.dayKey,
        spree_price_list_id: priceList.id,
        special: calendar.saturday,
        active_products: selected.map((offer) => ({
          productId: offer.productId,
          hadSale: offer.hadSale,
          hadFeatured: offer.hadFeatured,
        })),
        last_rotated_at: now,
        last_error: null,
        updated_at: now,
      },
      { onConflict: "id" },
    );
  if (stateError) throw stateError;

  return {
    status: "rotated",
    dayKey: calendar.dayKey,
    saturday: calendar.saturday,
    priceListId: priceList.id,
    selected: selected.map((offer) => ({
      productId: offer.productId,
      sku: offer.sku,
      profile: offer.profile,
      amount: offer.amount,
      compareAtAmount: offer.compareAtAmount,
      discount: Math.round(offer.discount * 1000) / 10,
      physicalStock: offer.physicalStock,
      stockOnHand: offer.stockOnHand,
    })),
  };
}

async function rotateDailyOffers(
  config: ConfigRow,
  force = false,
): Promise<Record<string, unknown>> {
  const token = await acquireDailyOfferRotationLock();
  if (!token) {
    return { status: "locked" };
  }
  try {
    return await rotateDailyOffersUnlocked(config, force);
  } finally {
    await releaseDailyOfferRotationLock(token);
  }
}

async function validateSpreeAdminKey(
  spreeApiUrl: string,
  key: string,
): Promise<void> {
  if (!key.startsWith("sk_"))
    throw new Error("La clave de Spree no es una Secret API Key válida.");
  const response = await fetch(
    spreeApiUrl.replace(/\/$/, "") + "/api/v3/admin/products?limit=1",
    { redirect: "error", headers: { accept: "application/json", "x-spree-api-key": key } },
  );
  if (!response.ok) {
    throw new Error(
      "Spree rechazó la Secret API Key (" + response.status + ").",
    );
  }
}

async function operatorAuthorized(
  config: ConfigRow,
  provided: string,
): Promise<boolean> {
  if (!provided || !config.spree_admin_api_key) return false;
  return (
    (await sha256(provided)) === (await sha256(config.spree_admin_api_key))
  );
}

interface MerchandisingOfferInput {
  productId: string;
  sku: string;
  amount: number;
  compareAtAmount?: number | null;
  featured?: boolean;
  sale?: boolean;
}

async function applyMerchandisingOffers(
  config: ConfigRow,
  rawOffers: unknown[],
): Promise<{
  updated: number;
  offers: Array<{
    productId: string;
    sku: string;
    previousAmount: number;
    amount: number;
    compareAtAmount: number | null;
  }>;
}> {
  const offers: MerchandisingOfferInput[] = rawOffers.map((raw) => {
    const value =
      raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
    return {
      productId: String(value.productId ?? "").trim(),
      sku: String(value.sku ?? "").trim(),
      amount: Number(value.amount),
      compareAtAmount:
        value.compareAtAmount === null
          ? null
          : value.compareAtAmount === undefined
            ? undefined
            : Number(value.compareAtAmount),
      featured: value.featured !== false,
      sale: value.sale !== false,
    };
  });

  if (offers.length === 0) {
    throw new Error("Se requiere al menos una oferta");
  }

  const results: Array<{
    productId: string;
    sku: string;
    previousAmount: number;
    amount: number;
    compareAtAmount: number | null;
  }> = [];

  for (const offer of offers) {
    if (
      !offer.productId ||
      !offer.sku ||
      !Number.isFinite(offer.amount) ||
      offer.amount <= 0
    ) {
      throw new Error("Oferta de merchandising inválida");
    }

    const product = await spreeRequest<SpreeProduct>(
      config,
      "GET",
      "/products/" + encodeURIComponent(offer.productId),
    );
    const variants = await spreeList<SpreeVariant>(
      config,
      "/products/" + encodeURIComponent(offer.productId) + "/variants",
    );
    const variant = variants.find((item) => item.sku?.trim() === offer.sku);
    if (!variant) {
      throw new Error(
        "No se encontró SKU " + offer.sku + " en " + offer.productId,
      );
    }

    const previousAmount = variantPrice(variant);
    if (previousAmount === null) {
      throw new Error("La variante " + offer.sku + " no tiene precio EUR");
    }

    const selectedSupply = await selectedSupplyForSpreeVariant(variant.id);
    const purchasePrice = Number(selectedSupply?.normalized_cost);
    if (
      !selectedSupply?.supplier_code ||
      !Number.isFinite(purchasePrice) ||
      purchasePrice <= 0
    ) {
      throw new Error(
        "No hay una oferta de proveedor elegible para " + offer.sku,
      );
    }
    const referencePriceNet = Number(selectedSupply.reference_price_net);
    const merchandisingProduct: DevirProduct = {
      sku: selectedSupply.canonical_sku || offer.sku,
      name: selectedSupply.product_name || offer.sku,
      url: selectedSupply.source_url ?? "",
      purchasePrice,
      referencePriceNet:
        Number.isFinite(referencePriceNet) && referencePriceNet > 0
          ? referencePriceNet
          : null,
      availability: selectedSupply.availability ?? "available",
      availabilityLabel: null,
      releaseDate: null,
      imageUrls: [],
    };
    const key = categoryKey(merchandisingProduct);
    const book = isBookProduct(merchandisingProduct, key);
    const vatRate = book ? 0.04 : 0.21;
    const safetyFloor = paymentAwareFloor(
      purchasePrice,
      vatRate,
      book ? 0.02 : 0.01,
    );

    if (offer.amount + 0.005 < safetyFloor) {
      throw new Error(
        "Oferta " +
          offer.sku +
          " por debajo del suelo de contribución (" +
          safetyFloor.toFixed(2) +
          " EUR)",
      );
    }

    if (
      book &&
      merchandisingProduct.referencePriceNet &&
      offer.amount + 0.005 <
        merchandisingProduct.referencePriceNet * 1.04 * 0.95
    ) {
      throw new Error(
        "Oferta " +
          offer.sku +
          " supera el descuento ordinario permitido para libros",
      );
    }

    const compareAtAmount =
      offer.compareAtAmount === undefined
        ? previousAmount
        : offer.compareAtAmount;

    if (
      compareAtAmount !== null &&
      (!Number.isFinite(compareAtAmount) || compareAtAmount <= offer.amount)
    ) {
      throw new Error(
        "El precio anterior debe ser superior al precio de oferta para " +
          offer.sku,
      );
    }

    await upsertBasePrice(config, variant.id, offer.amount, compareAtAmount);

    const tags = Array.from(
      new Set([
        ...(product.tags ?? []),
        ...(offer.featured ? ["featured"] : []),
        ...(offer.sale ? ["sale"] : []),
      ]),
    );
    await spreeRequest(
      config,
      "PATCH",
      "/products/" + encodeURIComponent(product.id),
      { tags },
    );

    results.push({
      productId: product.id,
      sku: offer.sku,
      previousAmount,
      amount: offer.amount,
      compareAtAmount,
    });
  }

  return { updated: results.length, offers: results };
}

async function upsertCatalogSupplier(
  body: Record<string, unknown>,
): Promise<CatalogSupplierRow> {
  const raw =
    body.supplier && typeof body.supplier === "object"
      ? (body.supplier as Record<string, unknown>)
      : body;
  const code = normalizeSupplierCode(String(raw.code ?? ""));
  const name = String(raw.name ?? "").trim();
  const adapterKey = normalizeSupplierCode(String(raw.adapterKey ?? code));
  const priority = Number(raw.priority ?? 100);
  const staleAfterHours = Number(raw.staleAfterHours ?? 18);
  const syncIntervalHours = Number(raw.syncIntervalHours ?? 6);
  const defaultCurrency = String(raw.defaultCurrency ?? "EUR")
    .trim()
    .toUpperCase();
  const adapterConfig =
    raw.config === undefined
      ? undefined
      : raw.config &&
          typeof raw.config === "object" &&
          !Array.isArray(raw.config)
        ? (raw.config as Record<string, unknown>)
        : null;
  if (!name) throw new Error("supplier.name es obligatorio");
  if (!Number.isInteger(priority))
    throw new Error("supplier.priority debe ser entero");
  if (!Number.isInteger(staleAfterHours) || staleAfterHours <= 0) {
    throw new Error("supplier.staleAfterHours debe ser un entero positivo");
  }
  if (!Number.isInteger(syncIntervalHours) || syncIntervalHours <= 0) {
    throw new Error("supplier.syncIntervalHours debe ser un entero positivo");
  }
  if (!/^[A-Z]{3}$/.test(defaultCurrency)) {
    throw new Error("supplier.defaultCurrency debe ser ISO-4217");
  }
  if (adapterConfig === null) {
    throw new Error("supplier.config debe ser un objeto JSON no secreto");
  }

  const { data, error } = await supabase
    .from("catalog_suppliers")
    .upsert(
      {
        code,
        name,
        adapter_key: adapterKey,
        enabled: raw.enabled !== false,
        priority,
        default_currency: defaultCurrency,
        stale_after_hours: staleAfterHours,
        sync_interval_hours: syncIntervalHours,
        ...(adapterConfig === undefined ? {} : { config: adapterConfig }),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "code" },
    )
    .select(
      "id,code,name,adapter_key,enabled,priority,default_currency,stale_after_hours,sync_interval_hours,last_completed_run_id,config",
    )
    .single();
  if (error) throw error;
  return data as CatalogSupplierRow;
}

async function ingestCatalogItemsAction(
  config: ConfigRow,
  body: Record<string, unknown>,
): Promise<{
  processed: number;
  failed: number;
  results: Array<Record<string, unknown>>;
}> {
  const supplierCode = normalizeSupplierCode(String(body.supplierCode ?? ""));
  await configuredCatalogSupplier(supplierCode);
  const items = Array.isArray(body.items) ? body.items : [];
  if (items.length === 0)
    throw new Error("items debe contener al menos un producto");
  if (items.length > 100) throw new Error("Máximo 100 variantes por petición");
  const runId =
    typeof body.runId === "string" && body.runId.trim()
      ? body.runId.trim()
      : null;
  const categories = await spreeCategories(config);
  const defs = await definitions(config);
  const results: Array<Record<string, unknown>> = [];
  let failed = 0;

  for (const raw of items) {
    const value =
      raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
    try {
      const { resolution, synced } = await ingestCatalogItem(
        config,
        { ...value, supplierCode } as unknown as SupplierCatalogItem,
        runId,
        categories,
        defs,
      );
      results.push({
        ok: true,
        externalVariantId: resolution.item.externalVariantId,
        canonicalVariantId: resolution.variant.id,
        spreeProductId: synced.productId,
        spreeVariantId: synced.variantId,
        selectedSupplier: synced.selectedSupplierCode,
      });
    } catch (error) {
      failed += 1;
      results.push({
        ok: false,
        externalVariantId: String(value.externalVariantId ?? ""),
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return { processed: items.length - failed, failed, results };
}

async function repriceCatalogSupplierBatch(
  config: ConfigRow,
  body: Record<string, unknown>,
): Promise<{
  supplierCode: string;
  processed: number;
  repriced: number;
  unchanged: number;
  manualOverrides: number;
  failed: number;
  total: number;
  offset: number;
  nextOffset: number | null;
  results: Array<Record<string, unknown>>;
}> {
  const supplierCode = normalizeSupplierCode(String(body.supplierCode ?? ""));
  const supplier = await configuredCatalogSupplier(supplierCode);
  const limit = Math.min(100, Math.max(1, Number(body.limit ?? 50) || 50));
  const offset = Math.max(0, Number(body.offset ?? 0) || 0);

  const { data, error, count } = await supabase
    .from("catalog_selected_supply")
    .select(
      "variant_id,canonical_sku,spree_variant_id,product_id,product_name,spree_product_id,supplier_code,normalized_cost,currency,reference_price_net,availability,source_url",
      { count: "exact" },
    )
    .eq("supplier_code", supplierCode)
    .order("variant_id")
    .range(offset, offset + limit - 1);
  if (error) throw error;

  const rows = data ?? [];
  const variantIds = Array.from(
    new Set(rows.map((row) => String(row.variant_id))),
  );
  const productIds = Array.from(
    new Set(rows.map((row) => String(row.product_id))),
  );

  const [
    { data: variants, error: variantsError },
    { data: products, error: productsError },
  ] = await Promise.all([
    supabase
      .from("catalog_variants")
      .select(
        "id,last_auto_price,spree_variant_id,product_id,selected_offer_id",
      )
      .in("id", variantIds),
    supabase
      .from("catalog_products")
      .select("id,name,category_key,spree_product_id")
      .in("id", productIds),
  ]);
  if (variantsError) throw variantsError;
  if (productsError) throw productsError;

  const selectedOfferIds = Array.from(
    new Set(
      (variants ?? [])
        .map((row) => String(row.selected_offer_id ?? ""))
        .filter(Boolean),
    ),
  );
  const { data: selectedOffers, error: selectedOffersError } =
    selectedOfferIds.length > 0
      ? await supabase
          .from("catalog_supplier_offers")
          .select("id,raw_payload")
          .in("id", selectedOfferIds)
      : { data: [], error: null };
  if (selectedOffersError) throw selectedOffersError;
  const selectedOffersById = new Map(
    (selectedOffers ?? []).map((row) => [String(row.id), row]),
  );

  const variantsById = new Map(
    (variants ?? []).map((row) => [String(row.id), row]),
  );
  const productsById = new Map(
    (products ?? []).map((row) => [String(row.id), row]),
  );

  const categories = await spreeCategories(config);
  const marginByKey = new Map<string, number>();
  const categoryKeys = Array.from(
    new Set(
      (products ?? [])
        .map((row) => String(row.category_key ?? ""))
        .filter(Boolean),
    ),
  );
  for (const key of categoryKeys) {
    const category = categoryForKey(categories, key);
    const configured = category ? await categoryMargin(config, category) : null;
    marginByKey.set(key, configured ?? DEFAULT_CATEGORY_MARGINS[key] ?? 0.05);
  }

  let repriced = 0;
  let unchanged = 0;
  let manualOverrides = 0;
  let failed = 0;
  const results: Array<Record<string, unknown>> = [];

  const processRow = async (row: Record<string, unknown>) => {
    const variantId = String(row.variant_id ?? "");
    const productId = String(row.product_id ?? "");
    const variant = variantsById.get(variantId);
    const productRow = productsById.get(productId);
    const spreeVariantId = String(
      row.spree_variant_id ?? variant?.spree_variant_id ?? "",
    );
    const spreeProductId = String(
      row.spree_product_id ?? productRow?.spree_product_id ?? "",
    );

    try {
      if (!variant || !productRow || !spreeVariantId || !spreeProductId) {
        throw new Error("catalog_mapping_missing");
      }
      const cost = Number(row.normalized_cost);
      if (!Number.isFinite(cost) || cost <= 0) {
        throw new Error("supplier_cost_missing");
      }
      const storedKey = String(productRow.category_key ?? "").trim();
      const inferredKey = inferDevirCategoryKey({
        name: String(row.product_name ?? productRow.name ?? ""),
        url: String(row.source_url ?? ""),
      });
      const key = storedKey || inferredKey;
      const product: DevirProduct = {
        sku: String(row.canonical_sku ?? ""),
        name: String(row.product_name ?? productRow.name ?? ""),
        url: String(row.source_url ?? ""),
        purchasePrice: cost,
        referencePriceNet:
          Number.isFinite(Number(row.reference_price_net)) &&
          Number(row.reference_price_net) > 0
            ? Number(row.reference_price_net)
            : null,
        availability:
          row.availability === "available" ||
          row.availability === "preorder" ||
          row.availability === "unavailable"
            ? row.availability
            : "unknown",
        availabilityLabel: null,
        releaseDate: null,
        imageUrls: [],
        categoryKeyOverride: key || null,
        supplierMinimumQuantity: minimumOrderQuantityFromOfferPayload(
          selectedOffersById.get(String(variant.selected_offer_id ?? ""))
            ?.raw_payload as Record<string, unknown> | null | undefined,
        ),
      };
      const categoryBaseMargin =
        marginByKey.get(key) ?? DEFAULT_CATEGORY_MARGINS[key] ?? 0.08;
      const targetMargin = commercialTargetMargin(
        product,
        key,
        categoryBaseMargin,
      );
      const profile = commercialPricingProfile({
        name: product.name,
        categoryKey: key,
        unitCostNet: product.purchasePrice,
      });
      const pricing = competitivePricing(
        product,
        key,
        targetMargin,
        supplierCode,
        supplier.config,
      );

      const spreeVariant = await spreeRequest<SpreeVariant>(
        config,
        "GET",
        "/products/" +
          encodeURIComponent(spreeProductId) +
          "/variants/" +
          encodeURIComponent(spreeVariantId),
      );
      const currentPrice = variantPrice(spreeVariant);
      const lastAutoPrice = Number(variant.last_auto_price);
      const canWrite = canWriteManagedCatalogPrice({
        createdVariant: false,
        managed: true,
        forceDraftForSplit: false,
        currentPrice,
        lastAutoPrice: Number.isFinite(lastAutoPrice) ? lastAutoPrice : null,
      });

      if (!canWrite) {
        manualOverrides += 1;
        results.push({
          variantId,
          ok: true,
          skipped: "manual_price_override",
          currentPrice,
          lastAutoPrice: Number.isFinite(lastAutoPrice) ? lastAutoPrice : null,
        });
        return;
      }

      if (
        currentPrice !== null &&
        Math.abs(currentPrice - pricing.retail) < 0.005
      ) {
        unchanged += 1;
      } else {
        await upsertBasePrice(config, spreeVariantId, pricing.retail);
        repriced += 1;
      }

      const { error: updateError } = await supabase
        .from("catalog_variants")
        .update({
          last_auto_price: pricing.retail,
          updated_at: new Date().toISOString(),
        })
        .eq("id", variantId);
      if (updateError) throw updateError;

      results.push({
        variantId,
        ok: true,
        previousPrice: currentPrice,
        price: pricing.retail,
        vatRate: pricing.vatRate,
        minimumOrderQuantity: product.supplierMinimumQuantity ?? null,
        minimumOrderSurchargeNet: pricing.minimumOrderSurchargeNet,
        minimumOrderSurchargeGross: pricing.minimumOrderSurchargeGross,
        pricingProfile: profile.code,
        targetMargin,
      });
    } catch (error) {
      failed += 1;
      results.push({
        variantId,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  };

  for (let index = 0; index < rows.length; index += 8) {
    await Promise.all(
      rows
        .slice(index, index + 8)
        .map((row) => processRow(row as Record<string, unknown>)),
    );
    await new Promise((resolve) => setTimeout(resolve, 75));
  }

  const total = count ?? 0;
  return {
    supplierCode,
    processed: rows.length,
    repriced,
    unchanged,
    manualOverrides,
    failed,
    total,
    offset,
    nextOffset: offset + rows.length < total ? offset + rows.length : null,
    results,
  };
}

async function completeCatalogSupplierRun(
  config: ConfigRow,
  body: Record<string, unknown>,
): Promise<{
  supplierCode: string;
  missing: number;
  deactivated: number;
  alreadyCompleted: boolean;
}> {
  const supplierCode = normalizeSupplierCode(String(body.supplierCode ?? ""));
  const runId = String(body.runId ?? "").trim();
  if (!/^[A-Za-z0-9:_-]{1,120}$/.test(runId)) {
    throw new Error("runId inválido");
  }
  const supplier = await configuredCatalogSupplier(supplierCode);
  const { data: completed, error: completeError } = await supabase.rpc(
    "catalog_complete_supplier_run",
    { p_supplier_id: supplier.id, p_run_id: runId },
  );
  if (completeError) throw completeError;
  const result =
    completed && typeof completed === "object"
      ? (completed as Record<string, unknown>)
      : {};
  const affectedVariantIds = Array.isArray(result.variantIds)
    ? Array.from(new Set(result.variantIds.map(String)))
    : [];

  if (affectedVariantIds.length > 0) {
    const categories = await spreeCategories(config);
    const defs = await definitions(config);
    const affectedProducts = new Set<string>();
    for (const variantId of affectedVariantIds) {
      const synced = await reconcileCatalogVariant(
        config,
        await loadCatalogVariant(variantId),
        categories,
        defs,
      );
      if (synced.productId) affectedProducts.add(synced.productId);
    }
    for (const productId of affectedProducts) {
      await markCatalogProductDirty(productId);
      await preparePublishBatch(config, 0, 1, productId);
    }
  }

  return {
    supplierCode,
    missing: Number(result.missing ?? 0),
    deactivated: Number(result.deactivated ?? 0),
    alreadyCompleted: result.alreadyCompleted === true,
  };
}

type TcgFactorySessionState = ConfigRow["session_state"];

interface TcgFactoryCrawlState {
  supplier_id: string;
  run_id: string | null;
  section: string;
  page: number;
  item_offset: number;
  total_pages: number | null;
  discovered_items: number;
  processed_items: number;
  failed_items: number;
  status: "idle" | "running" | "error";
  last_error: string | null;
  started_at: string | null;
  updated_at: string;
}

const TCGFACTORY_USER_AGENT = "BisonTCG supplier sync/1.0";

interface TcgFactoryCredentials {
  email: string;
  password: string;
}

async function tcgFactoryCredentials(): Promise<TcgFactoryCredentials | null> {
  const { data, error } = await supabase.rpc("tcgfactory_sync_get_credentials");
  if (!error && data && typeof data === "object") {
    const value = data as Record<string, unknown>;
    const email = typeof value.email === "string" ? value.email.trim() : "";
    const password = typeof value.password === "string" ? value.password : "";
    if (email && password) return { email, password };
  }

  try {
    return requireTcgFactoryCredentials((name) => Deno.env.get(name));
  } catch {
    return null;
  }
}

async function tcgFactoryCredentialsConfigured(): Promise<boolean> {
  return Boolean(await tcgFactoryCredentials());
}

function htmlAttribute(tag: string, name: string): string | null {
  const match = tag.match(
    new RegExp(
      "\\\\b" + name + "\\\\s*=\\\\s*([\\\"'])((?:(?!\\\\1).)*)\\\\1",
      "i",
    ),
  );
  return match?.[2] ?? null;
}

function tcgFactoryLoginFields(html: string): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const input of html.matchAll(/<input\b[^>]*>/gi)) {
    const tag = input[0];
    const type = (htmlAttribute(tag, "type") ?? "").toLowerCase();
    const name = htmlAttribute(tag, "name");
    if (!name || (type && type !== "hidden")) continue;
    fields[name] = htmlAttribute(tag, "value") ?? "";
  }
  return fields;
}

function tcgCookieHeader(session: TcgFactorySessionState, url: string): string {
  if (!session?.cookies?.length) return "";
  const target = new URL(url);
  const nowSeconds = Date.now() / 1000;
  return session.cookies
    .filter((cookie) => {
      const domain = cookie.domain.replace(/^\./, "");
      const hostOk =
        target.hostname === domain || target.hostname.endsWith("." + domain);
      const pathOk = target.pathname.startsWith(cookie.path || "/");
      const expiryOk =
        !cookie.expires || cookie.expires < 0 || cookie.expires > nowSeconds;
      return hostOk && pathOk && expiryOk;
    })
    .map((cookie) => cookie.name + "=" + cookie.value)
    .join("; ");
}

async function tcgFactoryTextFetch(
  url: string,
  session?: TcgFactorySessionState,
): Promise<{
  html: string;
  finalUrl: string;
  session: TcgFactorySessionState;
}> {
  const response = await fetch(url, {
    redirect: "follow",
    headers: {
      accept: "text/html,application/xhtml+xml",
      "accept-language": "es-ES,es;q=0.9,en;q=0.7",
      "user-agent": TCGFACTORY_USER_AGENT,
      ...(session?.cookies?.length
        ? { cookie: tcgCookieHeader(session, url) }
        : {}),
    },
    signal: AbortSignal.timeout(30_000),
  });
  const html = await response.text();
  if (!response.ok) {
    throw new Error(
      "TcgFactory HTTP " + response.status + " en " + new URL(url).pathname,
    );
  }
  const nextSession = mergeSessionCookies(
    session ?? null,
    parseSetCookies(response.headers),
    TCGFACTORY_BASE_URL,
  );
  return { html, finalUrl: response.url, session: nextSession };
}

async function tcgFactoryLogin(
  credentialsOverride?: TcgFactoryCredentials,
): Promise<TcgFactorySessionState> {
  const credentials = credentialsOverride ?? (await tcgFactoryCredentials());
  if (!credentials) {
    throw new Error("TCGFACTORY_B2B_CREDENTIALS_MISSING");
  }
  const loginUrl = TCGFACTORY_BASE_URL + "/es/iniciar-sesion?back=my-account";
  const login = await tcgFactoryTextFetch(loginUrl);
  const formTag =
    login.html.match(
      /<form\b[^>]*(?:id=["']login-form["']|action=["'][^"']*(?:iniciar-sesion|login)[^"']*["'])[^>]*>/i,
    )?.[0] ?? "";
  const actionRaw = htmlAttribute(formTag, "action") ?? loginUrl;
  const action = new URL(actionRaw, TCGFACTORY_BASE_URL).toString();
  const fields = tcgFactoryLoginFields(login.html);
  const body = new URLSearchParams(fields);
  body.set("email", credentials.email);
  body.set("password", credentials.password);
  body.set("submitLogin", "1");
  if (!body.has("back")) body.set("back", "my-account");

  const response = await fetch(action, {
    method: "POST",
    redirect: "manual",
    headers: {
      accept: "text/html,application/xhtml+xml",
      "content-type": "application/x-www-form-urlencoded",
      "user-agent": TCGFACTORY_USER_AGENT,
      cookie: tcgCookieHeader(login.session, action),
      referer: loginUrl,
    },
    body,
    signal: AbortSignal.timeout(30_000),
  });
  const responseHtml = await response.text();
  let session = mergeSessionCookies(
    login.session,
    parseSetCookies(response.headers),
    TCGFACTORY_BASE_URL,
  );
  if (response.status >= 400) {
    throw new Error("TCGFACTORY_LOGIN_FAILED: HTTP " + response.status);
  }
  if (/captcha|recaptcha|hcaptcha|turnstile|cloudflare/i.test(responseHtml)) {
    throw new Error("TCGFACTORY_LOGIN_FAILED: challenge_antibot");
  }

  const probe = await tcgFactoryTextFetch(
    TCGFACTORY_BASE_URL + "/es/mi-cuenta",
    session,
  );
  session = probe.session;
  const loginStillVisible =
    /\/iniciar-sesion(?:[?#]|$)/i.test(probe.finalUrl) ||
    /id=["']login-form["']|name=["']submitLogin["']/i.test(
      probe.html.slice(0, 120000),
    );
  if (loginStillVisible) {
    throw new Error("TCGFACTORY_LOGIN_FAILED: credentials_rejected");
  }
  return session;
}

async function tcgFactorySupplierRow(): Promise<
  CatalogSupplierRow & {
    next_sync_at?: string | null;
    last_error?: string | null;
  }
> {
  const { data, error } = await supabase
    .from("catalog_suppliers")
    .select(
      "id,code,name,adapter_key,enabled,priority,default_currency,stale_after_hours,sync_interval_hours,last_completed_run_id,config,next_sync_at,last_error",
    )
    .eq("code", TCGFACTORY_SUPPLIER_CODE)
    .single();
  if (error) throw error;
  return data as CatalogSupplierRow & {
    next_sync_at?: string | null;
    last_error?: string | null;
  };
}

async function upsertTcgFactoryDiscovery(
  supplierId: string,
  product: TcgFactoryPublicProduct,
  runId: string | null,
  metadata: Record<string, unknown> = {},
): Promise<void> {
  const { error } = await supabase.from("catalog_supplier_discovery").upsert(
    {
      supplier_id: supplierId,
      external_product_id: product.externalProductId,
      external_variant_id: product.externalVariantId,
      supplier_sku: product.reference ?? product.externalVariantId,
      gtin: product.ean,
      product_name: product.productName,
      source_url: product.sourceUrl,
      category_key: product.categoryKey,
      manufacturer: product.manufacturer,
      manufacturer_sku: product.manufacturerSku,
      options: product.options,
      reference_price_net: product.referencePriceNet,
      availability: product.availability,
      release_date: product.releaseDate,
      image_urls: product.imageUrls,
      metadata: { ...product.metadata, ...metadata },
      active: true,
      last_seen_run_id: runId,
      last_seen_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "supplier_id,external_variant_id" },
  );
  if (error) throw error;
}

async function tcgFactoryDiscoverPublicBatch(
  page: number,
  offset: number,
  limit: number,
  runId: string | null = null,
): Promise<{
  page: number;
  offset: number;
  totalPages: number;
  totalItems: number | null;
  discovered: number;
  failed: number;
  nextOffset: number | null;
  urls: string[];
}> {
  const supplier = await tcgFactorySupplierRow();
  const pageUrl =
    TCGFACTORY_ACCESSORIES_URL + (page > 1 ? "?page=" + page : "");
  const listing = await tcgFactoryTextFetch(pageUrl);
  const parsed = parseTcgFactoryListing(listing.html, pageUrl);
  const selected = parsed.productUrls.slice(offset, offset + limit);
  let discovered = 0;
  let failed = 0;

  for (const url of selected) {
    try {
      const detail = await tcgFactoryTextFetch(url);
      const product = parseTcgFactoryPublicProduct(detail.html, url);
      await upsertTcgFactoryDiscovery(supplier.id, product, runId);
      discovered += 1;
    } catch (error) {
      failed += 1;
      console.error(
        "TcgFactory public discovery failed",
        url,
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  const nextOffset =
    offset + selected.length < parsed.productUrls.length
      ? offset + selected.length
      : null;
  return {
    page,
    offset,
    totalPages: parsed.totalPages,
    totalItems: parsed.totalItems,
    discovered,
    failed,
    nextOffset,
    urls: selected,
  };
}

function safeTcgFactoryB2bPrice(
  authenticatedHtml: string,
  publicReferenceNet: number | null,
): number {
  const price = parseTcgFactoryAuthenticatedPrice(authenticatedHtml);
  if (!price || !Number.isFinite(price) || price <= 0) {
    throw new Error("TCGFACTORY_B2B_PRICE_MISSING");
  }
  if (
    publicReferenceNet !== null &&
    Number.isFinite(publicReferenceNet) &&
    price >= publicReferenceNet * 0.995
  ) {
    throw new Error("TCGFACTORY_B2B_PRICE_NOT_DISTINCT_FROM_PUBLIC_REFERENCE");
  }
  return price;
}

function tcgFactoryCatalogItem(
  product: TcgFactoryPublicProduct,
  authenticatedPriceNet: number,
  minimumOrderQuantity: number | null,
): SupplierCatalogItem {
  return tcgFactoryRecordToCatalogItem({
    externalProductId: product.externalProductId,
    externalVariantId: product.externalVariantId,
    reference: product.reference ?? product.externalVariantId,
    productName: product.productName,
    ean: product.ean,
    sourceUrl: product.sourceUrl,
    categoryKey: product.categoryKey,
    manufacturer: product.manufacturer ?? undefined,
    manufacturerSku: product.manufacturerSku ?? undefined,
    options: product.options,
    purchasePriceNet: authenticatedPriceNet,
    shippingCostNet: 0,
    currency: "EUR",
    availability: product.reportedAvailability || product.availability,
    releaseDate: product.releaseDate,
    imageUrls: product.imageUrls,
    referencePriceNet: product.referencePriceNet,
    minimumOrderQuantity,
  });
}

async function backfillTcgFactoryMinimumOrders(
  offset: number,
  limit: number,
  dryRun = true,
): Promise<Record<string, unknown>> {
  const supplier = await tcgFactorySupplierRow();
  let session = await tcgFactoryLogin();
  const { data, error, count } = await supabase
    .from("catalog_supplier_discovery")
    .select("id,supplier_sku,source_url,metadata", { count: "exact" })
    .eq("supplier_id", supplier.id)
    .eq("active", true)
    .not("source_url", "is", null)
    .order("id")
    .range(offset, offset + limit - 1);
  if (error) throw error;

  let detected = 0;
  let highMinimum = 0;
  let persisted = 0;
  let failed = 0;
  const results: Array<Record<string, unknown>> = [];

  for (const row of data ?? []) {
    const supplierSku = String(row.supplier_sku ?? "");
    const sourceUrl = String(row.source_url ?? "");
    try {
      const detail = await tcgFactoryTextFetch(sourceUrl, session);
      session = detail.session;
      const parsed = parseTcgFactoryMinimumOrderQuantity(detail.html);
      const quantity = tcgFactoryMinimumOrderQuantity(
        supplier,
        supplierSku,
        parsed,
      );
      const pricingConfig = tcgFactoryMoqPricingConfig(supplier.config);
      const isHighMinimum =
        quantity !== null && quantity >= pricingConfig.threshold;
      if (quantity) detected += 1;
      if (isHighMinimum) highMinimum += 1;

      if (!dryRun && quantity) {
        const metadata =
          row.metadata &&
          typeof row.metadata === "object" &&
          !Array.isArray(row.metadata)
            ? (row.metadata as Record<string, unknown>)
            : {};
        const now = new Date().toISOString();
        const { error: discoveryError } = await supabase
          .from("catalog_supplier_discovery")
          .update({
            metadata: { ...metadata, minimumOrderQuantity: quantity },
            updated_at: now,
          })
          .eq("id", row.id);
        if (discoveryError) throw discoveryError;

        const { data: offers, error: offersError } = await supabase
          .from("catalog_supplier_offers")
          .select("id,raw_payload")
          .eq("supplier_id", supplier.id)
          .eq("supplier_sku", supplierSku);
        if (offersError) throw offersError;
        for (const offer of offers ?? []) {
          const payload =
            offer.raw_payload && typeof offer.raw_payload === "object"
              ? (offer.raw_payload as Record<string, unknown>)
              : {};
          const metadata =
            payload.metadata &&
            typeof payload.metadata === "object" &&
            !Array.isArray(payload.metadata)
              ? (payload.metadata as Record<string, unknown>)
              : {};
          const { error: offerError } = await supabase
            .from("catalog_supplier_offers")
            .update({
              raw_payload: {
                ...payload,
                metadata: { ...metadata, minimumOrderQuantity: quantity },
              },
              updated_at: now,
            })
            .eq("id", offer.id);
          if (offerError) throw offerError;
        }
        persisted += 1;
      }

      results.push({
        supplierSku,
        minimumOrderQuantity: quantity,
        detectedFromPage: parsed,
        overrideApplied: quantity !== null && parsed !== quantity,
        surchargeEligible: isHighMinimum,
      });
    } catch (scanError) {
      failed += 1;
      results.push({
        supplierSku,
        error:
          scanError instanceof Error ? scanError.message : String(scanError),
      });
    }
  }

  const total = count ?? 0;
  const consumed = data?.length ?? 0;
  return {
    dryRun,
    processed: consumed,
    detected,
    highMinimum,
    persisted,
    failed,
    total,
    offset,
    nextOffset: offset + consumed < total ? offset + consumed : null,
    results,
  };
}

async function tcgFactoryStatus(): Promise<Record<string, unknown>> {
  const supplier = await tcgFactorySupplierRow();
  const { data: state, error: stateError } = await supabase
    .from("catalog_supplier_crawl_state")
    .select("*")
    .eq("supplier_id", supplier.id)
    .maybeSingle();
  if (stateError) throw stateError;
  const { count: discoveryCount, error: discoveryError } = await supabase
    .from("catalog_supplier_discovery")
    .select("id", { count: "exact", head: true })
    .eq("supplier_id", supplier.id);
  if (discoveryError) throw discoveryError;
  const { count: offerCount, error: offerError } = await supabase
    .from("catalog_supplier_offers")
    .select("id", { count: "exact", head: true })
    .eq("supplier_id", supplier.id);
  if (offerError) throw offerError;
  return {
    supplier: {
      code: supplier.code,
      enabled: supplier.enabled,
      nextSyncAt: supplier.next_sync_at ?? null,
      lastError: supplier.last_error ?? null,
    },
    credentialsConfigured: await tcgFactoryCredentialsConfigured(),
    discoveryCount: discoveryCount ?? 0,
    offerCount: offerCount ?? 0,
    crawl: state ?? null,
  };
}

async function reconcileUnavailableTcgFactoryProduct(
  config: ConfigRow,
  supplierId: string,
  product: TcgFactoryPublicProduct,
  runId: string | null,
  categories: SpreeCategory[],
  defs: Map<string, SpreeFieldDefinition>,
): Promise<void> {
  const now = new Date().toISOString();
  // A negative observation must replace the previous availability immediately.
  // Keep validated costs and physical quantities; do not create a new offer.
  const { data: offers, error } = await supabase
    .from("catalog_supplier_offers")
    .update({ availability: product.availability, last_seen_run_id: runId,
      last_seen_at: now, missing_runs: 0, updated_at: now })
    .eq("supplier_id", supplierId)
    .eq("source_url", product.sourceUrl)
    .select("variant_id");
  if (error) throw error;
  for (const variantId of new Set((offers ?? []).map(row => String(row.variant_id)))) {
    // Reconciliation updates supplier flags, selection and review policy. Product
    // visibility is decided centrally by syncProductToSpree; an unavailable
    // supplier observation must never hide an otherwise valid catalog page.
    await reconcileCatalogVariant(
      config,
      await loadCatalogVariant(variantId),
      categories,
      defs,
    );
  }
}

type TcgFactoryItemFailureDisposition = "retry" | "skip" | "fail";

function tcgFactoryItemFailureDisposition(
  error: unknown,
): TcgFactoryItemFailureDisposition {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("está siendo sincronizado por otro worker")) {
    return "retry";
  }
  if (/^TcgFactory HTTP 404\b/i.test(message)) {
    return "skip";
  }
  return "fail";
}

async function tcgFactoryTick(
  config: ConfigRow,
  force = false,
): Promise<Record<string, unknown>> {
  const supplier = await tcgFactorySupplierRow();
  if (!supplier.enabled && !force) return { skipped: "supplier_disabled" };

  const { data: currentState, error: stateError } = await supabase
    .from("catalog_supplier_crawl_state")
    .select("*")
    .eq("supplier_id", supplier.id)
    .maybeSingle();
  if (stateError) throw stateError;
  let state = currentState as TcgFactoryCrawlState | null;
  const running = state?.status === "running";
  const credentialsAvailable = await tcgFactoryCredentialsConfigured();
  const credentialsError =
    "credentials_missing: TCGFACTORY_B2B_EMAIL/TCGFACTORY_B2B_PASSWORD";

  if (
    !force &&
    !running &&
    supplier.next_sync_at &&
    new Date(supplier.next_sync_at).getTime() > Date.now()
  ) {
    return { skipped: "not_due", nextSyncAt: supplier.next_sync_at };
  }

  if (
    credentialsAvailable &&
    state?.status === "running" &&
    state.processed_items === 0 &&
    supplier.last_error?.startsWith("credentials_missing") &&
    (state.page > 1 || state.item_offset > 0)
  ) {
    const { data: restarted, error } = await supabase
      .from("catalog_supplier_crawl_state")
      .update({
        page: 1,
        item_offset: 0,
        total_pages: null,
        discovered_items: 0,
        processed_items: 0,
        failed_items: 0,
        last_error: null,
        started_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("supplier_id", supplier.id)
      .select("*")
      .single();
    if (error) throw error;
    state = restarted as TcgFactoryCrawlState;
  }

  if (!state || state.status !== "running") {
    const now = new Date().toISOString();
    const runId = "tcgfactory-" + String(Date.now());
    const { data: started, error } = await supabase
      .from("catalog_supplier_crawl_state")
      .upsert(
        {
          supplier_id: supplier.id,
          run_id: runId,
          section: "accessories",
          page: 1,
          item_offset: 0,
          total_pages: null,
          discovered_items: 0,
          processed_items: 0,
          failed_items: 0,
          status: "running",
          last_error: null,
          started_at: now,
          updated_at: now,
        },
        { onConflict: "supplier_id" },
      )
      .select("*")
      .single();
    if (error) throw error;
    state = started as TcgFactoryCrawlState;
    await setupCatalogCategoriesAndMargins(config);
  }

  const session = credentialsAvailable ? await tcgFactoryLogin() : null;
  const page = state.page;
  const offset = state.item_offset;
  const pageUrl =
    TCGFACTORY_ACCESSORIES_URL + (page > 1 ? "?page=" + page : "");
  const listing = await tcgFactoryTextFetch(pageUrl);
  const parsed = parseTcgFactoryListing(listing.html, pageUrl);
  const urls = parsed.productUrls.slice(offset, offset + 6);
  const categories = credentialsAvailable ? await spreeCategories(config) : [];
  const defs = credentialsAvailable
    ? await definitions(config)
    : new Map<string, SpreeFieldDefinition>();
  let discovered = 0;
  let processed = 0;
  let failed = 0;
  let skipped = 0;
  let consumed = 0;
  let retryBlocked = false;

  for (const url of urls) {
    let discoveredThisItem = false;
    let consumeThisItem = true;
    try {
      const publicDetail = await tcgFactoryTextFetch(url);
      const publicProduct = parseTcgFactoryPublicProduct(
        publicDetail.html,
        url,
      );
      await upsertTcgFactoryDiscovery(supplier.id, publicProduct, state.run_id);
      discoveredThisItem = true;

      if (!credentialsAvailable) continue;
      if (
        publicProduct.availability !== "available" &&
        publicProduct.availability !== "preorder"
      ) {
        await reconcileUnavailableTcgFactoryProduct(config, supplier.id, publicProduct, state.run_id, categories, defs);
        continue;
      }

      const authenticatedDetail = await tcgFactoryTextFetch(
        url,
        session ?? undefined,
      );
      const authenticatedProduct = parseTcgFactoryPublicProduct(
        authenticatedDetail.html,
        url,
      );
      if (authenticatedProduct.availability !== "available" && authenticatedProduct.availability !== "preorder") {
        await reconcileUnavailableTcgFactoryProduct(config, supplier.id, authenticatedProduct, state.run_id, categories, defs);
        continue;
      }
      const price = safeTcgFactoryB2bPrice(
        authenticatedDetail.html,
        publicProduct.referencePriceNet,
      );
      const minimumOrderQuantity = tcgFactoryMinimumOrderQuantity(
        supplier,
        publicProduct.reference ?? publicProduct.externalVariantId,
        parseTcgFactoryMinimumOrderQuantity(authenticatedDetail.html),
      );
      const rawItem = tcgFactoryCatalogItem(
        {
          ...publicProduct,
          availability: authenticatedProduct.availability,
          reportedAvailability:
            authenticatedProduct.reportedAvailability ||
            publicProduct.reportedAvailability,
        },
        price,
        minimumOrderQuantity,
      );
      await ingestCatalogItem(config, rawItem, state.run_id, categories, defs);
      processed += 1;
      await upsertTcgFactoryDiscovery(
        supplier.id,
        publicProduct,
        state.run_id,
        {
          b2bPriceValidated: true,
          ...(minimumOrderQuantity ? { minimumOrderQuantity } : {}),
        },
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const disposition = tcgFactoryItemFailureDisposition(error);
      if (disposition === "retry") {
        // A product lock is transient. Do not poison the full supplier run and
        // do not advance over this URL; retry it after the other worker exits.
        consumeThisItem = false;
        retryBlocked = true;
        console.warn("TcgFactory sync deferred by product lock", url, message);
      } else if (disposition === "skip") {
        // Distributor listings occasionally retain a dead product link. A 404
        // cannot be validated, but it must not make every crawl restart forever.
        skipped += 1;
        console.warn("TcgFactory stale listing skipped", url, message);
      } else {
        failed += 1;
        console.error("TcgFactory sync failed", url, message);
      }
    } finally {
      if (consumeThisItem) {
        consumed += 1;
        if (discoveredThisItem) discovered += 1;
      }
    }
    if (retryBlocked) break;
  }

  const cumulativeFailed = state.failed_items + failed;
  const cumulativeDiscovered = state.discovered_items + discovered;
  const cumulativeProcessed = state.processed_items + processed;
  const pageDone =
    !retryBlocked && offset + consumed >= parsed.productUrls.length;
  const nextPage = pageDone ? page + 1 : page;
  const nextOffset = pageDone ? 0 : offset + consumed;
  const fullDone =
    pageDone && parsed.productUrls.length > 0 && page >= parsed.totalPages;

  if (fullDone) {
    if (cumulativeFailed > 0) {
      const message =
        "partial_run_not_completed: " +
        String(cumulativeFailed) +
        " TcgFactory items failed validation";
      await supabase
        .from("catalog_supplier_crawl_state")
        .update({
          total_pages: parsed.totalPages,
          discovered_items: cumulativeDiscovered,
          processed_items: cumulativeProcessed,
          failed_items: cumulativeFailed,
          status: "error",
          last_error: message,
          updated_at: new Date().toISOString(),
        })
        .eq("supplier_id", supplier.id);
      await supabase
        .from("catalog_suppliers")
        .update({ last_error: message, updated_at: new Date().toISOString() })
        .eq("id", supplier.id);
      return {
        status: "error",
        page,
        discovered,
        processed,
        failed,
        cumulativeFailed,
      };
    }

    if (!credentialsAvailable) {
      const nextSyncAt = new Date(
        Date.now() + (supplier.sync_interval_hours ?? 6) * 60 * 60 * 1000,
      ).toISOString();
      await supabase
        .from("catalog_supplier_crawl_state")
        .update({
          run_id: null,
          page: 1,
          item_offset: 0,
          total_pages: parsed.totalPages,
          discovered_items: cumulativeDiscovered,
          processed_items: 0,
          failed_items: 0,
          status: "idle",
          last_error: null,
          updated_at: new Date().toISOString(),
        })
        .eq("supplier_id", supplier.id);
      await supabase
        .from("catalog_suppliers")
        .update({
          last_error: credentialsError,
          next_sync_at: nextSyncAt,
          updated_at: new Date().toISOString(),
        })
        .eq("id", supplier.id);
      return {
        status: "discovery_complete",
        credentialsConfigured: false,
        discovered: cumulativeDiscovered,
        totalPages: parsed.totalPages,
        nextSyncAt,
      };
    }

    const completed = await completeCatalogSupplierRun(config, {
      supplierCode: TCGFACTORY_SUPPLIER_CODE,
      runId: state.run_id,
    });
    await supabase
      .from("catalog_supplier_crawl_state")
      .update({
        run_id: null,
        page: 1,
        item_offset: 0,
        total_pages: parsed.totalPages,
        discovered_items: cumulativeDiscovered,
        processed_items: cumulativeProcessed,
        failed_items: 0,
        status: "idle",
        last_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq("supplier_id", supplier.id);
    return {
      status: "complete",
      credentialsConfigured: true,
      ...completed,
    };
  }

  await supabase
    .from("catalog_supplier_crawl_state")
    .update({
      page: nextPage,
      item_offset: nextOffset,
      total_pages: parsed.totalPages,
      discovered_items: cumulativeDiscovered,
      processed_items: cumulativeProcessed,
      failed_items: cumulativeFailed,
      status: "running",
      last_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq("supplier_id", supplier.id);
  await supabase
    .from("catalog_suppliers")
    .update({
      last_error: credentialsAvailable ? null : credentialsError,
      updated_at: new Date().toISOString(),
    })
    .eq("id", supplier.id);

  return {
    status: "running",
    credentialsConfigured: credentialsAvailable,
    page,
    nextPage,
    nextOffset,
    totalPages: parsed.totalPages,
    discovered,
    processed,
    failed,
    skipped,
    retryBlocked,
  };
}

async function operatorAction(
  action: string,
  req: Request,
  config: ConfigRow,
  body: Record<string, unknown>,
): Promise<Response> {
  const providedKey = req.headers.get("x-spree-admin-key") ?? "";

  if (action === "bootstrap") {
    // Reconfiguration must authenticate against the existing installation.
    if (config.spree_admin_api_key && !(await operatorAuthorized(config, providedKey))) {
      return json({ error: "unauthorized" }, 401);
    }
    const spreeApiUrl =
      typeof body.spreeApiUrl === "string" && body.spreeApiUrl
        ? body.spreeApiUrl
        : "https://bisontcg.spree.sh";
    const baseUrl =
      typeof body.baseUrl === "string" && body.baseUrl
        ? body.baseUrl
        : "https://b2bdevir.es";
    const sessionState =
      body.sessionState && typeof body.sessionState === "object"
        ? (body.sessionState as ConfigRow["session_state"])
        : null;

    // The initial key must be validated by our trusted Spree server, never by
    // a URL supplied as its own authority. Devir's destination is fixed too.
    if (spreeApiUrl.replace(/\/$/, "") !== "https://bisontcg.spree.sh" ||
        baseUrl.replace(/\/$/, "") !== "https://b2bdevir.es") {
      return json({ error: "bootstrap_untrusted_destination" }, 400);
    }

    if (!providedKey || !sessionState) {
      return json({ error: "bootstrap_missing_credentials" }, 400);
    }

    await validateSpreeAdminKey(spreeApiUrl, providedKey);

    const probeConfig: ConfigRow = {
      ...config,
      base_url: baseUrl,
      spree_api_url: spreeApiUrl,
      spree_admin_api_key: providedKey,
      session_state: sessionState,
    };
    await devirFetch(
      probeConfig,
      baseUrl.replace(/\/$/, "") + "/customer/account/",
    );

    const { error } = await supabase
      .from("devir_sync_config")
      .update({
        enabled: true,
        base_url: baseUrl,
        spree_api_url: spreeApiUrl,
        spree_admin_api_key: providedKey,
        session_state: sessionState,
        phase: "idle",
        active_cycle_id: null,
        next_due_at: new Date().toISOString(),
        lock_until: null,
        last_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", "primary");
    if (error) throw error;

    return json({
      ok: true,
      enabled: true,
      message:
        "Bootstrap validado contra Devir y Spree. Primer ciclo solicitado.",
    });
  }

  const maintenanceActions = new Set([
    "verify-devir-batch",
    "repair-categories",
    "prepare-publish-batch",
  ]);
  const maintenanceToken = req.headers.get("x-maintenance-token") ?? "";
  const maintenanceAuthorized =
    maintenanceActions.has(action) &&
    maintenanceToken.length > 20 &&
    Boolean(config.worker_token_hash) &&
    (await sha256(maintenanceToken)) === config.worker_token_hash;

  if (
    !maintenanceAuthorized &&
    !(await operatorAuthorized(config, providedKey))
  ) {
    return json({ error: "unauthorized" }, 401);
  }

  if (action === "credentials") {
    if (!(await operatorAuthorized(config, providedKey))) {
      return json({ error: "unauthorized" }, 401);
    }
    const username =
      typeof body.username === "string" ? body.username.trim() : "";
    const password = typeof body.password === "string" ? body.password : "";
    if (!username || !password)
      return json({ error: "credentials_required" }, 400);

    const { data: previousCredentials, error: previousError } =
      await supabase.rpc("devir_sync_get_credentials");
    if (previousError) throw previousError;

    const { error } = await supabase.rpc("devir_sync_set_credentials", {
      p_username: username,
      p_password: password,
    });
    if (error) throw error;

    try {
      const sessionState = await automaticDevirLogin({
        ...config,
        session_state: null,
      });
      return json({
        ok: true,
        stored: true,
        validated: true,
        session_refreshed: Boolean(sessionState?.cookies?.length),
      });
    } catch (loginError) {
      const oldUsername =
        typeof previousCredentials?.username === "string"
          ? previousCredentials.username
          : "";
      const oldPassword =
        typeof previousCredentials?.password === "string"
          ? previousCredentials.password
          : "";
      if (oldUsername && oldPassword) {
        await supabase.rpc("devir_sync_set_credentials", {
          p_username: oldUsername,
          p_password: oldPassword,
        });
      }
      throw loginError;
    }
  }

  if (action === "set-default-product-price") {
    const productId =
      typeof body.productId === "string" ? body.productId.trim() : "";
    const amount = Number(body.amount);
    if (!productId || !Number.isFinite(amount) || amount <= 0) {
      return json({ error: "product_id_and_amount_required" }, 400);
    }
    const product = await spreeRequest<SpreeProduct>(
      config,
      "PATCH",
      "/products/" + encodeURIComponent(productId),
      { price: amount },
    );
    return json({
      ok: true,
      product_id: productId,
      price: product,
    });
  }

  if (action === "status") {
    const { data: cycles, error: cyclesError } = await supabase
      .from("devir_sync_cycles")
      .select(
        "id,status,started_at,finished_at,category_count,product_count,processed_count,error_count,error",
      )
      .order("started_at", { ascending: false })
      .limit(5);
    if (cyclesError) throw cyclesError;

    const jobs = {
      pending: 0,
      done: 0,
      error: 0,
      categories: { pending: 0, done: 0, error: 0 },
      products: { pending: 0, done: 0, error: 0 },
    };
    if (config.active_cycle_id) {
      const { data: grouped, error: groupedError } = await supabase
        .from("devir_sync_jobs")
        .select("kind,status")
        .eq("cycle_id", config.active_cycle_id);
      if (groupedError) throw groupedError;

      for (const row of grouped ?? []) {
        const kind = row.kind === "category" ? "categories" : "products";
        const status = row.status as
          | "pending"
          | "done"
          | "error"
          | "processing";
        if (status === "pending" || status === "done" || status === "error") {
          jobs[kind][status] += 1;
          jobs[status] += 1;
        }
      }
    }

    return json({
      ok: true,
      config: {
        enabled: config.enabled,
        phase: config.phase,
        active_cycle_id: config.active_cycle_id,
        next_due_at: config.next_due_at,
        interval_hours: config.interval_hours,
        batch_size: config.batch_size,
        max_pages: config.max_pages,
        last_attempt_at:
          (config as ConfigRow & { last_attempt_at?: string | null })
            .last_attempt_at ?? null,
        last_success_at:
          (config as ConfigRow & { last_success_at?: string | null })
            .last_success_at ?? null,
        last_error:
          (config as ConfigRow & { last_error?: string | null }).last_error ??
          null,
      },
      jobs,
      cycles: cycles ?? [],
    });
  }

  if (action === "enable" || action === "disable") {
    const enabled = action === "enable";
    const { error } = await supabase
      .from("devir_sync_config")
      .update({
        enabled,
        ...(enabled ? { next_due_at: new Date().toISOString() } : {}),
        updated_at: new Date().toISOString(),
      })
      .eq("id", "primary");
    if (error) throw error;
    return json({ ok: true, enabled });
  }

  if (action === "run-now") {
    if (config.active_cycle_id) {
      return json({ ok: true, already_running: config.active_cycle_id });
    }
    const { error } = await supabase
      .from("devir_sync_config")
      .update({
        enabled: true,
        phase: "idle",
        next_due_at: new Date().toISOString(),
        last_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", "primary");
    if (error) throw error;
    return json({ ok: true, requested: true });
  }

  if (action === "catalog-supplier-upsert") {
    return json({ ok: true, supplier: await upsertCatalogSupplier(body) });
  }

  if (action === "catalog-ingest") {
    return json({
      ok: true,
      ...(await ingestCatalogItemsAction(config, body)),
    });
  }

  if (action === "catalog-complete-run") {
    return json({
      ok: true,
      ...(await completeCatalogSupplierRun(config, body)),
    });
  }

  if (action === "catalog-reprice-supplier") {
    return json({
      ok: true,
      ...(await repriceCatalogSupplierBatch(config, body)),
    });
  }

  if (action === "catalog-reconcile-supplier") {
    const supplierCode = normalizeSupplierCode(
      typeof body.supplierCode === "string" ? body.supplierCode : "",
    );
    if (!supplierCode) {
      return json({ error: "supplierCode_required" }, 400);
    }
    const offset = Math.max(0, Number(body.offset ?? 0) || 0);
    const limit = Math.min(100, Math.max(1, Number(body.limit ?? 50) || 50));
    const { data, error, count } = await supabase
      .from("catalog_selected_supply")
      .select("variant_id,supplier_code", { count: "exact" })
      .eq("supplier_code", supplierCode)
      .order("variant_id")
      .range(offset, offset + limit - 1);
    if (error) throw error;

    const categories = await spreeCategories(config);
    const defs = await definitions(config);
    const variantIds = Array.from(
      new Set(
        (data ?? []).map((row) => String(row.variant_id)).filter(Boolean),
      ),
    );
    const results: Array<{
      variant_id: string;
      ok: boolean;
      product_id?: string | null;
      spree_variant_id?: string | null;
      price?: number | null;
      review?: boolean;
      error?: string;
    }> = [];

    for (const variantId of variantIds) {
      try {
        const synced = await reconcileCatalogVariant(
          config,
          await loadCatalogVariant(variantId),
          categories,
          defs,
        );
        results.push({
          variant_id: variantId,
          ok: true,
          product_id: synced.productId,
          spree_variant_id: synced.variantId,
          price: synced.lastAutoPrice,
          review: synced.review,
        });
      } catch (error) {
        results.push({
          variant_id: variantId,
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return json({
      ok: results.every((result) => result.ok),
      supplierCode,
      offset,
      limit,
      total: count ?? 0,
      reconciled: results.filter((result) => result.ok).length,
      failed: results.filter((result) => !result.ok).length,
      results,
    });
  }

  if (action === "catalog-sourcing-status") {
    const limit = Math.min(200, Math.max(1, Number(body.limit ?? 50) || 50));
    const offset = Math.max(0, Number(body.offset ?? 0) || 0);
    const { data: suppliers, error: suppliersError } = await supabase
      .from("catalog_suppliers")
      .select(
        "id,code,name,adapter_key,enabled,priority,default_currency,stale_after_hours,sync_interval_hours,last_success_at,last_completed_run_id,last_error",
      )
      .order("priority")
      .order("code");
    if (suppliersError) throw suppliersError;
    const {
      data: variants,
      error: variantsError,
      count,
    } = await supabase
      .from("catalog_selected_supply")
      .select("*", { count: "exact" })
      .order("product_name")
      .range(offset, offset + limit - 1);
    if (variantsError) throw variantsError;
    return json({
      ok: true,
      suppliers: suppliers ?? [],
      variants: variants ?? [],
      total: count ?? 0,
      offset,
      limit,
    });
  }

  if (
    action === "catalog-replenishment-link-status" ||
    action === "catalog-replenishment-link-upsert" ||
    action === "catalog-replenishment-link-remove"
  ) {
    const sourceSupplierCode =
      typeof body.sourceSupplierCode === "string"
        ? normalizeSupplierCode(body.sourceSupplierCode)
        : "";
    const sourceSupplierSku =
      typeof body.sourceSupplierSku === "string"
        ? body.sourceSupplierSku.trim()
        : "";
    const targetSpreeVariantId =
      typeof body.targetSpreeVariantId === "string"
        ? body.targetSpreeVariantId.trim()
        : "";

    if (action === "catalog-replenishment-link-status") {
      let query = supabase
        .from("catalog_replenishment_links_view")
        .select("*")
        .order("target_product_name")
        .order("target_canonical_sku")
        .limit(200);
      if (sourceSupplierCode) {
        query = query.eq("source_supplier_code", sourceSupplierCode);
      }
      if (sourceSupplierSku) {
        query = query.eq("source_supplier_sku", sourceSupplierSku);
      }
      if (targetSpreeVariantId) {
        query = query.eq("target_spree_variant_id", targetSpreeVariantId);
      }
      const { data, error } = await query;
      if (error) throw error;
      return json({ ok: true, links: data ?? [] });
    }

    if (action === "catalog-replenishment-link-remove") {
      const linkId = typeof body.linkId === "string" ? body.linkId.trim() : "";
      if (!linkId) return json({ error: "linkId_required" }, 400);
      const { data, error } = await supabase
        .from("catalog_replenishment_links")
        .delete()
        .eq("id", linkId)
        .select("id")
        .maybeSingle();
      if (error) throw error;
      if (!data) return json({ error: "replenishment_link_not_found" }, 404);
      return json({ ok: true, removed: linkId });
    }

    if (!sourceSupplierCode || !sourceSupplierSku || !targetSpreeVariantId) {
      return json(
        {
          error:
            "sourceSupplierCode_sourceSupplierSku_targetSpreeVariantId_required",
        },
        400,
      );
    }

    const unitsPerSource = Number(body.unitsPerSource ?? 1);
    if (!Number.isInteger(unitsPerSource) || unitsPerSource <= 0) {
      return json({ error: "unitsPerSource_must_be_positive_integer" }, 400);
    }

    const { data: supplier, error: supplierError } = await supabase
      .from("catalog_suppliers")
      .select("id,code,name")
      .eq("code", sourceSupplierCode)
      .maybeSingle();
    if (supplierError) throw supplierError;
    if (!supplier) return json({ error: "source_supplier_not_found" }, 404);

    const { data: sourceOffers, error: sourceOffersError } = await supabase
      .from("catalog_supplier_offers")
      .select("id,supplier_sku,availability,stock_quantity,normalized_cost")
      .eq("supplier_id", supplier.id)
      .eq("supplier_sku", sourceSupplierSku)
      .limit(2);
    if (sourceOffersError) throw sourceOffersError;
    if (!sourceOffers?.length) {
      return json({ error: "source_offer_not_found" }, 404);
    }
    if (sourceOffers.length > 1) {
      return json(
        {
          error: "source_supplier_sku_ambiguous",
          detail: "Usa un SKU de proveedor que identifique una sola oferta.",
        },
        409,
      );
    }

    const { data: targetVariant, error: targetVariantError } = await supabase
      .from("catalog_variants")
      .select(
        "id,product_id,canonical_sku,name,spree_variant_id,fulfillment_mode",
      )
      .eq("spree_variant_id", targetSpreeVariantId)
      .maybeSingle();
    if (targetVariantError) throw targetVariantError;
    if (!targetVariant) return json({ error: "target_variant_not_found" }, 404);

    const note = typeof body.note === "string" ? body.note.trim() : null;
    const now = new Date().toISOString();
    const { data: link, error: linkError } = await supabase
      .from("catalog_replenishment_links")
      .upsert(
        {
          source_offer_id: sourceOffers[0].id,
          target_variant_id: targetVariant.id,
          units_per_source: unitsPerSource,
          active: body.active !== false,
          note,
          updated_at: now,
        },
        { onConflict: "source_offer_id,target_variant_id" },
      )
      .select("*")
      .single();
    if (linkError) throw linkError;

    return json({
      ok: true,
      link,
      source: {
        supplier_code: sourceSupplierCode,
        supplier_sku: sourceSupplierSku,
        availability: sourceOffers[0].availability,
        stock_quantity: sourceOffers[0].stock_quantity,
      },
      target: targetVariant,
      affects_sellability: false,
      detail:
        "El enlace documenta reposición. No crea stock, backorder ni disponibilidad de venta.",
    });
  }

  if (
    action === "catalog-review-status" ||
    action === "catalog-review-approve" ||
    action === "catalog-review-reject" ||
    action === "catalog-review-reset"
  ) {
    const requestedCatalogProductId =
      typeof body.catalogProductId === "string"
        ? body.catalogProductId.trim()
        : "";
    const requestedSpreeProductId =
      typeof body.spreeProductId === "string" ? body.spreeProductId.trim() : "";
    if (!requestedCatalogProductId && !requestedSpreeProductId) {
      return json(
        { error: "catalogProductId_or_spreeProductId_required" },
        400,
      );
    }

    let productQuery = supabase
      .from("catalog_products")
      .select(
        "id,name,spree_product_id,review_decision,approved_review_fingerprint,review_decided_at,review_note",
      );
    productQuery = requestedCatalogProductId
      ? productQuery.eq("id", requestedCatalogProductId)
      : productQuery.eq("spree_product_id", requestedSpreeProductId);
    const { data: productPolicy, error: productPolicyError } =
      await productQuery.maybeSingle();
    if (productPolicyError) throw productPolicyError;
    if (!productPolicy) return json({ error: "catalog_product_not_found" }, 404);

    const spreeProductId = String(productPolicy.spree_product_id ?? "");
    if (!spreeProductId) {
      return json({ error: "catalog_product_not_mapped_to_spree" }, 409);
    }

    const reasons = await currentCatalogReviewReasonsForSpreeProduct(
      spreeProductId,
    );
    const reasonList = Array.from(reasons).sort();
    const fingerprint = catalogReviewFingerprint(reasonList);
    const { data: variantPolicies, error: variantPoliciesError } = await supabase
      .from("catalog_variants")
      .select(
        "id,canonical_sku,name,spree_variant_id,fulfillment_mode,selected_offer_id",
      )
      .eq("product_id", productPolicy.id)
      .order("canonical_sku");
    if (variantPoliciesError) throw variantPoliciesError;

    if (action === "catalog-review-status") {
      return json({
        ok: true,
        product: productPolicy,
        reasons: reasonList,
        review_fingerprint: fingerprint,
        approval_matches:
          productPolicy.review_decision === "approved" &&
          fingerprint ===
            String(productPolicy.approved_review_fingerprint ?? ""),
        variants: variantPolicies ?? [],
      });
    }

    const now = new Date().toISOString();
    const note = typeof body.note === "string" ? body.note.trim() : null;
    let nextDecision: CatalogReviewDecision;
    let approvedReviewFingerprint: string | null = null;

    if (action === "catalog-review-approve") {
      if (!fingerprint) {
        return json({ error: "no_current_review_reasons" }, 409);
      }
      nextDecision = "approved";
      approvedReviewFingerprint = fingerprint;
    } else if (action === "catalog-review-reject") {
      nextDecision = "rejected";
    } else {
      nextDecision = "pending";
    }

    const requestedFulfillmentMode =
      typeof body.fulfillmentMode === "string"
        ? body.fulfillmentMode.trim()
        : "";
    const allowedFulfillmentModes = new Set<CatalogFulfillmentMode>([
      "supplier_or_physical",
      "physical_only",
      "disabled",
    ]);
    if (
      requestedFulfillmentMode &&
      !allowedFulfillmentModes.has(
        requestedFulfillmentMode as CatalogFulfillmentMode,
      )
    ) {
      return json({ error: "invalid_fulfillment_mode" }, 400);
    }

    if (
      action === "catalog-review-approve" &&
      reasons.has("pack_requires_operator_split") &&
      requestedFulfillmentMode === "supplier_or_physical"
    ) {
      return json(
        {
          error: "unsafe_fulfillment_mode_for_supplier_pack",
          detail:
            "Un pack pendiente de split no puede habilitar backorder de proveedor. Usa physical_only o disabled.",
        },
        409,
      );
    }

    const defaultFulfillmentMode: CatalogFulfillmentMode | null =
      action === "catalog-review-approve" &&
      reasons.has("pack_requires_operator_split")
        ? "physical_only"
        : null;
    const nextFulfillmentMode =
      (requestedFulfillmentMode as CatalogFulfillmentMode) ||
      defaultFulfillmentMode;

    const { error: decisionError } = await supabase
      .from("catalog_products")
      .update({
        review_decision: nextDecision,
        approved_review_fingerprint: approvedReviewFingerprint,
        review_decided_at: action === "catalog-review-reset" ? null : now,
        review_note: action === "catalog-review-reset" ? null : note,
        updated_at: now,
      })
      .eq("id", productPolicy.id);
    if (decisionError) throw decisionError;

    if (nextFulfillmentMode) {
      const { error: modeError } = await supabase
        .from("catalog_variants")
        .update({
          fulfillment_mode: nextFulfillmentMode,
          updated_at: now,
        })
        .eq("product_id", productPolicy.id);
      if (modeError) throw modeError;
    }

    await markCatalogProductDirty(spreeProductId);
    const prepared = await preparePublishBatch(
      config,
      0,
      1,
      spreeProductId,
    );

    const { data: refreshedProduct, error: refreshedProductError } =
      await supabase
        .from("catalog_products")
        .select(
          "id,name,spree_product_id,review_decision,approved_review_fingerprint,review_decided_at,review_note",
        )
        .eq("id", productPolicy.id)
        .single();
    if (refreshedProductError) throw refreshedProductError;
    const { data: refreshedVariants, error: refreshedVariantsError } =
      await supabase
        .from("catalog_variants")
        .select(
          "id,canonical_sku,name,spree_variant_id,fulfillment_mode,selected_offer_id",
        )
        .eq("product_id", productPolicy.id)
        .order("canonical_sku");
    if (refreshedVariantsError) throw refreshedVariantsError;

    return json({
      ok: true,
      decision: nextDecision,
      reasons: reasonList,
      review_fingerprint: fingerprint,
      fulfillment_mode_applied: nextFulfillmentMode,
      product: refreshedProduct,
      variants: refreshedVariants ?? [],
      reconciliation: prepared,
    });
  }

  if (action === "tcgfactory-credentials") {
    const email = typeof body.email === "string" ? body.email.trim() : "";
    const password = typeof body.password === "string" ? body.password : "";
    if (!email || !password) {
      return json({ ok: false, error: "credentials_required" }, 400);
    }

    await tcgFactoryLogin({ email, password });

    const { error: credentialError } = await supabase.rpc(
      "tcgfactory_sync_set_credentials",
      { p_email: email, p_password: password },
    );
    if (credentialError) throw credentialError;

    const supplier = await tcgFactorySupplierRow();
    const now = new Date().toISOString();
    const { error: crawlError } = await supabase
      .from("catalog_supplier_crawl_state")
      .upsert(
        {
          supplier_id: supplier.id,
          run_id: null,
          page: 1,
          item_offset: 0,
          total_pages: null,
          discovered_items: 0,
          processed_items: 0,
          failed_items: 0,
          status: "idle",
          last_error: null,
          started_at: null,
          updated_at: now,
        },
        { onConflict: "supplier_id" },
      );
    if (crawlError) throw crawlError;

    const { error: supplierError } = await supabase
      .from("catalog_suppliers")
      .update({
        enabled: true,
        last_error: null,
        next_sync_at: now,
        updated_at: now,
      })
      .eq("id", supplier.id);
    if (supplierError) throw supplierError;

    return json({
      ok: true,
      stored: true,
      validated: true,
      supplier: TCGFACTORY_SUPPLIER_CODE,
    });
  }

  if (action === "tcgfactory-backfill-minimum-orders") {
    const offset = Math.max(0, Number(body.offset ?? 0) || 0);
    const limit = Math.min(25, Math.max(1, Number(body.limit ?? 10) || 10));
    const dryRun = body.dryRun !== false;
    return json({
      ok: true,
      ...(await backfillTcgFactoryMinimumOrders(offset, limit, dryRun)),
    });
  }

  if (action === "tcgfactory-status") {
    return json({ ok: true, ...(await tcgFactoryStatus()) });
  }

  if (action === "tcgfactory-discover") {
    const page = Math.max(1, Number(body.page ?? 1) || 1);
    const offset = Math.max(0, Number(body.offset ?? 0) || 0);
    const limit = Math.min(12, Math.max(1, Number(body.limit ?? 6) || 6));
    return json({
      ok: true,
      ...(await tcgFactoryDiscoverPublicBatch(page, offset, limit)),
    });
  }

  if (action === "tcgfactory-run") {
    return json({ ok: true, ...(await tcgFactoryTick(config, true)) });
  }

  if (action === "tcgfactory-reset-crawl") {
    const supplier = await tcgFactorySupplierRow();
    const { error } = await supabase
      .from("catalog_supplier_crawl_state")
      .upsert(
        {
          supplier_id: supplier.id,
          run_id: null,
          page: 1,
          item_offset: 0,
          total_pages: null,
          discovered_items: 0,
          processed_items: 0,
          failed_items: 0,
          status: "idle",
          last_error: null,
          started_at: null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "supplier_id" },
      );
    if (error) throw error;
    await supabase
      .from("catalog_suppliers")
      .update({
        next_sync_at: new Date().toISOString(),
        last_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", supplier.id);
    return json({ ok: true, reset: true });
  }

  if (action === "inspect-devir-source") {
    const url = typeof body.url === "string" ? body.url.trim() : "";
    if (!url || !url.startsWith(config.base_url))
      return json({ error: "invalid_devir_url" }, 400);
    const html = await devirFetch(config, url);
    const product = parseProduct(html, url);
    const snippets = Array.from(
      new Set(
        Array.from(
          html.matchAll(
            /.{0,180}(?:Disponibilidad|stock|is_in_stock|isInStock|tocart|AddToCart|salable|saleable|data-price|price-box|old-price|special-price|regular-price).{0,320}/gi,
          ),
        )
          .map((match) => stripHtml(match[0]).slice(0, 500))
          .filter(Boolean),
      ),
    ).slice(0, 20);
    return json({
      ok: true,
      final_url: url,
      product,
      has_add_to_cart:
        /tocart|AddToCart|product-add-form|action\s+primary\s+tocart/i.test(
          html,
        ),
      snippets,
    });
  }

  if (action === "verify-devir-batch") {
    const offset = Math.max(0, Number(body.offset ?? 0) || 0);
    const limit = Math.min(100, Math.max(1, Number(body.limit ?? 50) || 50));
    return json({
      ok: true,
      ...(await verifyDevirBatch(config, offset, limit)),
    });
  }

  if (action === "repair-categories") {
    await updateReviewFieldLabels(config);
    const offset = Math.max(0, Number(body.offset ?? 0) || 0);
    const limit = Math.min(200, Math.max(1, Number(body.limit ?? 100) || 100));
    return json({
      ok: true,
      ...(await repairCategoryTreeAndMembership(config, offset, limit)),
    });
  }

  if (action === "prepare-publish-batch") {
    const offset = Math.max(0, Number(body.offset ?? 0) || 0);
    const limit = Math.min(50, Math.max(1, Number(body.limit ?? 20) || 20));
    return json({
      ok: true,
      ...(await preparePublishBatch(config, offset, limit)),
    });
  }

  if (action === "repair-sellability-batch") {
    const limit = Math.min(50, Math.max(1, Number(body.limit ?? 20) || 20));
    return json({
      ok: true,
      ...(await repairSellabilityBatch(config, limit)),
    });
  }

  if (action === "repair-physical-only-stock") {
    const limit = Math.min(200, Math.max(1, Number(body.limit ?? 100) || 100));
    return json({
      ok: true,
      ...(await reconcilePhysicalOnlyCatalogBatch(config, limit)),
    });
  }

  if (action === "repair-tcgfactory-images") {
    const offset = Math.max(0, Number(body.offset ?? 0) || 0);
    const limit = Math.min(100, Math.max(1, Number(body.limit ?? 25) || 25));
    const dryRun = body.dryRun !== false;
    return json({
      ok: true,
      ...(await repairTcgFactoryImagesBatch(config, offset, limit, dryRun)),
    });
  }

  if (action === "repair-tcgfactory-sellability") {
    const offset = Math.max(0, Number(body.offset ?? 0) || 0);
    const limit = Math.min(100, Math.max(1, Number(body.limit ?? 50) || 50));
    return json({
      ok: true,
      ...(await repairTcgFactorySellabilityBatch(config, offset, limit)),
    });
  }

  if (action === "repair-retail-unit-products") {
    return json({ ok: true, ...(await repairRetailUnitProducts(config)) });
  }

  if (action === "hide-catalog-policy-violations") {
    return json({
      ok: true,
      ...(await hideCatalogPolicyViolations(config)),
    });
  }

  if (action === "clean-catalog-titles") {
    const limit = Math.min(100, Math.max(1, Number(body.limit ?? 50) || 50));
    return json({
      ok: true,
      ...(await cleanCatalogTitlesBatch(config, limit)),
    });
  }

  if (action === "special-pricing-setup") {
    const code =
      typeof body.code === "string" ? body.code.trim().toUpperCase() : "BISON3";
    return json({
      ok: true,
      ...(await syncSpecialPricingProgram(config, code, true)),
    });
  }

  if (action === "special-pricing-status") {
    const code =
      typeof body.code === "string" ? body.code.trim().toUpperCase() : "BISON3";
    const program = await getSpecialProgram(code);
    const { data: requests, error } = await supabase
      .from("special_pricing_requests")
      .select("id,spree_customer_id,email,status,requested_at,decided_at,note")
      .eq("program_code", code)
      .order("requested_at", { ascending: false });
    if (error) throw error;
    return json({ ok: true, program, requests: requests ?? [] });
  }

  if (
    action === "special-pricing-approve" ||
    action === "special-pricing-reject"
  ) {
    const requestId =
      typeof body.requestId === "string" ? body.requestId.trim() : "";
    if (!requestId) return json({ error: "request_id_required" }, 400);
    const status =
      action === "special-pricing-approve" ? "approved" : "rejected";
    const { data: requestRow, error } = await supabase
      .from("special_pricing_requests")
      .update({
        status,
        decided_at: new Date().toISOString(),
        note: typeof body.note === "string" ? body.note : null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", requestId)
      .select("program_code")
      .single();
    if (error) throw error;
    return json({
      ok: true,
      status,
      ...(await syncSpecialPricingProgram(
        config,
        String(requestRow.program_code),
        false,
      )),
    });
  }

  if (action === "special-pricing-set-margin") {
    const code =
      typeof body.code === "string" ? body.code.trim().toUpperCase() : "BISON3";
    const targetMargin = Number(body.targetMargin);
    if (
      !Number.isFinite(targetMargin) ||
      targetMargin < 0 ||
      targetMargin >= 0.95
    ) {
      return json({ error: "invalid_target_margin" }, 400);
    }
    const { error } = await supabase
      .from("special_pricing_programs")
      .update({
        target_margin: targetMargin,
        updated_at: new Date().toISOString(),
      })
      .eq("code", code);
    if (error) throw error;
    return json({
      ok: true,
      ...(await syncSpecialPricingProgram(config, code, true)),
    });
  }

  if (action === "catalog-pricing-setup") {
    const categories = await setupCatalogCategoriesAndMargins(config);
    return json({ ok: true, categories });
  }

  if (action === "daily-offers-status") {
    return json({ ok: true, state: await dailyOfferState() });
  }

  if (action === "daily-offers-rotate") {
    return json({
      ok: true,
      ...(await rotateDailyOffers(config, body.force === true)),
    });
  }

  if (action === "merchandising-offers") {
    const offers = Array.isArray(body.offers) ? body.offers : [];
    return json({
      ok: true,
      ...(await applyMerchandisingOffers(config, offers)),
    });
  }

  if (action === "categorize-drafts") {
    const offset = Math.max(0, Number(body.offset ?? 0) || 0);
    const limit = Math.min(100, Math.max(1, Number(body.limit ?? 50) || 50));
    return json({
      ok: true,
      ...(await categorizeDraftBatch(config, offset, limit)),
    });
  }

  if (action === "reprice-commercial-books") {
    const offset = Math.max(0, Number(body.offset ?? 0) || 0);
    const limit = Math.min(100, Math.max(1, Number(body.limit ?? 50) || 50));
    return json({
      ok: true,
      ...(await repriceCommercialBooksBatch(config, offset, limit)),
    });
  }

  if (action === "normalize-manga-group-metadata") {
    const groupKeys = Array.isArray(body.groupKeys)
      ? body.groupKeys
          .filter((value): value is string => typeof value === "string")
          .map((value) => value.trim())
          .filter(Boolean)
      : [];
    if (!groupKeys.length) {
      return json({ error: "groupKeys_required" }, 400);
    }
    return json({
      ok: true,
      results: await normalizeMangaGroupProductMetadata(config, groupKeys),
    });
  }

  if (action === "repair-manga-groups") {
    const requested = Array.isArray(body.groupKeys)
      ? body.groupKeys
          .filter((value): value is string => typeof value === "string")
          .map((value) => value.trim())
          .filter(Boolean)
          .slice(0, 10)
      : [];
    if (requested.length === 0) {
      return json({ error: "groupKeys_required" }, 400);
    }
    const results = [];
    for (const groupKey of requested) {
      try {
        results.push(await migrateCatalogGroup(config, groupKey));
      } catch (error) {
        results.push({
          ok: false,
          group_key: groupKey,
          error: error instanceof Error ? error.message : JSON.stringify(error),
        });
      }
    }
    return json({
      ok: results.every((result) => result.ok === true),
      results,
    });
  }

  if (action === "regroup-preview") {
    const { data, error } = await supabase
      .from("devir_sync_catalog")
      .select(
        "group_key,group_name,variant_position,variant_label,spree_product_id",
      )
      .eq("item_kind", "variant_candidate")
      .eq("grouping_confidence", "high")
      .not("group_key", "is", null)
      .order("group_key");
    if (error) throw error;

    const groups = new Map<
      string,
      { name: string; count: number; positions: Map<number, number> }
    >();
    for (const row of data ?? []) {
      const key = String(row.group_key);
      const current = groups.get(key) ?? {
        name: String(row.group_name ?? key),
        count: 0,
        positions: new Map<number, number>(),
      };
      current.count += 1;
      const pos = Number(row.variant_position ?? -1);
      current.positions.set(pos, (current.positions.get(pos) ?? 0) + 1);
      groups.set(key, current);
    }
    return json({
      ok: true,
      groups: Array.from(groups.entries())
        .filter(([, value]) => value.count >= 2)
        .map(([group_key, value]) => ({
          group_key,
          group_name: value.name,
          variants: value.count,
          duplicate_positions: Array.from(value.positions.entries())
            .filter(([, count]) => count > 1)
            .map(([position]) => position),
        })),
    });
  }

  if (action === "regroup") {
    return json(
      {
        error: "legacy_regroup_disabled",
        detail:
          "El agrupado debe declararse en el adaptador con productName y options para conservar las identidades canónicas.",
      },
      409,
    );
  }

  if (action === "regroup-language") {
    return json(
      {
        error: "legacy_regroup_disabled",
        detail:
          "El idioma debe declararse como opción del adaptador para conservar las identidades canónicas.",
      },
      409,
    );
  }

  return json({ error: "unknown_action" }, 400);
}

async function startCycle(config: ConfigRow): Promise<string> {
  const home = await devirFetch(config, config.base_url + "/");
  const categories = discoverCategories(home, config.base_url);
  const { data: cycle, error: cycleError } = await supabase
    .from("devir_sync_cycles")
    .insert({ status: "running", category_count: categories.length })
    .select("id")
    .single();
  if (cycleError) throw cycleError;
  const rows = categories.map((url) => ({
    cycle_id: cycle.id,
    kind: "category",
    url,
    page: 1,
    status: "pending",
  }));
  if (rows.length) {
    const { error } = await supabase.from("devir_sync_jobs").upsert(rows, {
      onConflict: "cycle_id,kind,url,page",
      ignoreDuplicates: true,
    });
    if (error) throw error;
  }
  const { error: configError } = await supabase
    .from("devir_sync_config")
    .update({
      phase: "categories",
      active_cycle_id: cycle.id,
      last_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", "primary");
  if (configError) throw configError;
  return cycle.id;
}

async function processCategories(
  config: ConfigRow,
  cycleId: string,
): Promise<{ done: boolean; processed: number }> {
  await recoverExpiredCycleJobs(cycleId);
  const { data: jobs, error } = await supabase
    .from("devir_sync_jobs")
    .select("id,cycle_id,kind,url,page,attempts")
    .eq("cycle_id", cycleId)
    .eq("kind", "category")
    .eq("status", "pending")
    .order("id")
    .limit(config.batch_size);
  if (error) throw error;
  if (!jobs?.length) return { done: true, processed: 0 };

  let processed = 0;
  for (const job of jobs as JobRow[]) {
    await supabase
      .from("devir_sync_jobs")
      .update({
        status: "processing",
        attempts: job.attempts + 1,
        updated_at: new Date().toISOString(),
      })
      .eq("id", job.id);
    try {
      const url = new URL(job.url);
      if (job.page > 1) url.searchParams.set("p", String(job.page));
      const html = await devirFetch(config, url.toString());
      const links = productLinks(html, url.toString());
      if (links.length) {
        const productRows = links.map((productUrl) => ({
          cycle_id: cycleId,
          kind: "product",
          url: productUrl,
          page: 1,
          status: "pending",
        }));
        await supabase.from("devir_sync_jobs").upsert(productRows, {
          onConflict: "cycle_id,kind,url,page",
          ignoreDuplicates: true,
        });
        if (job.page < config.max_pages) {
          await supabase.from("devir_sync_jobs").upsert(
            {
              cycle_id: cycleId,
              kind: "category",
              url: job.url,
              page: job.page + 1,
              status: "pending",
            },
            { onConflict: "cycle_id,kind,url,page", ignoreDuplicates: true },
          );
        }
      }
      await supabase
        .from("devir_sync_jobs")
        .update({
          status: "done",
          payload: { links: links.length },
          updated_at: new Date().toISOString(),
        })
        .eq("id", job.id);
      processed += 1;
    } catch (err) {
      await supabase
        .from("devir_sync_jobs")
        .update({
          status: "error",
          error: String(err),
          updated_at: new Date().toISOString(),
        })
        .eq("id", job.id);
    }
  }
  return { done: false, processed };
}

async function processProducts(
  config: ConfigRow,
  cycleId: string,
): Promise<{
  done: boolean;
  processed: number;
  images: number;
  reviews: number;
}> {
  await recoverExpiredCycleJobs(cycleId);
  const { data: jobs, error } = await supabase
    .from("devir_sync_jobs")
    .select("id,cycle_id,kind,url,page,attempts")
    .eq("cycle_id", cycleId)
    .eq("kind", "product")
    .eq("status", "pending")
    .order("id")
    .limit(config.batch_size);
  if (error) throw error;
  if (!jobs?.length) return { done: true, processed: 0, images: 0, reviews: 0 };

  const categories = await spreeCategories(config);
  const defs = await definitions(config);
  let processed = 0;
  let images = 0;
  let reviews = 0;

  for (const job of jobs as JobRow[]) {
    await supabase
      .from("devir_sync_jobs")
      .update({
        status: "processing",
        attempts: job.attempts + 1,
        updated_at: new Date().toISOString(),
      })
      .eq("id", job.id);
    try {
      const html = await devirFetch(config, job.url);
      const product = parseProduct(html, job.url);
      if (!product) throw new Error("Ficha sin SKU reconocible");
      const signature = await sha256(product.imageUrls.join("\n"));
      const grouping = groupingInfo(product);
      const packRequiresSplit = isPack(product);
      const { synced } = await ingestCatalogItem(
        config,
        devirCatalogItem(product),
        cycleId,
        categories,
        defs,
      );
      const now = new Date().toISOString();
      const { error: catalogError } = await supabase
        .from("devir_sync_catalog")
        .upsert(
          {
            supplier_sku: product.sku,
            source_url: product.url,
            name: product.name,
            snapshot: product,
            image_urls: product.imageUrls,
            image_signature: signature,
            spree_product_id: synced.productId,
            spree_variant_id: synced.variantId,
            ...(synced.lastAutoPrice !== null
              ? { last_auto_price: synced.lastAutoPrice }
              : {}),
            supplier_status: product.availability,
            missing_cycles: 0,
            item_kind: grouping.itemKind,
            group_key: grouping.groupKey,
            group_name: grouping.groupName,
            variant_label: grouping.variantLabel,
            variant_position: grouping.variantPosition,
            grouping_confidence: grouping.confidence,
            ...(languageGroupingInfo(product)
              ? {
                  language_group_key: languageGroupingInfo(product)!.groupKey,
                  language_label: languageGroupingInfo(product)!.language,
                  language_base_name: languageGroupingInfo(product)!.baseName,
                }
              : {
                  language_group_key: null,
                  language_label: null,
                  language_base_name: null,
                }),
            ...(product.availability === "available"
              ? { last_confirmed_available_at: now }
              : {}),
            title_cleanup_version: "devir-title-v3",
            last_seen_cycle_id: cycleId,
            last_seen_at: now,
            last_synced_at: now,
            ...(packRequiresSplit
              ? synced.review
                ? {
                    catalog_state: "review",
                    catalog_version: null,
                    catalog_prepared_at: null,
                    last_error:
                      "REVIEW: " +
                      (synced.reviewReasons.length
                        ? synced.reviewReasons.join(", ")
                        : "pack_requires_operator_split"),
                  }
                : {
                    catalog_state:
                      product.availability === "available"
                        ? "published"
                        : product.availability === "preorder"
                          ? "preorder"
                          : "waiting_supplier",
                    catalog_version: "devir-taxonomy-v2",
                    catalog_prepared_at: now,
                    last_error: null,
                  }
              : { last_error: null }),
            updated_at: now,
          },
          { onConflict: "supplier_sku" },
        );
      if (catalogError) throw catalogError;
      await supabase
        .from("devir_sync_jobs")
        .update({
          status: "done",
          payload: {
            sku: product.sku,
            images: synced.images,
            review: synced.review,
            backorder_items: synced.backorderItems,
            selected_supplier: synced.selectedSupplierCode,
          },
          updated_at: new Date().toISOString(),
        })
        .eq("id", job.id);
      processed += 1;
      images += synced.images;
      if (synced.review) reviews += 1;
    } catch (err) {
      const message = String(err);
      const lockContention =
        message.includes("está siendo sincronizado por otro worker");
      const canRetryLock = lockContention && job.attempts + 1 < 5;
      await supabase
        .from("devir_sync_jobs")
        .update({
          status: canRetryLock ? "pending" : "error",
          error: canRetryLock ? null : message,
          updated_at: new Date().toISOString(),
        })
        .eq("id", job.id);
    }
  }
  return { done: false, processed, images, reviews };
}

async function retireMissingDevirOffers(config: ConfigRow, cycleId: string): Promise<void> {
  // A completed full crawl is the only safe moment to infer that a supplier SKU
  // disappeared. Missing once is recorded; it is not treated as deletion.
  const nowIso = new Date().toISOString();
  const { error: seenResetError } = await supabase
    .from("devir_sync_catalog")
    .update({ missing_cycles: 0 })
    .eq("last_seen_cycle_id", cycleId);
  if (seenResetError) throw seenResetError;

  const { data: missingRows, error: missingReadError } = await supabase
    .from("devir_sync_catalog")
    .select("supplier_sku,missing_cycles,spree_product_id,spree_variant_id")
    .or(`last_seen_cycle_id.is.null,last_seen_cycle_id.neq.${cycleId}`);
  if (missingReadError) throw missingReadError;

  const devirSupplier = await configuredCatalogSupplier("devir");
  const affectedVariantIds = new Set<string>();

  for (const row of missingRows ?? []) {
    const missingCycles = Number(row.missing_cycles ?? 0) + 1;
    const missing = missingCycles >= 2;
    const { error } = await supabase
      .from("devir_sync_catalog")
      .update({
        missing_cycles: missingCycles,
        supplier_status: missing ? "missing" : "unknown",
        updated_at: nowIso,
      })
      .eq("supplier_sku", row.supplier_sku);
    if (error) throw error;

    // A SKU absent from two complete supplier crawls can no longer be selected
    // from Devir. Reconciliation may immediately choose another distributor.
    if (missing) {
      const { data: retiredOffers, error: retiredError } = await supabase
        .from("catalog_supplier_offers")
        .update({
          active: false,
          availability: "unavailable",
          missing_runs: missingCycles,
          updated_at: nowIso,
        })
        .eq("supplier_id", devirSupplier.id)
        .eq("external_variant_id", row.supplier_sku)
        .select("variant_id");
      if (retiredError) throw retiredError;
      for (const offer of retiredOffers ?? []) {
        if (offer.variant_id) affectedVariantIds.add(String(offer.variant_id));
      }
      if (!retiredOffers?.length && row.spree_variant_id) {
        await syncBackorderability(
          config,
          row.spree_product_id ? String(row.spree_product_id) : null,
          String(row.spree_variant_id),
          "unavailable",
        );
      }
    }
  }

  if (affectedVariantIds.size > 0) {
    const categories = await spreeCategories(config);
    const defs = await definitions(config);
    for (const variantId of affectedVariantIds) {
      await reconcileCatalogVariant(
        config,
        await loadCatalogVariant(variantId),
        categories,
        defs,
      );
    }
  }

}

async function recoverExpiredCycleJobs(cycleId: string): Promise<void> {
  const cutoff = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const { error } = await supabase
    .from("devir_sync_jobs")
    .update({
      status: "pending",
      error: null,
      updated_at: new Date().toISOString(),
    })
    .eq("cycle_id", cycleId)
    .eq("status", "processing")
    .lt("updated_at", cutoff);
  if (error) throw error;
}

async function finishCycle(config: ConfigRow, cycleId: string): Promise<boolean> {
  const { count: inProgress, error: jobsError } = await supabase
    .from("devir_sync_jobs")
    .select("id", { head: true, count: "exact" })
    .eq("cycle_id", cycleId)
    .in("status", ["pending", "processing"]);
  if (jobsError) throw jobsError;
  if (inProgress === null || inProgress === undefined) throw new Error("No se pudo comprobar el ciclo");
  if (inProgress > 0) return false;

  const { count: errors, error: errorsError } = await supabase
    .from("devir_sync_jobs")
    .select("id", { head: true, count: "exact" })
    .eq("cycle_id", cycleId)
    .eq("status", "error");
  if (errorsError) throw errorsError;
  if (errors === null || errors === undefined) throw new Error("No se pudieron comprobar los errores del ciclo");
  const { count: products, error: productsError } = await supabase
    .from("devir_sync_jobs")
    .select("id", { head: true, count: "exact" })
    .eq("cycle_id", cycleId)
    .eq("kind", "product");
  if (productsError) throw productsError;
  // A failed crawl must schedule another attempt without treating unseen SKUs
  // as missing. In-flight jobs are handled above and must not close the cycle.
  if (errors === 0) await retireMissingDevirOffers(config, cycleId);

  const now = new Date();
  const next = new Date(now.getTime() + config.interval_hours * 60 * 60 * 1000);
  await supabase
    .from("devir_sync_cycles")
    .update({
      status: (errors ?? 0) > 0 ? "error" : "success",
      finished_at: now.toISOString(),
      product_count: products ?? 0,
      error_count: errors ?? 0,
    })
    .eq("id", cycleId);
  await supabase
    .from("devir_sync_config")
    .update({
      phase: "idle",
      active_cycle_id: null,
      next_due_at: next.toISOString(),
      last_success_at: (errors ?? 0) > 0 ? undefined : now.toISOString(),
      last_error:
        (errors ?? 0) > 0
          ? String(errors) + " jobs terminaron con error"
          : null,
      updated_at: now.toISOString(),
    })
    .eq("id", "primary");
  const { error: supplierSyncError } = await supabase
    .from("catalog_suppliers")
    .update({
      next_sync_at: next.toISOString(),
      last_success_at: (errors ?? 0) > 0 ? undefined : now.toISOString(),
      last_completed_run_id: errors > 0 ? undefined : cycleId,
      last_error:
        (errors ?? 0) > 0
          ? String(errors) + " jobs terminaron con error"
          : null,
      updated_at: now.toISOString(),
    })
    .eq("code", "devir");
  if (supplierSyncError) throw supplierSyncError;
  return true;
}

async function processDevirCycleTick(config: ConfigRow): Promise<Response> {
  let cycleId = config.active_cycle_id;
  let phase = config.phase;

  if (!cycleId) {
    cycleId = await startCycle(config);
    phase = "categories";
  }

  if (phase === "categories") {
    const categoryResult = await processCategories(config, cycleId);
    const productResult = await processProducts(config, cycleId);

    if (categoryResult.done && productResult.done) {
      if (!(await finishCycle(config, cycleId))) {
        return json({
          ok: true,
          cycle_id: cycleId,
          phase,
          waiting: "unfinished_jobs",
        });
      }
      return json({
        ok: true,
        cycle_id: cycleId,
        phase: "complete",
        categories_processed: categoryResult.processed,
        products_processed: productResult.processed,
        images: productResult.images,
        reviews: productResult.reviews,
      });
    }

    if (categoryResult.done) {
      await supabase
        .from("devir_sync_config")
        .update({ phase: "products", updated_at: new Date().toISOString() })
        .eq("id", "primary");
    }

    return json({
      ok: true,
      cycle_id: cycleId,
      phase: categoryResult.done ? "products" : "categories",
      categories_processed: categoryResult.processed,
      products_processed: productResult.processed,
      images: productResult.images,
      reviews: productResult.reviews,
    });
  }

  if (phase === "products") {
    const result = await processProducts(config, cycleId);
    if (result.done) {
      if (!(await finishCycle(config, cycleId))) {
        return json({
          ok: true,
          cycle_id: cycleId,
          phase,
          waiting: "unfinished_jobs",
        });
      }
      return json({ ok: true, cycle_id: cycleId, phase: "complete" });
    }
    return json({
      ok: true,
      cycle_id: cycleId,
      phase: "products",
      processed: result.processed,
      images: result.images,
      reviews: result.reviews,
    });
  }

  return json(
    {
      ok: false,
      cycle_id: cycleId,
      phase,
      error: "cycle_not_runnable",
    },
    409,
  );
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }

  const { data: configData, error: configError } = await supabase
    .from("devir_sync_config")
    .select("*")
    .eq("id", "primary")
    .single();
  if (configError)
    return json({ error: "config", detail: configError.message }, 500);
  const config = configData as ConfigRow;

  const action = typeof body.action === "string" ? body.action : null;
  if (action) {
    try {
      return await operatorAction(action, req, config, body);
    } catch (error) {
      const detail =
        error instanceof Error
          ? error.message
          : error && typeof error === "object"
            ? JSON.stringify(error)
            : String(error);
      return json({ ok: false, error: detail }, 400);
    }
  }

  const token = req.headers.get("x-devir-worker-token") ?? "";
  if (
    !token ||
    !config.worker_token_hash ||
    (await sha256(token)) !== config.worker_token_hash
  ) {
    return json({ error: "unauthorized" }, 401);
  }

  const lockToken = crypto.randomUUID();
  const { data: lock, error: lockError } = await supabase.rpc(
    "devir_sync_acquire_lock",
    { p_token: lockToken, p_seconds: 240 },
  );
  if (lockError) return json({ error: "lock", detail: lockError.message }, 500);
  if (!lock) return json({ ok: true, skipped: "locked" });

  try {
    if (!config.spree_admin_api_key) {
      return json({ ok: false, skipped: "bootstrap_required" }, 409);
    }

    const runnableActiveCycle =
      Boolean(config.active_cycle_id) &&
      (config.phase === "categories" || config.phase === "products");
    const newCycleDue =
      !config.active_cycle_id &&
      new Date(config.next_due_at).getTime() <= Date.now();
    if (
      config.enabled &&
      Boolean(config.session_state) &&
      (runnableActiveCycle || newCycleDue)
    ) {
      // Supplier crawling is the primary job of this worker. Run it before
      // optional catalog maintenance so a slow repair task cannot starve the
      // active crawl and leave supplier freshness permanently stale.
      return await processDevirCycleTick(config);
    }

    const reviewMarkers = await refreshHumanReviewMarkersBatch(config);
    const staleReconciliation = await reconcileStaleCatalogBatch(config);
    const physicalOnlyReconciliation =
      await reconcilePhysicalOnlyCatalogBatch(config);
    let tcgFactoryResult: Record<string, unknown>;
    try {
      tcgFactoryResult = await tcgFactoryTick(config);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("TcgFactory scheduled sync failed", message);
      try {
        const supplier = await tcgFactorySupplierRow();
        await supabase
          .from("catalog_suppliers")
          .update({ last_error: message, updated_at: new Date().toISOString() })
          .eq("id", supplier.id);
      } catch {
        // Supplier registration/migration may still be in progress.
      }
      tcgFactoryResult = { status: "error", error: message };
    }

    let dailyOffersResult: Record<string, unknown>;
    try {
      dailyOffersResult = await rotateDailyOffers(config);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("Daily offer rotation failed", message);
      await supabase
        .from("catalog_daily_offer_state")
        .upsert(
          {
            id: "primary",
            last_error: message,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "id" },
        );
      dailyOffersResult = { status: "error", error: message };
    }

    if (!config.enabled) {
      return json({
        ok: true,
        skipped: "disabled",
        catalog_reconciliation: staleReconciliation,
        physical_only_reconciliation: physicalOnlyReconciliation,
        review_markers: reviewMarkers,
        tcgfactory: tcgFactoryResult,
        daily_offers: dailyOffersResult,
      });
    }
    if (!config.session_state) {
      return json({ ok: false, skipped: "bootstrap_required" }, 409);
    }

    if (config.active_cycle_id) {
      return json(
        {
          ok: false,
          cycle_id: config.active_cycle_id,
          phase: config.phase,
          error: configData.last_error ?? "cycle_not_runnable",
        },
        409,
      );
    }

    return json({
      ok: true,
      skipped: "not_due",
      next_due_at: config.next_due_at,
      review_markers: reviewMarkers,
      catalog_reconciliation: staleReconciliation,
      physical_only_reconciliation: physicalOnlyReconciliation,
      tcgfactory: tcgFactoryResult,
      daily_offers: dailyOffersResult,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await supabase
      .from("devir_sync_config")
      .update({
        phase: "error",
        last_error: message,
        updated_at: new Date().toISOString(),
      })
      .eq("id", "primary");
    if (config.active_cycle_id) {
      await supabase
        .from("devir_sync_cycles")
        .update({
          status: "error",
          error: message,
          finished_at: new Date().toISOString(),
        })
        .eq("id", config.active_cycle_id);
    }
    return json({ ok: false, error: message }, 500);
  } finally {
    await supabase.rpc("devir_sync_release_lock", { p_token: lockToken });
  }
});
