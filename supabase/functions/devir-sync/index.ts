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
  availability: "available" | "preorder" | "unavailable" | "unknown";
  availabilityLabel: string | null;
  releaseDate: string | null;
  imageUrls: string[];
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

async function devirFetch(config: ConfigRow, url: string): Promise<string> {
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
    throw new Error("La sesión B2B de Devir ha caducado; vuelve a ejecutar el bootstrap desde una sesión válida.");
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
  const stockHtml = html.match(/<[^>]*class=["'][^"']*stock[^"']*["'][^>]*>[\s\S]*?<\/[^>]+>/i)?.[0] ?? "";
  const stock = stripHtml(stockHtml);
  const availability =
    /no est[aá] disponible|agotad/i.test(stock) ? "unavailable" :
    /pre\s*reserva/i.test(stock) ? "preorder" :
    /disponible/i.test(stock) ? "available" : "unknown";
  return {
    sku,
    name,
    url,
    purchasePrice,
    availability,
    availabilityLabel: stock || null,
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

function categoryKey(product: DevirProduct): string | null {
  const value = (product.name + " " + product.url).toLowerCase();
  if (/\bmtg\b|magic|\/magic/.test(value)) return "tcg/mtg";
  if (/yugioh|yu-gi-oh|yu gi oh/.test(value)) return "tcg/yugioh";
  if (/juego de mesa|juegos-de-mesa/.test(value)) return "juegos-de-mesa";
  if (/accesorio|sleeves|fundas|deck box|tapete/.test(value)) return "accesorios";
  return null;
}

function priceFor(cost: number, margin: number): { grossCost: number; retail: number; effective: number } {
  const grossCost = cost * 1.21;
  let retail = Math.floor(grossCost / (1 - margin)) + 0.99;
  if (retail + 1e-9 < grossCost / (1 - margin)) retail += 1;
  retail = Math.round(retail * 100) / 100;
  return { grossCost, retail, effective: (retail - grossCost) / retail };
}

async function spreeRequest<T>(config: ConfigRow, method: string, path: string, body?: unknown): Promise<T> {
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

async function syncProductToSpree(
  config: ConfigRow,
  product: DevirProduct,
  categories: SpreeCategory[],
  defs: Map<string, SpreeFieldDefinition>,
): Promise<{ productId: string; variantId: string | null; images: number; review: boolean }> {
  if (!product.purchasePrice || product.purchasePrice <= 0) throw new Error("Producto sin coste Devir: " + product.sku);
  const key = categoryKey(product);
  const category = key ? categories.find((c) => c.permalink === key) ?? null : null;
  const configuredMargin = await categoryMargin(config, category);
  const targetMargin = configuredMargin ?? 0.25;
  const pricing = priceFor(product.purchasePrice, targetMargin);
  const reasons: string[] = [];
  if (!key || !category) reasons.push("category_unclassified");
  else if (configuredMargin === null) reasons.push("category_margin_unconfigured");
  if (isPack(product)) reasons.push("pack_requires_operator_split");
  const review = reasons.length > 0;
  const existing = await findSpreeProduct(config, product.sku);
  let productId: string;
  let variantId: string | null = null;
  let manualPrice = false;

  if (!existing) {
    const created = await spreeRequest<SpreeProduct>(config, "POST", "/products", {
      name: product.name,
      status: "draft",
      tags: ["devir", review ? "devir-review" : "devir-ready"],
      ...(category ? { category_ids: [category.id] } : {}),
      variants: [{
        options: [],
        sku: product.sku,
        cost_price: product.purchasePrice,
        cost_currency: "EUR",
        track_inventory: true,
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
    const lastAuto = Number(fields.find((f) => f.key === "pricing.last_synced_price")?.value);
    const currentPrice = variantPrice(existing.variant);
    const managed = (existing.product.tags ?? []).includes("devir");
    const active = existing.product.status === "active";
    const autoPrice = Number.isFinite(lastAuto) && currentPrice !== null && Math.abs(lastAuto - currentPrice) < 0.005;
    const canWritePrice = managed && !active && autoPrice;
    manualPrice = currentPrice !== null && !canWritePrice;
    const tags = Array.from(new Set([...(existing.product.tags ?? []), "devir", review ? "devir-review" : "devir-ready"]))
      .filter((tag) => review ? tag !== "devir-ready" : tag !== "devir-review");
    await spreeRequest(config, "PATCH", "/products/" + productId, {
      tags,
      ...(!active && managed ? { name: product.name } : {}),
      variants: [{
        id: existing.variant.id,
        sku: product.sku,
        cost_price: product.purchasePrice,
        cost_currency: "EUR",
        ...(canWritePrice ? { prices: [{ currency: "EUR", amount: pricing.retail }] } : {}),
      }],
    });
  }

  const effectivePrice = existing && manualPrice ? variantPrice(existing.variant) ?? pricing.retail : pricing.retail;
  const effectiveMargin = (effectivePrice - pricing.grossCost) / effectivePrice;
  await upsertProductFields(config, productId, defs, {
    "devir.supplier_sku": product.sku,
    "devir.source_url": product.url,
    "devir.category_key": key ?? undefined,
    "devir.availability": product.availability,
    "devir.release_date": product.releaseDate ?? undefined,
    "devir.review_status": review ? "review_required" : "ready",
    "devir.review_reasons": reasons.length ? reasons.join(", ") : "none",
    "devir.last_sync_at": new Date().toISOString(),
    "pricing.applied_margin": targetMargin,
    "pricing.effective_margin": effectiveMargin,
    "pricing.rule_source": configuredMargin !== null && category ? "spree_category:" + category.id : "default_reference",
    "pricing.vat_rate": 0.21,
    "pricing.cost_includes_vat": false,
    "pricing.last_synced_price": manualPrice ? undefined : pricing.retail,
    "pricing.manual_price_override": manualPrice,
  });

  const images = await syncImages(config, productId, product);
  return { productId, variantId, images, review };
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
      const synced = await syncProductToSpree(config, product, categories, defs);
      const { error: catalogError } = await supabase.from("devir_sync_catalog").upsert({
        supplier_sku: product.sku,
        source_url: product.url,
        name: product.name,
        snapshot: product,
        image_urls: product.imageUrls,
        image_signature: signature,
        spree_product_id: synced.productId,
        spree_variant_id: synced.variantId,
        last_seen_cycle_id: cycleId,
        last_seen_at: new Date().toISOString(),
        last_synced_at: new Date().toISOString(),
        last_error: null,
        updated_at: new Date().toISOString(),
      }, { onConflict: "supplier_sku" });
      if (catalogError) throw catalogError;
      await supabase.from("devir_sync_jobs").update({
        status: "done",
        payload: { sku: product.sku, images: synced.images, review: synced.review },
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

  const { data: configData, error: configError } = await supabase
    .from("devir_sync_config")
    .select("*")
    .eq("id", "primary")
    .single();
  if (configError) return json({ error: "config", detail: configError.message }, 500);
  const config = configData as ConfigRow;

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
      const result = await processCategories(config, cycleId);
      if (result.done) {
        await supabase.from("devir_sync_config").update({ phase: "products", updated_at: new Date().toISOString() }).eq("id", "primary");
      }
      return json({ ok: true, cycle_id: cycleId, phase: result.done ? "products" : "categories", processed: result.processed });
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
