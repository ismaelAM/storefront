import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { chromium, type Page } from "@playwright/test";
import { loadLocalEnv } from "./load-local-env";

loadLocalEnv();

type Availability = "available" | "preorder" | "unavailable" | "unknown";

interface DevirProduct {
  source: "devir-b2b";
  url: string;
  devirProductId?: string;
  sku: string;
  name: string;
  price: number | null;
  minPrice: number | null;
  maxPrice: number | null;
  purchasePrice: number | null;
  availability: Availability;
  availabilityLabel: string | null;
  releaseDate: string | null;
}

const baseUrl = process.env.DEVIR_B2B_BASE_URL ?? "https://b2bdevir.es";
const hyperMode =
  process.argv.includes("--hyper") ||
  ["1", "true", "yes"].includes((process.env.DEVIR_B2B_DISCOVER_CATEGORIES ?? "").toLowerCase());
const resumeMode = process.argv.includes("--resume");
const configuredCategoryUrls = (process.env.DEVIR_B2B_CATEGORIES ??
  `${baseUrl}/juegos-de-cartas-coleccionables`)
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);
const profilePath = resolve(
  process.env.DEVIR_B2B_PROFILE_DIR ?? ".secrets/devir-b2b-profile",
);
const statePath = resolve(
  process.env.DEVIR_B2B_STATE_PATH ?? ".secrets/devir-b2b-state.json",
);
const outputPath = resolve(
  process.env.DEVIR_B2B_OUTPUT ?? ".local/devir-b2b-catalog.json",
);
const checkpointPath = resolve(
  process.env.DEVIR_B2B_CHECKPOINT ?? ".local/devir-b2b-catalog.checkpoint.json",
);
const maxPages = Number(process.env.DEVIR_B2B_MAX_PAGES ?? (hyperMode ? "200" : "50"));
const maxProducts = Number(process.env.DEVIR_B2B_MAX_PRODUCTS ?? "0");
const delayMs = Number(process.env.DEVIR_B2B_DELAY_MS ?? "1200");
const timeoutMs = Number(process.env.DEVIR_B2B_TIMEOUT_MS ?? "30000");

function sleep(ms: number): Promise<void> {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

interface ScanCheckpoint {
  source: "devir-b2b";
  generatedAt: string;
  complete: boolean;
  mode: "standard" | "hyper";
  categories: string[];
  productUrls: string[];
  products: DevirProduct[];
  errors: Array<{ url: string; message: string }>;
}

async function writeCheckpoint(checkpoint: ScanCheckpoint): Promise<void> {
  await mkdir(dirname(checkpointPath), { recursive: true });
  await writeFile(checkpointPath, JSON.stringify(checkpoint, null, 2));
}

async function readCheckpoint(): Promise<ScanCheckpoint | null> {
  if (!resumeMode) return null;
  try {
    const { readFile } = await import("node:fs/promises");
    return JSON.parse(await readFile(checkpointPath, "utf8")) as ScanCheckpoint;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

function parseNumber(value: string | undefined): number | null {
  if (!value) return null;
  const normalized = value
    .replace(/\s/g, "")
    .replace(/€/g, "")
    .replace(/\./g, "")
    .replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizePriceAmount(value: string | undefined): number | null {
  const parsed = parseNumber(value);
  if (parsed === null) return null;

  // Devir B2B currently exposes some prices as whole euros (e.g. 49)
  // and others as euro cents without a decimal separator (e.g. 12412 = 124.12 €).
  // Keep the reader's output consistently expressed in euros.
  if (Number.isInteger(parsed) && Math.abs(parsed) >= 1000) {
    return parsed / 100;
  }

  return parsed;
}

function normalizeReleaseDate(value: string | null): string | null {
  if (!value) return null;
  const match = value.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (!match) return null;
  return `${match[3]}-${match[2]}-${match[1]}`;
}

function canonicalizeUrl(value: string, sourceUrl: string): string | null {
  try {
    const url = new URL(value, sourceUrl);
    if (url.origin !== new URL(baseUrl).origin) return null;
    url.hash = "";
    url.search = "";
    return url.toString();
  } catch {
    return null;
  }
}

function isLikelyCategoryUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.origin !== new URL(baseUrl).origin) return false;
    const path = url.pathname.replace(/\/+$/, "");
    if (!path) return false;
    return ![
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
    ].some((prefix) => path === prefix || path.startsWith(prefix + "/"));
  } catch {
    return false;
  }
}

async function discoverCategoryUrls(page: Page): Promise<string[]> {
  await page.goto(baseUrl + "/", { waitUntil: "domcontentloaded", timeout: timeoutMs });
  const selectors = [
    '[data-action="navigation"] li.category-item a[href]',
    'nav.navigation li.category-item a[href]',
    '.navigation li.category-item a[href]',
  ];
  const found: string[] = [];
  for (const selector of selectors) {
    const hrefs = await page.locator(selector).evaluateAll((anchors) =>
      anchors.map((anchor) => (anchor as HTMLAnchorElement).href).filter(Boolean),
    );
    found.push(...hrefs);
  }
  if (!found.length) {
    for (const selector of ['[data-action="navigation"] a[href]', 'nav.navigation a[href]']) {
      const hrefs = await page.locator(selector).evaluateAll((anchors) =>
        anchors.map((anchor) => (anchor as HTMLAnchorElement).href).filter(Boolean),
      );
      found.push(...hrefs);
    }
  }
  const categories = Array.from(
    new Set(
      found
        .map((href) => canonicalizeUrl(href, page.url()))
        .filter((href): href is string => href !== null && isLikelyCategoryUrl(href)),
    ),
  );
  console.log(`Hyper: ${categories.length} categorías descubiertas desde la navegación autenticada.`);
  for (const category of categories) console.log(`  + ${category}`);
  return categories;
}

async function collectProductLinks(page: Page): Promise<string[]> {
  const links = await page
    .locator("a.product-item-link[href], .product-item a.product-item-link[href]")
    .evaluateAll((anchors) =>
      anchors.map((anchor) => (anchor as HTMLAnchorElement).href).filter(Boolean),
    );

  const fallbackLinks =
    links.length > 0
      ? links
      : await page.locator(".product-item a[href]").evaluateAll((anchors) =>
          anchors.map((anchor) => (anchor as HTMLAnchorElement).href).filter(Boolean),
        );

  return Array.from(
    new Set(
      fallbackLinks
        .map((href) => canonicalizeUrl(href, page.url()))
        .filter((href): href is string => Boolean(href)),
    ),
  );
}

async function readProduct(page: Page, url: string): Promise<DevirProduct | null> {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: timeoutMs });
  await page.waitForSelector(".product-info-stock-sku, .product-info-price", {
    timeout: timeoutMs,
  });

  const data = await page.evaluate(() => {
    const priceRoot = document.querySelector(".product-info-price");
    const finalNode = priceRoot?.querySelector<HTMLElement>(
      '[data-price-type="finalPrice"]',
    );
    const minNode = priceRoot?.querySelector<HTMLElement>(
      '[data-price-type*="minPrice"], [class*="min-price"] [data-price-amount], [class*="min-price"][data-price-amount]',
    );
    const maxNode = priceRoot?.querySelector<HTMLElement>(
      '[data-price-type*="maxPrice"], [class*="max-price"] [data-price-amount], [class*="max-price"][data-price-amount]',
    );

    const stockRoot = document.querySelector<HTMLElement>(
      ".product-info-stock-sku .stock",
    );
    const stockText =
      stockRoot?.querySelector("span:not(.label)")?.textContent?.trim() ??
      stockRoot?.textContent?.replace(/Disponibilidad:\s*/i, "").trim() ??
      null;
    const stockClass = stockRoot?.className ?? "";
    const releaseText =
      document.querySelector(".product-item-dateavl")?.textContent?.trim() ?? null;

    return {
      devirProductId:
        priceRoot
          ?.querySelector<HTMLElement>("[data-role=priceBox]")
          ?.getAttribute("data-product-id") ?? null,
      sku: document.querySelector('[itemprop="sku"]')?.textContent?.trim() ?? "",
      name:
        document.querySelector<HTMLElement>("h1.page-title")?.textContent?.trim() ??
        document.title.trim(),
      finalPrice: finalNode?.dataset.priceAmount ?? null,
      minPrice: minNode?.dataset.priceAmount ?? null,
      maxPrice: maxNode?.dataset.priceAmount ?? null,
      stockText,
      stockClass,
      releaseText,
    };
  });

  if (!data.sku) {
    console.warn(`Omitido sin SKU: ${url}`);
    return null;
  }

  const finalPrice = normalizePriceAmount(data.finalPrice ?? undefined);
  const minPrice = normalizePriceAmount(data.minPrice ?? undefined);
  const maxPrice = normalizePriceAmount(data.maxPrice ?? undefined);
  const purchasePrice = maxPrice ?? finalPrice ?? minPrice;
  const rawAvailability = data.stockText ?? "";
  const availability: Availability =
    /no est[aá] disponible|agotad/i.test(rawAvailability) ||
    /\bunavailable\b/i.test(data.stockClass)
      ? "unavailable"
      : /pre\s*reserva/i.test(rawAvailability)
        ? "preorder"
        : /disponible/i.test(rawAvailability) || /\bavailable\b/i.test(data.stockClass)
          ? "available"
          : "unknown";

  return {
    source: "devir-b2b",
    url,
    devirProductId: data.devirProductId ?? undefined,
    sku: data.sku,
    name: data.name,
    price: finalPrice ?? purchasePrice,
    minPrice,
    maxPrice,
    purchasePrice,
    availability,
    availabilityLabel: rawAvailability || null,
    releaseDate: normalizeReleaseDate(data.releaseText),
  };
}

async function main(): Promise<void> {
  if (!Number.isFinite(maxPages) || maxPages <= 0) throw new Error("DEVIR_B2B_MAX_PAGES debe ser > 0.");
  if (!Number.isFinite(maxProducts) || maxProducts < 0) throw new Error("DEVIR_B2B_MAX_PRODUCTS debe ser >= 0.");
  if (!Number.isFinite(delayMs) || delayMs < 250) throw new Error("DEVIR_B2B_DELAY_MS debe ser >= 250 ms.");

  const browser = await chromium.launchPersistentContext(profilePath, {
    headless: true,
  });

  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(timeoutMs);

    const accountResponse = await page.goto(`${baseUrl}/customer/account/`, {
      waitUntil: "domcontentloaded",
      timeout: timeoutMs,
    });
    if (page.url().includes("/customer/account/login")) {
      throw new Error(
        `La sesión B2B de Devir no está autenticada (HTTP ${accountResponse?.status() ?? "desconocido"}). Ejecuta primero pnpm devir:login.`,
      );
    }

    const discovered = hyperMode ? await discoverCategoryUrls(page) : [];
    const categoryUrls = Array.from(new Set([...configuredCategoryUrls, ...discovered]));
    if (!categoryUrls.length) throw new Error("No hay categorías configuradas o descubiertas.");

    console.log(
      `Modo ${hyperMode ? "HYPER" : "normal"}: ${categoryUrls.length} categorías, hasta ${maxPages} páginas por categoría, delay ${delayMs} ms.`,
    );

    const checkpoint = await readCheckpoint();
    const productUrls = new Set<string>(
      checkpoint && !checkpoint.complete && checkpoint.mode === (hyperMode ? "hyper" : "standard")
        ? checkpoint.productUrls
        : [],
    );
    const productsBySku = new Map<string, DevirProduct>(
      checkpoint && !checkpoint.complete && checkpoint.mode === (hyperMode ? "hyper" : "standard")
        ? checkpoint.products.map((product) => [product.sku, product])
        : [],
    );
    const errors: Array<{ url: string; message: string }> =
      checkpoint && !checkpoint.complete ? [...checkpoint.errors] : [];
    const readUrls = new Set(
      Array.from(productsBySku.values(), (product) => product.url),
    );

    for (const categoryUrl of categoryUrls) {
    let lastPageProductCount = -1;

    for (let pageNumber = 1; pageNumber <= maxPages; pageNumber += 1) {
      const url = new URL(categoryUrl);
      if (pageNumber > 1) url.searchParams.set("p", String(pageNumber));

      console.log(`Categoría ${pageNumber}: ${url}`);
      await page.goto(url.toString(), {
        waitUntil: "domcontentloaded",
        timeout: timeoutMs,
      });

      const links = await collectProductLinks(page);
      const previousSize = productUrls.size;
      for (const link of links) productUrls.add(link);

      console.log(
        `  ${links.length} enlaces de producto; ${productUrls.size} acumulados.`,
      );

      if (maxProducts > 0 && productUrls.size >= maxProducts) break;
      if (
        links.length === 0 ||
        (productUrls.size === previousSize && links.length === lastPageProductCount)
      ) {
        break;
      }

      lastPageProductCount = links.length;
      await sleep(delayMs);
    }

    if (maxProducts > 0 && productUrls.size >= maxProducts) break;
  }

    const urls = Array.from(productUrls).slice(
      0,
      maxProducts > 0 ? maxProducts : undefined,
    );
    const alreadyRead = productsBySku.size;
    console.log(`Leyendo ${urls.length} productos (${alreadyRead} recuperados del checkpoint)...`);

    for (const [index, url] of urls.entries()) {
      if (readUrls.has(url)) continue;
      try {
        const product = await readProduct(page, url);
        if (product) {
          const previous = productsBySku.get(product.sku);
          if (previous && previous.url !== product.url) {
            console.warn(`  SKU duplicado ${product.sku}; se conserva la ficha más reciente leída.`);
          }
          productsBySku.set(product.sku, product);
          readUrls.add(product.url);
        }
        console.log(
          `  [${index + 1}/${urls.length}] ${product?.sku ?? "omitido"} — ${product?.name ?? ""}`,
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        errors.push({ url, message });
        console.error(`  Error leyendo ${url}: ${message}`);
      }

      if ((index + 1) % 25 === 0 || index === urls.length - 1) {
        await writeCheckpoint({
          source: "devir-b2b",
          generatedAt: new Date().toISOString(),
          complete: false,
          mode: hyperMode ? "hyper" : "standard",
          categories: categoryUrls,
          productUrls: urls,
          products: Array.from(productsBySku.values()),
          errors,
        });
        console.log(`  Checkpoint: ${productsBySku.size} SKUs guardados.`);
      }

      if (index < urls.length - 1) await sleep(delayMs);
    }

    const products = Array.from(productsBySku.values()).sort((a, b) =>
      a.sku.localeCompare(b.sku),
    );

    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(
      outputPath,
      JSON.stringify(
        {
          source: "devir-b2b",
          generatedAt: new Date().toISOString(),
          complete: true,
          mode: hyperMode ? "hyper" : "standard",
          categories: categoryUrls,
          categoryCount: categoryUrls.length,
          productUrlCount: urls.length,
          productCount: products.length,
          failedProductCount: errors.length,
          products,
          errors,
        },
        null,
        2,
      ),
    );

    await writeCheckpoint({
      source: "devir-b2b",
      generatedAt: new Date().toISOString(),
      complete: true,
      mode: hyperMode ? "hyper" : "standard",
      categories: categoryUrls,
      productUrls: urls,
      products,
      errors,
    });
    console.log(
      `Catálogo guardado en ${outputPath}: ${products.length} SKUs únicos, ${errors.length} errores de ficha.`,
    );
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});