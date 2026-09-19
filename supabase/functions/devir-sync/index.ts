import { createClient } from "npm:@supabase/supabase-js@2.57.4";

type Json = Record<string, unknown>;

interface ConfigRow {
  id: string;
  enabled: boolean;
  base_url: string;
  spree_api_url: string;
  spree_admin_api_key: string | null;
  session_state: { cookies?: Array<{ name: string; value: string; domain: string; path?: string; expires?: number }> } | null;
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
  price?: { amount?: string | number | null; currency?: string | null } | string | number | null;
  prices?: Array<{ amount?: string | number | null; currency?: string | null }>;
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
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
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
  return decodeHtml(value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim());
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
      const hostOk = target.hostname === domain || target.hostname.endsWith("." + domain);
      const pathOk = target.pathname.startsWith(cookie.path || "/");
      const expiryOk = !cookie.expires || cookie.expires < 0 || cookie.expires > nowSeconds;
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
    (current?.cookies ?? []).map((cookie) => [cookie.name + "|" + cookie.domain + "|" + (cookie.path || "/"), cookie]),
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
    if (!value || expires === 0 || (expires > 0 && expires < Date.now() / 1000)) map.delete(key);
    else map.set(key, { name, value, domain, path, expires });
  }

  return { ...(current ?? {}), cookies: Array.from(map.values()) };
}

async function automaticDevirLogin(config: ConfigRow): Promise<ConfigRow["session_state"]> {
  const { data: credentials, error: credentialsError } = await supabase.rpc("devir_sync_get_credentials");
  if (credentialsError) throw credentialsError;
  const username = typeof credentials?.username === "string" ? credentials.username : "";
  const password = typeof credentials?.password === "string" ? credentials.password : "";
  if (!username || !password) {
    throw new Error("SESSION_EXPIRED: faltan credenciales Devir en Supabase Vault. Ejecuta pnpm devir:cloud:credentials.");
  }

  const loginUrl = config.base_url.replace(/\/$/, "") + "/customer/account/login/";
  const loginPage = await fetch(loginUrl, {
    redirect: "follow",
    headers: {
      accept: "text/html,application/xhtml+xml",
      "accept-language": "es-ES,es;q=0.9",
      "user-agent": "BisonTCG catalog sync/1.0",
    },
  });
  const loginHtml = await loginPage.text();
  if (!loginPage.ok) throw new Error("LOGIN_FAILED: Devir devolvió HTTP " + loginPage.status);

  let state = mergeSessionCookies(config.session_state, parseSetCookies(loginPage.headers), config.base_url);
  const formKey =
    loginHtml.match(/name=["']form_key["'][^>]*value=["']([^"']+)["']/i)?.[1] ??
    loginHtml.match(/value=["']([^"']+)["'][^>]*name=["']form_key["']/i)?.[1] ??
    "";
  const actionRaw =
    loginHtml.match(/<form\b[^>]*id=["']login-form["'][^>]*action=["']([^"']+)["']/i)?.[1] ??
    loginHtml.match(/<form\b[^>]*action=["']([^"']*customer\/account\/loginPost[^"']*)["']/i)?.[1] ??
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
  state = mergeSessionCookies(state, parseSetCookies(loginResponse.headers), config.base_url);

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
  if (!probe.ok || /customer\/account\/login|form-login|customer-login/i.test(probe.url + " " + probeHtml.slice(0, 12000))) {
    const visibleError = stripHtml(
      probeHtml.match(/<[^>]*class=["'][^"']*(?:message-error|messages|mage-error)[^"']*["'][^>]*>[\s\S]*?<\/[^>]+>/i)?.[0] ?? "",
    ).slice(0, 180);
    const captcha =
      /captcha|recaptcha|hcaptcha|cloudflare|turnstile/i.test(probeHtml + " " + loginHtml);
    const reason = captcha
      ? "Devir exige CAPTCHA/anti-bot o interacción adicional."
      : visibleError
        ? visibleError
        : "Devir mantuvo la pantalla de login tras enviar el formulario.";
    throw new Error("LOGIN_FAILED: " + reason);
  }
  state = mergeSessionCookies(state, parseSetCookies(probe.headers), config.base_url);

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

async function devirFetch(config: ConfigRow, url: string, retryLogin = true): Promise<string> {
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
  if (!response.ok) throw new Error("Devir HTTP " + response.status + " en " + url);
  if (/customer\/account\/login|form-login|customer-login/i.test(response.url + " " + html.slice(0, 12000))) {
    if (!retryLogin) throw new Error("SESSION_EXPIRED: la sesión B2B no pudo renovarse automáticamente.");
    const sessionState = await automaticDevirLogin(config);
    return await devirFetch({ ...config, session_state: sessionState }, url, false);
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
    html.match(/<nav\b[^>]*(?:navigation|data-action=["']navigation)[^>]*>[\s\S]*?<\/nav>/i)?.[0] ??
    html.match(/<div\b[^>]*class=["'][^"']*navigation[^"']*["'][^>]*>[\s\S]*?<\/div>/i)?.[0] ??
    html;
  const origin = new URL(baseUrl).origin;
  const excluded = ["/customer", "/checkout", "/catalogsearch", "/search", "/wishlist", "/sales", "/contact", "/privacy", "/cookie", "/cart", "/actualidad"];
  const values = anchorHrefs(nav)
    .map(({ href }) => absoluteUrl(href, baseUrl))
    .filter((url): url is string => Boolean(url))
    .filter((value) => {
      const url = new URL(value);
      if (url.origin !== origin) return false;
      const path = url.pathname.replace(/\/+$/, "");
      if (!path) return false;
      return !excluded.some((prefix) => path === prefix || path.startsWith(prefix + "/"));
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
  return tag.match(new RegExp("\\b" + name + "\\s*=\\s*[\"']([^\"']+)[\"']", "i"))?.[1] ?? null;
}

function parsePriceTag(html: string, typePattern: RegExp): number | null {
  for (const match of html.matchAll(/<[^>]+data-price-(?:type|amount)=[^>]+>/gi)) {
    const tag = match[0];
    const type = attribute(tag, "data-price-type") ?? "";
    if (!typePattern.test(type)) continue;
    const raw = attribute(tag, "data-price-amount");
    if (!raw) continue;
    const parsed = Number(raw.replace(",", "."));
    if (Number.isFinite(parsed)) return Number.isInteger(parsed) && Math.abs(parsed) >= 1000 ? parsed / 100 : parsed;
  }
  return null;
}

function releaseDate(html: string): string | null {
  const text = stripHtml(html.match(/<[^>]*class=["'][^"']*product-item-dateavl[^"']*["'][^>]*>[\s\S]*?<\/[^>]+>/i)?.[0] ?? "");
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
  for (const match of html.matchAll(/"(?:img|full)"\s*:\s*"([^"]+)"/gi)) found.push(match[1]);
  for (const match of html.matchAll(/<img\b[^>]*(?:gallery|fotorama|product-image)[^>]*>/gi)) {
    const tag = match[0];
    const value = attribute(tag, "data-full") ?? attribute(tag, "data-src") ?? attribute(tag, "src");
    if (value) found.push(value);
  }
  return Array.from(new Set(found
    .map((value) => absoluteUrl(value, sourceUrl))
    .filter((value): value is string => Boolean(value))
    .filter((value) => !/logo|placeholder|loading|spinner/i.test(value))))
    .slice(0, 12);
}

function parseAvailability(html: string): {
  availability: DevirProduct["availability"];
  label: string | null;
} {
  const signals: Array<{ className: string; text: string }> = [];
  for (const match of html.matchAll(/<([^\s>]+)\b[^>]*class=["']([^"']*\bstock\b[^"']*)["'][^>]*>[\s\S]*?<\/\1>/gi)) {
    signals.push({ className: match[2] ?? "", text: stripHtml(match[0]) });
  }

  const combined = signals.map((s) => `${s.className} ${s.text}`).join(" | ");
  const meaningful =
    signals.map((s) => s.text).find((text) => text && !/^disponibilidad\s*:?$/i.test(text)) ??
    signals.map((s) => s.text).find(Boolean) ??
    "";

  // Magento normally exposes the decisive state in the stock element class
  // ("available" / "unavailable"). Text is a fallback because Devir has used
  // several templates over time. Generic "Disponibilidad:" labels are ignored.
  if (/\bunavailable\b|no est[aá] disponible|agotad[oa]|sin stock|no disponible/i.test(combined)) {
    return { availability: "unavailable", label: meaningful || "No disponible" };
  }
  if (/pre\s*reserva|preorder|pr[eé]-?commande/i.test(combined)) {
    return { availability: "preorder", label: meaningful || "Pre reserva" };
  }
  if (/\bavailable\b|\ben stock\b|\bdisponible\b/i.test(combined)) {
    return { availability: "available", label: meaningful || "Disponible" };
  }

  // Some Magento themes render inventory state inside JSON configuration.
  const jsonInStock = html.match(/["'](?:is_in_stock|isInStock)["']\s*:\s*(true|false)/i)?.[1];
  if (jsonInStock === "true") return { availability: "available", label: meaningful || "Disponible" };
  if (jsonInStock === "false") return { availability: "unavailable", label: meaningful || "No disponible" };

  const salable = html.match(/["']is_salable["']\s*:\s*["']?([01])["']?/i)?.[1];
  if (salable === "1") return { availability: "available", label: meaningful || "Disponible" };
  if (salable === "0") return { availability: "unavailable", label: meaningful || "No disponible" };

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

function groupingInfo(product: DevirProduct): GroupingInfo {
  const raw = product.name.replace(/\s+/g, " ").trim();
  // Strong signal for manga/serial publishing. We deliberately do not group
  // arbitrary titles ending in a number (board games, expansions, etc.).
  const match = raw.match(
    /^(.*?)\s+(?:n[uú]m\.?|num\.?|vol\.?|volumen)\s*0*(\d{1,3})(?:\s+de\s+\d+)?(?:[.\s-]+(.*))?$/i,
  );
  if (!match) {
    const tome = raw.match(/^(.*?)\s+-?\s*tomo\s*0*(\d{1,3})(?:\s+de\s+\d+)?(?:[.\s-]+(.*))?$/i);
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
    const groupName = tome[1].replace(/[\s:;,.\-]+$/g, "").trim();
    const position = Number(tome[2]);
    return {
      itemKind: "variant_candidate",
      groupKey: normalizeGroupKey(groupName),
      groupName,
      variantLabel: `Tomo ${String(position).padStart(2, "0")}${tome[3] ? " · " + tome[3].trim() : ""}`,
      variantPosition: position,
      confidence: "ambiguous",
    };
  }

  const groupName = match[1].replace(/[\s:;,.\-]+$/g, "").trim();
  const position = Number(match[2]);
  const suffix = match[3]?.trim() ?? "";
  const specialEdition = /ed(?:ici[oó]n)?\.?\s*(?:especial|aniversario|limitada)|especial|aniversario/i.test(suffix);
  return {
    itemKind: "variant_candidate",
    groupKey: normalizeGroupKey(groupName),
    groupName,
    variantLabel: `Tomo ${String(position).padStart(2, "0")}${suffix ? " · " + suffix : ""}`,
    variantPosition: position,
    confidence: specialEdition ? "ambiguous" : "high",
  };
}

function parseProduct(html: string, url: string): DevirProduct | null {
  const skuHtml = html.match(/<[^>]+itemprop=["']sku["'][^>]*>[\s\S]*?<\/[^>]+>/i)?.[0] ?? "";
  const sku = stripHtml(skuHtml);
  if (!sku) return null;
  const titleHtml = html.match(/<h1\b[^>]*class=["'][^"']*page-title[^"']*["'][^>]*>[\s\S]*?<\/h1>/i)?.[0] ?? "";
  const name = stripHtml(titleHtml) || sku;
  const maxPrice = parsePriceTag(html, /maxPrice/i);
  const finalPrice = parsePriceTag(html, /finalPrice/i);
  const minPrice = parsePriceTag(html, /minPrice/i);
  const purchasePrice = maxPrice ?? finalPrice ?? minPrice;
  const referencePriceNet =
    parsePriceTag(html, /oldPrice|regularPrice/i) ??
    (maxPrice !== null && purchasePrice !== null && maxPrice > purchasePrice ? maxPrice : null);
  const stock = parseAvailability(html);
  return {
    sku,
    name,
    url,
    purchasePrice,
    referencePriceNet,
    availability: stock.availability,
    availabilityLabel: stock.label,
    releaseDate: releaseDate(html),
    imageUrls: imageUrls(html, url),
  };
}

function isPack(product: DevirProduct): boolean {
  const value = (product.name + " " + product.url).toLowerCase();
  return /\bcaja\s+(?:de\s+)?\d+\s+(?:barajas|mazos|decks)\b/.test(value) ||
    /\bstarter\s+commander\s+decks?\b/.test(value) ||
    /\bcommander\s+decks?\s+set\b/.test(value);
}

function categoryKey(product: DevirProduct): string {
  const value = (product.name + " " + product.url).toLowerCase();
  if (/\bmtg\b|magic|\/magic/.test(value)) return "tcg/mtg";
  if (/yugioh|yu-gi-oh|yu gi oh/.test(value)) return "tcg/yugioh";
  if (/accesorio|sleeves|fundas|deck\s*box|tapete|playmat/.test(value)) return "accesorios";

  // Serial manga/comic naming in Devir is very regular. "Tomo" on its own
  // is deliberately excluded because it also appears in RPG campaigns.
  if (/(?:n[uú]m\.?|num\.?|vol\.?|volumen)\s*0*\d{1,3}/i.test(product.name)) {
    return "manga-comic";
  }

  if (/warhammer/.test(value)) return "warhammer";
  if (
    /pathfinder|d&d|dungeons\s*&?\s*dragons|vampiro|cthulhu|runequest|forbidden\s+lands|alien.*rol|juego\s+de\s+rol|roleplaying|rpg\b/.test(value)
  ) {
    return "rol";
  }

  return "juegos-de-mesa";
}


function isFixedPriceCandidate(product: DevirProduct, key: string): boolean {
  const digits = product.sku.replace(/\D/g, "");
  if (/^(978|979)\d{10}$/.test(digits)) return true;
  if (key === "manga-comic") return true;
  if (key === "rol") {
    return /manual|gu[ií]a|libro|compendio|aventura|campaña|bestiario|reglamento|suplemento/i.test(product.name);
  }
  return false;
}

function shippingEstimate(product: DevirProduct, key: string): {
  weight: number;
  width: number;
  height: number;
  depth: number;
} {
  const value = product.name.toLowerCase();
  if (key === "manga-comic") return { weight: 0.45, width: 17, height: 24, depth: 3 };
  if (key === "rol") return { weight: 1.20, width: 24, height: 31, depth: 5 };
  if (key === "tcg/mtg" || key === "tcg/yugioh") {
    if (/blister|sobre\b|booster\b(?!.*display)/i.test(value)) {
      return { weight: 0.25, width: 12, height: 18, depth: 4 };
    }
    if (/display|caja|box|\(\s*\d+\s*\)|pack/i.test(value)) {
      return { weight: 1.80, width: 30, height: 22, depth: 18 };
    }
    return { weight: 0.40, width: 18, height: 14, depth: 7 };
  }
  if (key === "accesorios") return { weight: 1.00, width: 35, height: 25, depth: 10 };
  if (key === "warhammer") return { weight: 1.50, width: 35, height: 25, depth: 10 };
  if (/3d|edici[oó]n\s+3d|big box|deluxe/i.test(value)) {
    return { weight: 4.50, width: 45, height: 45, depth: 20 };
  }
  if (/expansi[oó]n|exp\.|ampliaci[oó]n/i.test(value)) {
    return { weight: 1.20, width: 30, height: 30, depth: 9 };
  }
  return { weight: 2.00, width: 35, height: 35, depth: 12 };
}

function competitivePrice(cost: number, margin: number): {
  grossCost: number;
  retail: number;
  effective: number;
} {
  const grossCost = cost * 1.21;
  const threshold = grossCost / (1 - margin);
  // End in .90 where possible: visually competitive, never below the floor.
  let retail = Math.floor(threshold) + 0.90;
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
  if (!config.spree_admin_api_key) throw new Error("Falta la Secret API Key de Spree en la configuración cloud.");
  const response = await fetch(config.spree_api_url.replace(/\/$/, "") + "/api/v3/admin" + path, {
    method,
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      "x-spree-api-key": config.spree_admin_api_key,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await response.text();

  if (
    (response.status === 429 || [500, 502, 503, 504].includes(response.status)) &&
    attempt < 4
  ) {
    const retryAfter = Number(response.headers.get("retry-after"));
    const waitMs = Number.isFinite(retryAfter) && retryAfter > 0
      ? retryAfter * 1000
      : Math.min(6000, 750 * (2 ** attempt));
    await new Promise((resolve) => setTimeout(resolve, waitMs));
    return await spreeRequest<T>(config, method, path, body, attempt + 1);
  }

  let payload: unknown = null;
  if (text) {
    try { payload = JSON.parse(text); } catch { payload = text; }
  }
  if (!response.ok) throw new Error("Spree " + response.status + " " + path + ": " + String(text).slice(0, 350));
  return payload as T;
}

async function spreeList<T>(config: ConfigRow, path: string): Promise<T[]> {
  const sep = path.includes("?") ? "&" : "?";
  const payload = await spreeRequest<{ data?: T[] }>(config, "GET", path + sep + "limit=100");
  return payload.data ?? [];
}

function variantPrice(variant: SpreeVariant): number | null {
  if (typeof variant.price === "number") return variant.price;
  if (typeof variant.price === "string") {
    const n = Number(variant.price); return Number.isFinite(n) ? n : null;
  }
  if (variant.price && typeof variant.price === "object") {
    const n = Number(variant.price.amount); if (Number.isFinite(n)) return n;
  }
  const eur = variant.prices?.find((p) => p.currency?.toUpperCase() === "EUR") ?? variant.prices?.[0];
  const n = Number(eur?.amount);
  return Number.isFinite(n) ? n : null;
}

async function findSpreeProduct(config: ConfigRow, sku: string): Promise<{ product: SpreeProduct; variant: SpreeVariant } | null> {
  const products = await spreeList<SpreeProduct>(config, "/products?q[search]=" + encodeURIComponent(sku));
  for (const product of products) {
    const variants = await spreeList<SpreeVariant>(config, "/products/" + encodeURIComponent(product.id) + "/variants");
    const variant = variants.find((v) => v.sku?.trim() === sku);
    if (variant) return { product, variant };
  }
  return null;
}

async function spreeCategories(config: ConfigRow): Promise<SpreeCategory[]> {
  return await spreeList<SpreeCategory>(config, "/categories");
}

async function categoryMargin(config: ConfigRow, category: SpreeCategory | null): Promise<number | null> {
  if (!category) return null;
  try {
    const fields = await spreeList<SpreeCustomField>(config, "/categories/" + category.id + "/custom_fields");
    const raw = fields.find((f) => f.key === "pricing.target_margin")?.value;
    const value = Number(raw);
    return Number.isFinite(value) && value >= 0 && value < 0.95 ? value : null;
  } catch {
    return null;
  }
}

async function definitions(config: ConfigRow): Promise<Map<string, SpreeFieldDefinition>> {
  const defs = await spreeList<SpreeFieldDefinition>(config, "/custom_field_definitions");
  return new Map(defs.filter((d) => d.resource_type === "Spree::Product").map((d) => [d.namespace + "." + d.key, d]));
}

async function productFields(config: ConfigRow, productId: string): Promise<SpreeCustomField[]> {
  return await spreeList<SpreeCustomField>(config, "/products/" + productId + "/custom_fields");
}

async function upsertProductFields(
  config: ConfigRow,
  productId: string,
  defs: Map<string, SpreeFieldDefinition>,
  values: Record<string, unknown>,
  current?: SpreeCustomField[],
): Promise<void> {
  const fields = current ?? await productFields(config, productId);
  const byKey = new Map(fields.map((f) => [f.key, f]));
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined || value === null || value === "") continue;
    const def = defs.get(key);
    if (!def) continue;
    const old = byKey.get(key);
    if (old) {
      if (String(old.value) !== String(value)) {
        await spreeRequest(config, "PATCH", "/products/" + productId + "/custom_fields/" + old.id, { value });
      }
    } else {
      const created = await spreeRequest<SpreeCustomField>(config, "POST", "/products/" + productId + "/custom_fields", {
        custom_field_definition_id: def.id,
        value,
      });
      byKey.set(key, created);
    }
  }
}

interface SpreeStockItem {
  id: string;
  variant_id?: string | null;
  count_on_hand?: number;
  backorderable?: boolean;
}

async function syncBackorderability(
  config: ConfigRow,
  variantId: string | null,
  availability: DevirProduct["availability"],
): Promise<number> {
  if (!variantId || (availability !== "available" && availability !== "unavailable")) return 0;
  const desired = availability === "available";
  const attempts = [
    "/stock_items?q[variant_id_eq]=" + encodeURIComponent(variantId),
    "/stock_items?q[variant_prefixed_id_eq]=" + encodeURIComponent(variantId),
  ];
  let items: SpreeStockItem[] = [];
  for (const path of attempts) {
    try {
      items = await spreeList<SpreeStockItem>(config, path);
      if (items.length) break;
    } catch {
      // Compatibility fallback between Spree versions.
    }
  }
  if (!items.length) {
    const all = await spreeList<SpreeStockItem>(config, "/stock_items");
    items = all.filter((item) => item.variant_id === variantId);
  }

  let changed = 0;
  for (const item of items) {
    if (item.backorderable === desired) continue;
    await spreeRequest(config, "PATCH", "/stock_items/" + item.id, {
      backorderable: desired,
    });
    changed += 1;
  }
  return changed;
}

async function syncImages(config: ConfigRow, productId: string, product: DevirProduct): Promise<number> {
  if (!product.imageUrls.length) return 0;
  const current = await spreeList<Json>(config, "/products/" + productId + "/media");
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
  if (!grouping.groupKey || grouping.itemKind !== "variant_candidate") return null;

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
    const already = variants.find((variant) => variant.sku?.trim() === product.sku);
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
    const edition = variantEdition(grouping.variantLabel) ?? "Estándar";
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

async function syncProductToSpree(
  config: ConfigRow,
  product: DevirProduct,
  categories: SpreeCategory[],
  defs: Map<string, SpreeFieldDefinition>,
): Promise<{ productId: string; variantId: string | null; images: number; review: boolean; backorderItems: number; lastAutoPrice: number | null }> {
  if (!product.purchasePrice || product.purchasePrice <= 0) throw new Error("Producto sin coste Devir: " + product.sku);
  const key = categoryKey(product);
  const category = key ? categories.find((c) => c.permalink === key) ?? null : null;
  const configuredMargin = await categoryMargin(config, category);
  const targetMargin = configuredMargin ?? DEFAULT_CATEGORY_MARGINS[key] ?? 0.05;
  const pricing = competitivePricing(product, key, targetMargin);
  const shipping = shippingDefaults(key, product);
  const reasons: string[] = [];
  if (!category) reasons.push("category_unclassified");
  else if (configuredMargin === null) reasons.push("category_margin_unconfigured");
  if (pricing.reviewReason) reasons.push(pricing.reviewReason);
  if (isPack(product)) reasons.push("pack_requires_operator_split");
  const grouping = groupingInfo(product);
  if (grouping.confidence === "ambiguous") reasons.push("grouping_requires_operator_review");
  const review = reasons.length > 0;
  let existing = await findSpreeProduct(config, product.sku);
  let grouped = false;

  if (!existing && grouping.itemKind === "variant_candidate" && grouping.groupKey) {
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

  let productId: string;
  let variantId: string | null = null;
  let manualPrice = false;

  if (!existing) {
    const created = await spreeRequest<SpreeProduct>(config, "POST", "/products", {
      name: product.name,
      status: "draft",
      tags: ["devir", review ? "devir-review" : "devir-ready", ...(review ? ["REVISION-HUMANA"] : [])],
      ...(category ? { category_ids: [category.id] } : {}),
      variants: [{
        options: [],
        sku: product.sku,
        cost_price: product.purchasePrice,
        cost_currency: "EUR",
        ...shipping,
        track_inventory: true,
        backorder_limit: null,
        prices: [{ currency: "EUR", amount: pricing.retail }],
      }],
    });
    productId = created.id;
    const variants = await spreeList<SpreeVariant>(config, "/products/" + productId + "/variants");
    variantId = variants.find((v) => v.sku === product.sku)?.id ?? null;
  } else {
    productId = existing.product.id;
    variantId = existing.variant.id;
    const fields = await productFields(config, productId);
    const { data: catalogPricing } = await supabase
      .from("devir_sync_catalog")
      .select("last_auto_price")
      .eq("supplier_sku", product.sku)
      .maybeSingle();
    const catalogLastAuto = Number(catalogPricing?.last_auto_price);
    const legacyLastAuto = Number(fields.find((f) => f.key === "pricing.last_synced_price")?.value);
    const lastAuto = Number.isFinite(catalogLastAuto) ? catalogLastAuto : legacyLastAuto;
    const currentPrice = variantPrice(existing.variant);
    const managed = (existing.product.tags ?? []).includes("devir");
    const active = existing.product.status === "active";
    const autoPrice = Number.isFinite(lastAuto) && currentPrice !== null && Math.abs(lastAuto - currentPrice) < 0.005;
    const canWritePrice = managed && !active && autoPrice;
    manualPrice = currentPrice !== null && !canWritePrice;
    const tags = Array.from(new Set([
      ...(existing.product.tags ?? []),
      "devir",
      review ? "devir-review" : "devir-ready",
      ...(review ? ["REVISION-HUMANA"] : []),
    ])).filter((tag) =>
      review
        ? tag !== "devir-ready"
        : tag !== "devir-review" && tag !== "REVISION-HUMANA"
    );
    await spreeRequest(config, "PATCH", "/products/" + productId, {
      tags,
      ...(!active && managed && !grouped ? { name: product.name } : {}),
      ...(!active && managed && !grouped && category ? { category_ids: [category.id] } : {}),
    });
    await spreeRequest(
      config,
      "PATCH",
      "/products/" + encodeURIComponent(productId) +
        "/variants/" + encodeURIComponent(existing.variant.id),
      {
        sku: product.sku,
        cost_price: product.purchasePrice,
        cost_currency: "EUR",
        ...shipping,
        track_inventory: true,
        backorder_limit: null,
        ...(canWritePrice ? { prices: [{ currency: "EUR", amount: pricing.retail }] } : {}),
      },
    );
  }

  const effectivePrice = existing && manualPrice ? variantPrice(existing.variant) ?? pricing.retail : pricing.retail;
  const stripeFee = effectivePrice * STANDARD_EEA_CARD_RATE + STANDARD_EEA_CARD_FIXED_EUR;
  const effectiveProfit =
    (effectivePrice / (1 + pricing.vatRate)) -
    product.purchasePrice -
    stripeFee;
  const effectiveMargin = effectivePrice > 0 ? effectiveProfit / effectivePrice : 0;
  await upsertProductFields(config, productId, defs, {
    "devir.supplier_sku": grouped ? undefined : product.sku,
    "devir.source_url": grouped ? undefined : product.url,
    "devir.category_key": key,
    "devir.availability": grouped ? undefined : product.availability,
    "devir.release_date": grouped ? undefined : product.releaseDate ?? undefined,
    "devir.review_status": review ? "⚠ REVISIÓN HUMANA" : "LISTO",
    "devir.review_reasons": reasons.length ? reasons.join(", ") : "none",
    "devir.last_sync_at": new Date().toISOString(),
    "pricing.applied_margin": targetMargin,
    "pricing.effective_margin": effectiveMargin,
    "pricing.rule_source": pricing.ruleSource + (category ? ":category=" + category.id : ""),
    "pricing.vat_rate": pricing.vatRate,
    "pricing.cost_includes_vat": false,
    "pricing.last_synced_price": manualPrice ? undefined : pricing.retail,
    "pricing.manual_price_override": manualPrice,
  });

  const backorderItems = await syncBackorderability(config, variantId, product.availability);
  const images = await syncImages(config, productId, product);
  return {
    productId,
    variantId,
    images,
    review,
    backorderItems,
    lastAutoPrice: manualPrice ? null : pricing.retail,
  };
}



interface CatalogGroupRow {
  supplier_sku: string;
  name: string;
  spree_product_id: string | null;
  spree_variant_id: string | null;
  group_key: string | null;
  group_name: string | null;
  variant_label: string | null;
  variant_position: number | null;
  grouping_confidence: "none" | "high" | "ambiguous";
}

function variantEdition(label: string | null): string | null {
  if (!label) return null;
  const parts = label.split(" · ");
  return parts.length > 1 ? parts.slice(1).join(" · ").trim() || null : null;
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
}> {
  const { data, error } = await supabase
    .from("devir_sync_catalog")
    .select("supplier_sku,name,spree_product_id,spree_variant_id,group_key,group_name,variant_label,variant_position,grouping_confidence")
    .eq("group_key", groupKey)
    .eq("item_kind", "variant_candidate")
    .order("variant_position", { ascending: true });
  if (error) throw error;
  const rows = (data ?? []) as CatalogGroupRow[];
  const highConfidence = rows.filter((row) => row.grouping_confidence === "high");
  if (highConfidence.length < 2) {
    return { ok: true, group_key: groupKey, skipped: "needs_at_least_two_high_confidence_variants" };
  }

  const groupName = rows.find((row) => row.group_name)?.group_name ?? groupKey;
  const uniqueProducts = Array.from(new Set(rows.map((row) => row.spree_product_id).filter(Boolean))) as string[];
  const sourceProducts = new Map<string, SpreeProduct>();
  const sourceVariants = new Map<string, SpreeVariant>();

  for (const productId of uniqueProducts) {
    const product = await spreeRequest<SpreeProduct>(config, "GET", "/products/" + encodeURIComponent(productId));
    sourceProducts.set(productId, product);
    if (product.status !== "draft" || !(product.tags ?? []).includes("devir")) {
      return { ok: true, group_key: groupKey, skipped: "contains_non_draft_or_unmanaged_product" };
    }
    const variants = await spreeList<SpreeVariant>(config, "/products/" + encodeURIComponent(productId) + "/variants");
    for (const variant of variants) {
      if (variant.sku) sourceVariants.set(variant.sku.trim(), variant);
    }
  }

  const positions = new Map<number, number>();
  for (const row of rows) {
    const pos = Number(row.variant_position ?? -1);
    positions.set(pos, (positions.get(pos) ?? 0) + 1);
  }
  const hasEditionDimension =
    rows.some((row) => Boolean(variantEdition(row.variant_label))) ||
    Array.from(positions.values()).some((count) => count > 1);

  if (hasEditionDimension) {
    const optionKeys = new Set<string>();
    for (const row of rows) {
      const position = Number(row.variant_position ?? 0);
      const edition = variantEdition(row.variant_label) ?? "Estándar";
      const key = String(position).padStart(2, "0") + "|" + edition.toLowerCase();
      if (optionKeys.has(key)) {
        return { ok: true, group_key: groupKey, skipped: "duplicate_variant_options_need_review" };
      }
      optionKeys.add(key);
    }
  }

  const variants = rows.map((row) => {
    const source = sourceVariants.get(row.supplier_sku);
    const position = Number(row.variant_position ?? 0);
    const edition = variantEdition(row.variant_label) ?? "Estándar";
    const price = source ? variantPrice(source) : null;
    const cost = Number(source?.cost_price);
    return {
      sku: row.supplier_sku,
      ...(Number.isFinite(cost) && cost > 0 ? { cost_price: cost, cost_currency: "EUR" } : {}),
      track_inventory: true,
      options: [
        { name: "tomo", value: String(position).padStart(2, "0") },
        ...(hasEditionDimension ? [{ name: "edicion", value: edition }] : []),
      ],
      ...(price !== null ? { prices: [{ currency: "EUR", amount: price }] } : {}),
    };
  });

  const created = await spreeRequest<SpreeProduct>(config, "POST", "/products", {
    name: groupName,
    status: "draft",
    tags: ["devir", "devir-review", "devir-group", "devir-group-" + groupKey],
    variants,
  });
  const createdVariants = await spreeList<SpreeVariant>(
    config,
    "/products/" + encodeURIComponent(created.id) + "/variants",
  );
  const createdBySku = new Map(
    createdVariants.filter((variant) => variant.sku).map((variant) => [variant.sku!.trim(), variant]),
  );

  // Only after the replacement product exists and all SKU variants can be
  // resolved do we archive the old draft products.
  for (const row of rows) {
    if (!createdBySku.has(row.supplier_sku)) {
      throw new Error("No se pudo resolver la variante migrada " + row.supplier_sku);
    }
  }

  for (const productId of uniqueProducts) {
    const old = sourceProducts.get(productId)!;
    const tags = Array.from(new Set([...(old.tags ?? []), "devir-merged"]));
    await spreeRequest(config, "PATCH", "/products/" + encodeURIComponent(productId), {
      status: "archived",
      tags,
    });
  }

  for (const row of rows) {
    const variant = createdBySku.get(row.supplier_sku)!;
    const { error: updateError } = await supabase
      .from("devir_sync_catalog")
      .update({
        spree_product_id: created.id,
        spree_variant_id: variant.id,
        last_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq("supplier_sku", row.supplier_sku);
    if (updateError) throw updateError;
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
  // These are safety floors; the market/reference-price discount normally
  // leaves a larger realised margin.
  "juegos-de-mesa": 0.05,
  "warhammer": 0.05,
  "tcg/mtg": 0.04,
  "tcg/yugioh": 0.04,
  "rol": 0.05,
  "manga-comic": 0.05,
  "accesorios": 0.05,
};

const CATEGORY_REFERENCE_DISCOUNTS: Record<string, number> = {
  "juegos-de-mesa": 0.17,
  "warhammer": 0.12,
  "tcg/mtg": 0.12,
  "tcg/yugioh": 0.12,
  "rol": 0.10,
  "manga-comic": 0.05,
  "accesorios": 0.15,
};

const STANDARD_EEA_CARD_RATE = 0.015;
const STANDARD_EEA_CARD_FIXED_EUR = 0.25;

function isBookSku(sku: string): boolean {
  return /^(978|979)/.test(sku.replace(/\D/g, ""));
}

function vatRateForSku(sku: string): number {
  return isBookSku(sku) ? 0.04 : 0.21;
}

function roundUpToFiveCents(value: number): number {
  return Math.ceil((value * 20) - 1e-9) / 20;
}

function paymentAwareFloor(
  costNet: number,
  vatRate: number,
  targetProfitRate: number,
): number {
  const denominator =
    (1 / (1 + vatRate)) - STANDARD_EEA_CARD_RATE - targetProfitRate;
  if (denominator <= 0) throw new Error("Margen objetivo incompatible con IVA/comisiones");
  return (costNet + STANDARD_EEA_CARD_FIXED_EUR) / denominator;
}

function competitivePricing(
  product: DevirProduct,
  key: string,
  targetProfitRate = DEFAULT_CATEGORY_MARGINS[key] ?? 0.05,
): {
  retail: number;
  vatRate: number;
  referenceGross: number | null;
  floor: number;
  effectiveProfitRate: number;
  ruleSource: string;
  reviewReason: string | null;
} {
  if (!product.purchasePrice || product.purchasePrice <= 0) {
    throw new Error("Producto sin coste Devir: " + product.sku);
  }

  const vatRate = vatRateForSku(product.sku);
  const floor = paymentAwareFloor(product.purchasePrice, vatRate, targetProfitRate);
  const referenceNet = Number(product.referencePriceNet);
  const hasReference = Number.isFinite(referenceNet) && referenceNet > product.purchasePrice;
  const referenceGross = hasReference ? referenceNet * (1 + vatRate) : null;
  const book = isBookSku(product.sku);

  let raw = floor;
  let ruleSource = "cost_floor";
  let reviewReason: string | null = null;

  if (referenceGross !== null) {
    const discount = book ? 0.05 : (CATEGORY_REFERENCE_DISCOUNTS[key] ?? 0.12);
    const marketTarget = referenceGross * (1 - discount);
    raw = Math.max(floor, marketTarget);
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
    retail = Math.ceil(raw * 100 - 1e-9) / 100;
    // Never exceed the fixed PVP automatically. If the safety floor would,
    // reviewReason above keeps the product in draft.
    retail = Math.min(retail, Math.round(referenceGross * 100) / 100);
  } else {
    retail = roundUpToFiveCents(raw);
  }

  const stripeFee = retail * STANDARD_EEA_CARD_RATE + STANDARD_EEA_CARD_FIXED_EUR;
  const netSale = retail / (1 + vatRate);
  const profit = netSale - product.purchasePrice - stripeFee;
  const effectiveProfitRate = retail > 0 ? profit / retail : 0;

  return {
    retail,
    vatRate,
    referenceGross: referenceGross === null ? null : Math.round(referenceGross * 100) / 100,
    floor: Math.round(floor * 100) / 100,
    effectiveProfitRate,
    ruleSource,
    reviewReason,
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
    return { weight: 0.35, height: 21, width: 15, depth: 2.5, weight_unit: "kg", dimensions_unit: "cm" };
  }
  if (key === "rol" && isBookSku(product.sku)) {
    return { weight: 1.2, height: 29, width: 22, depth: 3.5, weight_unit: "kg", dimensions_unit: "cm" };
  }
  if (key === "tcg/mtg" || key === "tcg/yugioh") {
    if (/display|cart[oó]n|caja|\(\s*\d{2,}\s*\)|booster box/i.test(name)) {
      return { weight: 1.5, height: 25, width: 18, depth: 15, weight_unit: "kg", dimensions_unit: "cm" };
    }
    return { weight: 0.5, height: 20, width: 14, depth: 8, weight_unit: "kg", dimensions_unit: "cm" };
  }
  if (key === "accesorios") {
    return { weight: 0.3, height: 22, width: 16, depth: 6, weight_unit: "kg", dimensions_unit: "cm" };
  }
  if (key === "warhammer") {
    return { weight: 0.9, height: 30, width: 22, depth: 7, weight_unit: "kg", dimensions_unit: "cm" };
  }
  return { weight: 1.5, height: 30, width: 30, depth: 8, weight_unit: "kg", dimensions_unit: "cm" };
}

async function ensureCategory(
  config: ConfigRow,
  categories: SpreeCategory[],
  name: string,
  permalink: string,
): Promise<SpreeCategory> {
  const existing = categories.find((category) => category.permalink === permalink);
  if (existing) return existing;
  const created = await spreeRequest<SpreeCategory>(config, "POST", "/categories", {
    name,
    permalink,
  });
  categories.push(created);
  return created;
}

async function setCategoryMargin(
  config: ConfigRow,
  category: SpreeCategory,
  margin: number,
): Promise<void> {
  const defs = await spreeList<SpreeFieldDefinition>(config, "/custom_field_definitions");
  const def = defs.find(
    (item) =>
      item.resource_type === "Spree::Taxon" &&
      item.namespace === "pricing" &&
      item.key === "target_margin",
  );
  if (!def) throw new Error("Falta custom field pricing.target_margin para categorías");

  const fields = await spreeList<SpreeCustomField>(
    config,
    "/categories/" + encodeURIComponent(category.id) + "/custom_fields",
  );
  const current = fields.find(
    (field) => field.key === "pricing.target_margin" || field.key === "target_margin",
  );
  if (current) {
    if (Math.abs(Number(current.value) - margin) > 0.0001) {
      await spreeRequest(
        config,
        "PATCH",
        "/categories/" + encodeURIComponent(category.id) + "/custom_fields/" + current.id,
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

async function setupCatalogCategoriesAndMargins(config: ConfigRow): Promise<Array<{
  id: string;
  name: string;
  permalink: string;
  target_margin: number;
}>> {
  const categories = await spreeCategories(config);
  await ensureCategory(config, categories, "Rol", "rol");
  await ensureCategory(config, categories, "Manga y cómic", "manga-comic");
  await ensureCategory(config, categories, "Accesorios", "accesorios");

  const output = [];
  for (const [permalink, margin] of Object.entries(DEFAULT_CATEGORY_MARGINS)) {
    const category = categories.find((item) => item.permalink === permalink);
    if (!category) continue;
    await setCategoryMargin(config, category, margin);
    output.push({
      id: category.id,
      name: category.name,
      permalink,
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
    .select("supplier_sku,name,source_url,snapshot,spree_product_id,spree_variant_id")
    .not("spree_product_id", "is", null)
    .order("supplier_sku")
    .range(offset, offset + limit - 1);
  if (error) throw error;

  const rows = data ?? [];
  const productIds = Array.from(
    new Set(rows.map((row) => String(row.spree_product_id ?? "")).filter(Boolean)),
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
    const sku = String(row.supplier_sku ?? "");
    const spreeProduct = products.get(productId);
    if (!productId || !variantId || !sku || !spreeProduct) return;
    if (spreeProduct.status !== "draft" || !(spreeProduct.tags ?? []).includes("devir")) return;

    const snapshot = row.snapshot && typeof row.snapshot === "object"
      ? row.snapshot as Json
      : null;
    const cost = Number(snapshot?.purchasePrice);
    const product: DevirProduct = {
      sku,
      name: String(row.name),
      url: String(row.source_url),
      purchasePrice: Number.isFinite(cost) ? cost : null,
      referencePriceNet:
        snapshot && Number.isFinite(Number(snapshot.referencePriceNet))
          ? Number(snapshot.referencePriceNet)
          : null,
      availability: "unknown",
      availabilityLabel: null,
      releaseDate: null,
      imageUrls: [],
    };
    const key = categoryKey(product);
    const category = categories.find((item) => item.permalink === key);
    const margin = DEFAULT_CATEGORY_MARGINS[key];
    if (!category || !Number.isFinite(margin) || !product.purchasePrice || product.purchasePrice <= 0) return;

    const pricing = priceFor(
      product.purchasePrice,
      margin,
      key === "manga-comic" ? 0.95 : 0.99,
    );

    const patch = async () => {
      await spreeRequest(config, "PATCH", "/products/" + encodeURIComponent(productId), {
        category_ids: [category.id],
      });
      await spreeRequest(
        config,
        "PATCH",
        "/products/" + encodeURIComponent(productId) +
          "/variants/" + encodeURIComponent(variantId),
        {
          sku: product.sku,
          cost_price: product.purchasePrice,
          cost_currency: "EUR",
          prices: [{ currency: "EUR", amount: pricing.retail }],
        },
      );
    };

    try {
      try {
        await patch();
      } catch (patchError) {
        const message = patchError instanceof Error ? patchError.message : String(patchError);
        if (!/variant_not_found|Variant no encontrado/i.test(message)) throw patchError;

        const variants = await spreeList<SpreeVariant>(
          config,
          "/products/" + encodeURIComponent(productId) + "/variants",
        );
        const repaired = variants.find((variant) => variant.sku?.trim() === sku);
        if (!repaired) throw patchError;

        variantId = repaired.id;
        const { error: repairError } = await supabase
          .from("devir_sync_catalog")
          .update({ spree_variant_id: variantId, updated_at: new Date().toISOString() })
          .eq("supplier_sku", sku);
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
        .eq("supplier_sku", product.sku);
      if (catalogUpdateError) throw catalogUpdateError;

      updated += 1;
      repriced += 1;
    } catch (rowError) {
      failed += 1;
      await supabase
        .from("devir_sync_catalog")
        .update({
          last_error: rowError instanceof Error ? rowError.message : String(rowError),
          updated_at: new Date().toISOString(),
        })
        .eq("supplier_sku", product.sku);
    }
  };

  for (let index = 0; index < rows.length; index += 5) {
    await Promise.all(
      rows.slice(index, index + 5).map((row) => processRow(row as Record<string, unknown>)),
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
    ? snapshot.imageUrls.filter((value): value is string => typeof value === "string")
    : Array.isArray(row.image_urls)
      ? (row.image_urls as unknown[]).filter((value): value is string => typeof value === "string")
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
    referencePriceNet: Number.isFinite(reference) && reference > 0 ? reference : null,
    availability,
    availabilityLabel:
      typeof snapshot.availabilityLabel === "string" ? snapshot.availabilityLabel : null,
    releaseDate: typeof snapshot.releaseDate === "string" ? snapshot.releaseDate : null,
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
    .select("supplier_sku,source_url,name,snapshot,image_urls,spree_product_id,spree_variant_id,supplier_status,item_kind,grouping_confidence,last_error")
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
      const message = sourceError instanceof Error ? sourceError.message : String(sourceError);
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
): Promise<{
  categories: Array<{ id: string; name: string; permalink?: string }>;
  products_assigned: number;
  conflicts: number;
}> {
  const categories = await spreeCategories(config);
  const juegos = await ensureCategory(config, categories, "Juegos de mesa", "juegos-de-mesa");
  const warhammer = await ensureCategory(config, categories, "Warhammer", "warhammer");
  const tcg = await ensureCategory(config, categories, "TCG", "tcg");
  const mtg = await ensureCategory(config, categories, "MTG", "tcg/mtg");
  const yugioh = await ensureCategory(config, categories, "Yugioh", "tcg/yugioh");
  const rol = await ensureCategory(config, categories, "Rol", "rol");
  const manga = await ensureCategory(config, categories, "Manga y cómic", "manga-comic");
  const accesorios = await ensureCategory(config, categories, "Accesorios", "accesorios");

  // Only move nodes whose parent is actually wrong. Repositioning an
  // already-correct child can be rejected by Spree as a self/tree move.
  const roots = [juegos, warhammer, tcg, rol, manga, accesorios];
  for (let position = 0; position < roots.length; position += 1) {
    if (roots[position].parent_id == null) continue;
    await spreeRequest(
      config,
      "PATCH",
      "/categories/" + encodeURIComponent(roots[position].id) + "/reposition",
      { new_parent_id: null, new_position: position },
    );
  }
  for (const [position, child] of [mtg, yugioh].entries()) {
    if (child.parent_id === tcg.id) continue;
    await spreeRequest(
      config,
      "PATCH",
      "/categories/" + encodeURIComponent(child.id) + "/reposition",
      { new_parent_id: tcg.id, new_position: position },
    );
  }

  for (const [permalink, margin] of Object.entries(DEFAULT_CATEGORY_MARGINS)) {
    const category = categories.find((item) => item.permalink === permalink);
    if (category) await setCategoryMargin(config, category, margin);
  }

  const { data, error } = await supabase
    .from("devir_sync_catalog")
    .select("supplier_sku,name,source_url,spree_product_id")
    .not("spree_product_id", "is", null);
  if (error) throw error;

  const allProductIds = Array.from(
    new Set((data ?? []).map((row) => String(row.spree_product_id ?? "")).filter(Boolean)),
  );
  const leafCategories = [juegos, warhammer, mtg, yugioh, rol, manga, accesorios];

  // Remove only Devir-managed product memberships, then rebuild deterministically.
  for (const category of leafCategories) {
    for (let index = 0; index < allProductIds.length; index += 80) {
      await spreeRequest(
        config,
        "DELETE",
        "/categories/" + encodeURIComponent(category.id) + "/products",
        { product_ids: allProductIds.slice(index, index + 80) },
      );
    }
  }

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

  const byPermalink = new Map(leafCategories.map((category) => [category.permalink, category]));
  const memberships = new Map<string, string[]>();
  let conflicts = 0;

  for (const [productId, keys] of productKeys) {
    if (keys.size !== 1) {
      conflicts += 1;
      await supabase
        .from("devir_sync_catalog")
        .update({
          last_error: "CATEGORY-CONFLICT: " + Array.from(keys).join(","),
          updated_at: new Date().toISOString(),
        })
        .eq("spree_product_id", productId);
      continue;
    }
    const key = Array.from(keys)[0];
    const category = byPermalink.get(key);
    if (!category) continue;
    const list = memberships.get(category.id) ?? [];
    list.push(productId);
    memberships.set(category.id, list);
  }

  let productsAssigned = 0;
  for (const [categoryId, productIds] of memberships) {
    for (let index = 0; index < productIds.length; index += 80) {
      const chunk = productIds.slice(index, index + 80);
      await spreeRequest(
        config,
        "POST",
        "/categories/" + encodeURIComponent(categoryId) + "/products",
        { product_ids: chunk },
      );
      productsAssigned += chunk.length;
    }
  }

  return {
    categories: leafCategories.map((item) => ({
      id: item.id,
      name: item.name,
      permalink: item.permalink,
    })),
    products_assigned: productsAssigned,
    conflicts,
  };
}

async function updateReviewFieldLabels(config: ConfigRow): Promise<void> {
  const defs = await spreeList<SpreeFieldDefinition>(config, "/custom_field_definitions");
  const status = defs.find(
    (item) => item.resource_type === "Spree::Product" && item.namespace === "devir" && item.key === "review_status",
  );
  const reasons = defs.find(
    (item) => item.resource_type === "Spree::Product" && item.namespace === "devir" && item.key === "review_reasons",
  );
  if (status) {
    await spreeRequest(config, "PATCH", "/custom_field_definitions/" + status.id, {
      label: "⚠ Devir · Intervención humana",
    });
  }
  if (reasons) {
    await spreeRequest(config, "PATCH", "/custom_field_definitions/" + reasons.id, {
      label: "⚠ Devir · Motivo de revisión",
    });
  }
}

async function preparePublishBatch(
  config: ConfigRow,
  offset: number,
  limit: number,
): Promise<{
  processed_products: number;
  published: number;
  waiting_supplier: number;
  human_review: number;
  variants_updated: number;
  next_offset: number | null;
}> {
  const { data, error } = await supabase
    .from("devir_sync_catalog")
    .select("supplier_sku,source_url,name,snapshot,image_urls,spree_product_id,spree_variant_id,supplier_status,item_kind,grouping_confidence,last_error")
    .not("spree_product_id", "is", null)
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
  const selected = productIds.slice(offset, offset + limit);
  const defs = await definitions(config);
  const categories = await spreeCategories(config);
  const channels = await spreeList<SpreeChannel>(config, "/channels");
  const channel = channels.find((item) => item.active && item.default) ??
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
          last_error: "SPREE-PRODUCT: " + (productError instanceof Error ? productError.message : String(productError)),
          updated_at: new Date().toISOString(),
        })
        .eq("spree_product_id", productId);
      humanReview += 1;
      continue;
    }

    const originalTags = spreeProduct.tags ?? [];
    if (!originalTags.includes("devir")) {
      humanReview += 1;
      continue;
    }

    const variants = await spreeList<SpreeVariant>(
      config,
      "/products/" + encodeURIComponent(productId) + "/variants",
    );
    const productReasons = new Set<string>();
    const categoryKeys = new Set<string>();
    let anySellable = false;
    let anyWaiting = false;
    let updatedForProduct = 0;

    for (const row of rows) {
      const product = productFromCatalogRow(row);
      const snapshot = row.snapshot ?? {};
      const sourceVerified = snapshot.sourceVerified === true;
      const sourceVerifiedAt =
        typeof snapshot.sourceVerifiedAt === "string" ? snapshot.sourceVerifiedAt : null;
      const key = categoryKey(product);
      categoryKeys.add(key);

      if (!sourceVerified || !sourceVerifiedAt) {
        productReasons.add("supplier_source_not_verified");
        continue;
      }
      if (!product.purchasePrice || product.purchasePrice <= 0) {
        productReasons.add("supplier_cost_missing");
        continue;
      }
      if (!product.imageUrls.length) {
        productReasons.add("product_image_missing");
      }
      if (isPack(product)) productReasons.add("pack_requires_operator_split");
      if (row.grouping_confidence === "ambiguous") {
        productReasons.add("grouping_requires_operator_review");
      }

      const targetMargin = DEFAULT_CATEGORY_MARGINS[key] ?? 0.05;
      const pricing = competitivePricing(product, key, targetMargin);
      if (pricing.reviewReason) productReasons.add(pricing.reviewReason);

      let variant = variants.find((item) => item.sku?.trim() === product.sku);
      if (!variant && row.spree_variant_id) {
        variant = variants.find((item) => item.id === row.spree_variant_id);
      }
      if (!variant) {
        productReasons.add("variant_not_found_for_sku:" + product.sku);
        continue;
      }

      if (variant.id !== row.spree_variant_id) {
        await supabase
          .from("devir_sync_catalog")
          .update({ spree_variant_id: variant.id, updated_at: new Date().toISOString() })
          .eq("supplier_sku", product.sku);
      }

      const shipping = shippingDefaults(key, product);
      const isSellableAtSupplier =
        row.supplier_status === "available" || row.supplier_status === "preorder";

      await spreeRequest(
        config,
        "PATCH",
        "/products/" + encodeURIComponent(productId) +
          "/variants/" + encodeURIComponent(variant.id),
        {
          sku: product.sku,
          cost_price: product.purchasePrice,
          cost_currency: "EUR",
          ...shipping,
          track_inventory: true,
          preorderable: row.supplier_status === "preorder",
          preorder_ships_at:
            row.supplier_status === "preorder" ? product.releaseDate : null,
          backorder_limit: null,
          prices: [{ currency: "EUR", amount: pricing.retail }],
        },
      );
      await syncBackorderability(
        config,
        variant.id,
        isSellableAtSupplier ? "available" : "unavailable",
      );
      await supabase
        .from("devir_sync_catalog")
        .update({
          last_auto_price: pricing.retail,
          last_error: null,
          updated_at: new Date().toISOString(),
        })
        .eq("supplier_sku", product.sku);

      variantsUpdated += 1;
      updatedForProduct += 1;
      if (isSellableAtSupplier) anySellable = true;
      else if (row.supplier_status === "unavailable") anyWaiting = true;
      else productReasons.add("supplier_availability_unknown");
    }

    if (categoryKeys.size !== 1) {
      productReasons.add("product_category_conflict:" + Array.from(categoryKeys).join(","));
    }

    const human = productReasons.size > 0;
    const publish = !human && anySellable;
    const waiting = !human && !anySellable && anyWaiting;

    let tags = Array.from(new Set([
      ...originalTags,
      "devir",
      ...(publish ? ["devir-ready", "devir-published"] : []),
      ...(waiting ? ["devir-waiting-stock"] : []),
      ...(human ? ["devir-review", "REVISION-HUMANA"] : []),
    ]));
    if (publish) {
      tags = tags.filter((tag) =>
        tag !== "devir-review" &&
        tag !== "REVISION-HUMANA" &&
        tag !== "devir-waiting-stock"
      );
    } else if (waiting) {
      tags = tags.filter((tag) =>
        tag !== "devir-ready" &&
        tag !== "devir-published" &&
        tag !== "devir-review" &&
        tag !== "REVISION-HUMANA"
      );
    } else {
      tags = tags.filter((tag) => tag !== "devir-ready" && tag !== "devir-published");
    }

    const resolvedCategory = categoryKeys.size === 1
      ? categories.find((item) => item.permalink === Array.from(categoryKeys)[0])
      : undefined;

    await spreeRequest(
      config,
      "PATCH",
      "/products/" + encodeURIComponent(productId),
      {
        status: publish ? "active" : "draft",
        tags,
        ...(resolvedCategory ? { category_ids: [resolvedCategory.id] } : {}),
      },
    );

    if (publish) {
      await spreeRequest(
        config,
        "POST",
        "/channels/" + encodeURIComponent(channel.id) + "/add_products",
        { product_ids: [productId] },
      );
      published += 1;
    } else {
      try {
        await spreeRequest(
          config,
          "POST",
          "/channels/" + encodeURIComponent(channel.id) + "/remove_products",
          { product_ids: [productId] },
        );
      } catch {
        // Keeping a draft is the primary safety control if channel removal is
        // unavailable on a particular Spree patch level.
      }
      if (human) humanReview += 1;
      else waitingSupplier += 1;
    }

    await upsertProductFields(config, productId, defs, {
      "devir.review_status": human
        ? "⚠ REVISIÓN HUMANA"
        : publish
          ? "PUBLICADO"
          : "ESPERANDO STOCK DEVIR",
      "devir.review_reasons": human
        ? Array.from(productReasons).join(", ")
        : waiting
          ? "supplier_unavailable"
          : "none",
      "devir.last_sync_at": new Date().toISOString(),
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
    next_offset: selected.length < limit ? null : offset + limit,
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
  return Math.ceil(
    paymentAwareFloor(cost, vatRate, targetMargin) * 100 - 1e-9,
  ) / 100;
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

  const created = await spreeRequest<SpreePriceList>(config, "POST", "/price_lists", {
    name: program.code + " · " + program.name,
    description:
      "Precio por cuenta aprobada. Margen objetivo configurable; no altera el PVP público.",
    match_policy: "all",
  });

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

async function approvedSpecialCustomerIds(programCode: string): Promise<string[]> {
  const { data, error } = await supabase
    .from("special_pricing_requests")
    .select("spree_customer_id")
    .eq("program_code", programCode)
    .eq("status", "approved");
  if (error) throw error;
  return Array.from(
    new Set((data ?? []).map((row) => String(row.spree_customer_id)).filter(Boolean)),
  );
}

async function syncSpecialPriceListRules(
  config: ConfigRow,
  program: SpecialPricingProgram,
  priceList: SpreePriceList,
): Promise<number> {
  const customerIds = await approvedSpecialCustomerIds(program.code);

  await spreeRequest(config, "PATCH", "/price_lists/" + encodeURIComponent(priceList.id), {
    rules: customerIds.length
      ? [{
          type: "user_rule",
          preferences: { user_ids: customerIds },
        }]
      : [],
  });

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
  if (!Number.isFinite(targetMargin) || targetMargin < 0 || targetMargin >= 0.95) {
    throw new Error("Margen especial inválido");
  }

  const { data, error } = await supabase
    .from("devir_sync_catalog")
    .select("supplier_sku,spree_variant_id,snapshot")
    .not("spree_variant_id", "is", null)
    .order("supplier_sku");
  if (error) throw error;

  const rows = [];
  const seenVariants = new Set<string>();
  for (const row of data ?? []) {
    const sku = String(row.supplier_sku ?? "");
    const variantId = String(row.spree_variant_id ?? "");
    if (!sku || !variantId || seenVariants.has(variantId)) continue;
    if (program.exclude_fixed_price_books && isFixedPriceBookSku(sku)) continue;
    const cost = Number((row.snapshot as Json | null)?.purchasePrice);
    if (!Number.isFinite(cost) || cost <= 0) continue;

    seenVariants.add(variantId);
    rows.push({
      variant_id: variantId,
      currency: "EUR",
      price_list_id: priceList.id,
      amount: specialProgramPrice(cost, targetMargin, sku),
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
  const approvedCustomers = await syncSpecialPriceListRules(config, program, priceList);

  return {
    code: program.code,
    price_list_id: priceList.id,
    target_margin: Number(program.target_margin),
    ...(priceRows === undefined ? {} : { price_rows: priceRows }),
    approved_customers: approvedCustomers,
  };
}

async function validateSpreeAdminKey(spreeApiUrl: string, key: string): Promise<void> {
  if (!key.startsWith("sk_")) throw new Error("La clave de Spree no es una Secret API Key válida.");
  const response = await fetch(
    spreeApiUrl.replace(/\/$/, "") + "/api/v3/admin/products?limit=1",
    { headers: { accept: "application/json", "x-spree-api-key": key } },
  );
  if (!response.ok) {
    throw new Error("Spree rechazó la Secret API Key (" + response.status + ").");
  }
}

async function operatorAuthorized(config: ConfigRow, provided: string): Promise<boolean> {
  if (!provided || !config.spree_admin_api_key) return false;
  return (await sha256(provided)) === (await sha256(config.spree_admin_api_key));
}

async function operatorAction(
  action: string,
  req: Request,
  config: ConfigRow,
  body: Record<string, unknown>,
): Promise<Response> {
  const providedKey = req.headers.get("x-spree-admin-key") ?? "";

  if (action === "bootstrap") {
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
        ? body.sessionState as ConfigRow["session_state"]
        : null;

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
    await devirFetch(probeConfig, baseUrl.replace(/\/$/, "") + "/customer/account/");

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
      message: "Bootstrap validado contra Devir y Spree. Primer ciclo solicitado.",
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
    (await sha256(maintenanceToken)) === "290c5db8077905eccba99105da185e84c25c6a78093910e599343e7bf42cba6a";

  if (!maintenanceAuthorized && !(await operatorAuthorized(config, providedKey))) {
    return json({ error: "unauthorized" }, 401);
  }

  if (action === "credentials") {
    if (!(await operatorAuthorized(config, providedKey))) {
      return json({ error: "unauthorized" }, 401);
    }
    const username = typeof body.username === "string" ? body.username.trim() : "";
    const password = typeof body.password === "string" ? body.password : "";
    if (!username || !password) return json({ error: "credentials_required" }, 400);

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

  if (action === "status") {
    const { data: cycles, error: cyclesError } = await supabase
      .from("devir_sync_cycles")
      .select(
        "id,status,started_at,finished_at,category_count,product_count,processed_count,error_count,error",
      )
      .order("started_at", { ascending: false })
      .limit(5);
    if (cyclesError) throw cyclesError;

    let jobs = {
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
        const status = row.status as "pending" | "done" | "error" | "processing";
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
        last_attempt_at: (config as ConfigRow & { last_attempt_at?: string | null }).last_attempt_at ?? null,
        last_success_at: (config as ConfigRow & { last_success_at?: string | null }).last_success_at ?? null,
        last_error: (config as ConfigRow & { last_error?: string | null }).last_error ?? null,
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

  if (action === "inspect-devir-source") {
    const url = typeof body.url === "string" ? body.url.trim() : "";
    if (!url || !url.startsWith(config.base_url)) return json({ error: "invalid_devir_url" }, 400);
    const html = await devirFetch(config, url);
    const product = parseProduct(html, url);
    const snippets = Array.from(
      new Set(
        Array.from(html.matchAll(/.{0,180}(?:Disponibilidad|stock|is_in_stock|isInStock|tocart|AddToCart|salable|saleable|data-price|price-box|old-price|special-price|regular-price).{0,320}/gi))
          .map((match) => stripHtml(match[0]).slice(0, 500))
          .filter(Boolean),
      ),
    ).slice(0, 20);
    return json({
      ok: true,
      final_url: url,
      product,
      has_add_to_cart: /tocart|AddToCart|product-add-form|action\s+primary\s+tocart/i.test(html),
      snippets,
    });
  }

  if (action === "verify-devir-batch") {
    const offset = Math.max(0, Number(body.offset ?? 0) || 0);
    const limit = Math.min(100, Math.max(1, Number(body.limit ?? 50) || 50));
    return json({ ok: true, ...(await verifyDevirBatch(config, offset, limit)) });
  }

  if (action === "repair-categories") {
    await updateReviewFieldLabels(config);
    return json({
      ok: true,
      ...(await repairCategoryTreeAndMembership(config)),
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

  if (action === "special-pricing-setup") {
    const code = typeof body.code === "string" ? body.code.trim().toUpperCase() : "BISON3";
    return json({ ok: true, ...(await syncSpecialPricingProgram(config, code, true)) });
  }

  if (action === "special-pricing-status") {
    const code = typeof body.code === "string" ? body.code.trim().toUpperCase() : "BISON3";
    const program = await getSpecialProgram(code);
    const { data: requests, error } = await supabase
      .from("special_pricing_requests")
      .select("id,spree_customer_id,email,status,requested_at,decided_at,note")
      .eq("program_code", code)
      .order("requested_at", { ascending: false });
    if (error) throw error;
    return json({ ok: true, program, requests: requests ?? [] });
  }

  if (action === "special-pricing-approve" || action === "special-pricing-reject") {
    const requestId = typeof body.requestId === "string" ? body.requestId.trim() : "";
    if (!requestId) return json({ error: "request_id_required" }, 400);
    const status = action === "special-pricing-approve" ? "approved" : "rejected";
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
      ...(await syncSpecialPricingProgram(config, String(requestRow.program_code), false)),
    });
  }

  if (action === "special-pricing-set-margin") {
    const code = typeof body.code === "string" ? body.code.trim().toUpperCase() : "BISON3";
    const targetMargin = Number(body.targetMargin);
    if (!Number.isFinite(targetMargin) || targetMargin < 0 || targetMargin >= 0.95) {
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
    return json({ ok: true, ...(await syncSpecialPricingProgram(config, code, true)) });
  }

  if (action === "catalog-pricing-setup") {
    const categories = await setupCatalogCategoriesAndMargins(config);
    return json({ ok: true, categories });
  }

  if (action === "categorize-drafts") {
    const offset = Math.max(0, Number(body.offset ?? 0) || 0);
    const limit = Math.min(100, Math.max(1, Number(body.limit ?? 50) || 50));
    return json({
      ok: true,
      ...(await categorizeDraftBatch(config, offset, limit)),
    });
  }

  if (action === "regroup-preview") {
    const { data, error } = await supabase
      .from("devir_sync_catalog")
      .select("group_key,group_name,variant_position,variant_label,spree_product_id")
      .eq("item_kind", "variant_candidate")
      .eq("grouping_confidence", "high")
      .not("group_key", "is", null)
      .order("group_key");
    if (error) throw error;

    const groups = new Map<string, { name: string; count: number; positions: Map<number, number> }>();
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
          duplicate_positions: Array.from(value.positions.entries()).filter(([, count]) => count > 1).map(([position]) => position),
        })),
    });
  }

  if (action === "regroup") {
    const groupKey = typeof body.groupKey === "string" ? body.groupKey.trim() : "";
    if (!groupKey) return json({ error: "group_key_required" }, 400);
    return json(await migrateCatalogGroup(config, groupKey));
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
  const rows = categories.map((url) => ({ cycle_id: cycle.id, kind: "category", url, page: 1, status: "pending" }));
  if (rows.length) {
    const { error } = await supabase.from("devir_sync_jobs").upsert(rows, { onConflict: "cycle_id,kind,url,page", ignoreDuplicates: true });
    if (error) throw error;
  }
  const { error: configError } = await supabase
    .from("devir_sync_config")
    .update({ phase: "categories", active_cycle_id: cycle.id, last_error: null, updated_at: new Date().toISOString() })
    .eq("id", "primary");
  if (configError) throw configError;
  return cycle.id;
}

async function processCategories(config: ConfigRow, cycleId: string): Promise<{ done: boolean; processed: number }> {
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
    await supabase.from("devir_sync_jobs").update({ status: "processing", attempts: job.attempts + 1, updated_at: new Date().toISOString() }).eq("id", job.id);
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
        await supabase.from("devir_sync_jobs").upsert(productRows, { onConflict: "cycle_id,kind,url,page", ignoreDuplicates: true });
        if (job.page < config.max_pages) {
          await supabase.from("devir_sync_jobs").upsert({
            cycle_id: cycleId,
            kind: "category",
            url: job.url,
            page: job.page + 1,
            status: "pending",
          }, { onConflict: "cycle_id,kind,url,page", ignoreDuplicates: true });
        }
      }
      await supabase.from("devir_sync_jobs").update({ status: "done", payload: { links: links.length }, updated_at: new Date().toISOString() }).eq("id", job.id);
      processed += 1;
    } catch (err) {
      await supabase.from("devir_sync_jobs").update({ status: "error", error: String(err), updated_at: new Date().toISOString() }).eq("id", job.id);
    }
  }
  return { done: false, processed };
}

async function processProducts(config: ConfigRow, cycleId: string): Promise<{ done: boolean; processed: number; images: number; reviews: number }> {
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
    await supabase.from("devir_sync_jobs").update({ status: "processing", attempts: job.attempts + 1, updated_at: new Date().toISOString() }).eq("id", job.id);
    try {
      const html = await devirFetch(config, job.url);
      const product = parseProduct(html, job.url);
      if (!product) throw new Error("Ficha sin SKU reconocible");
      const signature = await sha256(product.imageUrls.join("\n"));
      const grouping = groupingInfo(product);
      const synced = await syncProductToSpree(config, product, categories, defs);
      const now = new Date().toISOString();
      const { error: catalogError } = await supabase.from("devir_sync_catalog").upsert({
        supplier_sku: product.sku,
        source_url: product.url,
        name: product.name,
        snapshot: product,
        image_urls: product.imageUrls,
        image_signature: signature,
        spree_product_id: synced.productId,
        spree_variant_id: synced.variantId,
        ...(synced.lastAutoPrice !== null ? { last_auto_price: synced.lastAutoPrice } : {}),
        supplier_status: product.availability,
        missing_cycles: 0,
        item_kind: grouping.itemKind,
        group_key: grouping.groupKey,
        group_name: grouping.groupName,
        variant_label: grouping.variantLabel,
        variant_position: grouping.variantPosition,
        grouping_confidence: grouping.confidence,
        ...(product.availability === "available" ? { last_confirmed_available_at: now } : {}),
        last_seen_cycle_id: cycleId,
        last_seen_at: now,
        last_synced_at: now,
        last_error: null,
        updated_at: now,
      }, { onConflict: "supplier_sku" });
      if (catalogError) throw catalogError;
      await supabase.from("devir_sync_jobs").update({
        status: "done",
        payload: { sku: product.sku, images: synced.images, review: synced.review, backorder_items: synced.backorderItems },
        updated_at: new Date().toISOString(),
      }).eq("id", job.id);
      processed += 1;
      images += synced.images;
      if (synced.review) reviews += 1;
    } catch (err) {
      await supabase.from("devir_sync_jobs").update({ status: "error", error: String(err), updated_at: new Date().toISOString() }).eq("id", job.id);
    }
  }
  return { done: false, processed, images, reviews };
}

async function finishCycle(config: ConfigRow, cycleId: string): Promise<void> {
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
    .select("supplier_sku,missing_cycles,spree_variant_id")
    .or(`last_seen_cycle_id.is.null,last_seen_cycle_id.neq.${cycleId}`);
  if (missingReadError) throw missingReadError;

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

    // A SKU absent from two complete supplier crawls can no longer be sold
    // against Devir stock. Preserve any physical count_on_hand, but stop
    // accepting supplier-backed backorders immediately.
    if (missing && row.spree_variant_id) {
      await syncBackorderability(config, row.spree_variant_id, "unavailable");
    }
  }

  const { count: products } = await supabase
    .from("devir_sync_jobs")
    .select("*", { head: true, count: "exact" })
    .eq("cycle_id", cycleId)
    .eq("kind", "product");
  const { count: errors } = await supabase
    .from("devir_sync_jobs")
    .select("*", { head: true, count: "exact" })
    .eq("cycle_id", cycleId)
    .eq("status", "error");
  const now = new Date();
  const next = new Date(now.getTime() + config.interval_hours * 60 * 60 * 1000);
  await supabase.from("devir_sync_cycles").update({
    status: (errors ?? 0) > 0 ? "error" : "success",
    finished_at: now.toISOString(),
    product_count: products ?? 0,
    error_count: errors ?? 0,
  }).eq("id", cycleId);
  await supabase.from("devir_sync_config").update({
    phase: "idle",
    active_cycle_id: null,
    next_due_at: next.toISOString(),
    last_success_at: (errors ?? 0) > 0 ? undefined : now.toISOString(),
    last_error: (errors ?? 0) > 0 ? String(errors) + " jobs terminaron con error" : null,
    updated_at: now.toISOString(),
  }).eq("id", "primary");
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  let body: Record<string, unknown> = {};
  try {
    body = await req.json() as Record<string, unknown>;
  } catch {
    body = {};
  }

  const { data: configData, error: configError } = await supabase
    .from("devir_sync_config")
    .select("*")
    .eq("id", "primary")
    .single();
  if (configError) return json({ error: "config", detail: configError.message }, 500);
  const config = configData as ConfigRow;

  const action = typeof body.action === "string" ? body.action : null;
  if (action) {
    try {
      return await operatorAction(action, req, config, body);
    } catch (error) {
      return json(
        { ok: false, error: error instanceof Error ? error.message : String(error) },
        400,
      );
    }
  }

  const token = req.headers.get("x-devir-worker-token") ?? "";
  if (!token || !config.worker_token_hash || (await sha256(token)) !== config.worker_token_hash) {
    return json({ error: "unauthorized" }, 401);
  }

  const { data: lock, error: lockError } = await supabase.rpc("devir_sync_acquire_lock", { p_seconds: 120 });
  if (lockError) return json({ error: "lock", detail: lockError.message }, 500);
  if (!lock) return json({ ok: true, skipped: "locked" });

  try {
    if (!config.enabled) return json({ ok: true, skipped: "disabled" });
    if (!config.session_state || !config.spree_admin_api_key) {
      return json({ ok: false, skipped: "bootstrap_required" }, 409);
    }

    let cycleId = config.active_cycle_id;
    let phase = config.phase;
    if (!cycleId) {
      if (new Date(config.next_due_at).getTime() > Date.now()) {
        return json({ ok: true, skipped: "not_due", next_due_at: config.next_due_at });
      }
      cycleId = await startCycle(config);
      phase = "categories";
    }

    if (phase === "categories") {
      const categoryResult = await processCategories(config, cycleId);
      const productResult = await processProducts(config, cycleId);

      if (categoryResult.done && productResult.done) {
        await finishCycle(config, cycleId);
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
        await finishCycle(config, cycleId);
        return json({ ok: true, cycle_id: cycleId, phase: "complete" });
      }
      return json({ ok: true, cycle_id: cycleId, phase: "products", processed: result.processed, images: result.images, reviews: result.reviews });
    }

    return json({ ok: false, cycle_id: cycleId, phase, error: configData.last_error }, 409);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await supabase.from("devir_sync_config").update({ phase: "error", last_error: message, updated_at: new Date().toISOString() }).eq("id", "primary");
    if (config.active_cycle_id) {
      await supabase.from("devir_sync_cycles").update({ status: "error", error: message, finished_at: new Date().toISOString() }).eq("id", config.active_cycle_id);
    }
    return json({ ok: false, error: message }, 500);
  } finally {
    await supabase.rpc("devir_sync_release_lock");
  }
});
