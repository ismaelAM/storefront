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
const categoryUrls = (process.env.DEVIR_B2B_CATEGORIES ??
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
const maxPages = Number(process.env.DEVIR_B2B_MAX_PAGES ?? "50");
const maxProducts = Number(process.env.DEVIR_B2B_MAX_PRODUCTS ?? "0");
const delayMs = Number(process.env.DEVIR_B2B_DELAY_MS ?? "1200");
const timeoutMs = Number(process.env.DEVIR_B2B_TIMEOUT_MS ?? "30000");

function sleep(ms: number): Promise<void> {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
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
  if (!categoryUrls.length) throw new Error("No hay categorías configuradas.");

  const browser = await chromium.launchPersistentContext(profilePath, {
    headless: true,
  });
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

  const productUrls = new Set<string>();

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
  const products: DevirProduct[] = [];

  console.log(`Leyendo ${urls.length} productos...`);
  for (const [index, url] of urls.entries()) {
    try {
      const product = await readProduct(page, url);
      if (product) products.push(product);
      console.log(
        `  [${index + 1}/${urls.length}] ${product?.sku ?? "omitido"} — ${product?.name ?? ""}`,
      );
    } catch (error) {
      console.error(
        `  Error leyendo ${url}:`,
        error instanceof Error ? error.message : error,
      );
    }

    if (index < urls.length - 1) await sleep(delayMs);
  }

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(
    outputPath,
    JSON.stringify(
      {
        source: "devir-b2b",
        generatedAt: new Date().toISOString(),
        categories: categoryUrls,
        productCount: products.length,
        products,
      },
      null,
      2,
    ),
  );

  await browser.close();
  console.log(`Catálogo guardado en ${outputPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});