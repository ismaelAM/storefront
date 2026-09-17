import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

interface DevirProduct {
  sku: string;
  name: string;
  price: number | null;
  minPrice: number | null;
  maxPrice: number | null;
  purchasePrice: number | null;
  availability: string;
  releaseDate: string | null;
}

interface SpreeVariant {
  id: string;
  sku: string | null;
  price?: string | number | null;
  cost_price?: string | number | null;
  currency?: string | null;
  preorderable?: boolean;
  preorder_ships_at?: string | null;
}

interface SpreeProduct {
  id: string;
  name: string;
  slug?: string;
  variants?: SpreeVariant[];
  default_variant?: SpreeVariant | null;
}

interface SpreeListResponse {
  data: SpreeProduct[];
  meta?: { page?: number; pages?: number; total_count?: number };
}

const catalogPath = resolve(
  process.env.DEVIR_B2B_OUTPUT ?? ".local/devir-b2b-catalog.json",
);
const spreeApiUrl = process.env.SPREE_API_URL?.replace(/\/$/, "");
const adminApiKey = process.env.SPREE_ADMIN_API_KEY;
const pageSize = Number(process.env.DEVIR_SPREE_PAGE_SIZE ?? "100");
const maxPages = Number(process.env.DEVIR_SPREE_MAX_PAGES ?? "100");

if (!spreeApiUrl) {
  throw new Error("Falta SPREE_API_URL.");
}
if (!adminApiKey) {
  throw new Error(
    "Falta SPREE_ADMIN_API_KEY. Debe ser una secret key de Admin API con al menos read_products.",
  );
}
const spreeAdminApiKey = adminApiKey;

async function spreeGet<T>(path: string): Promise<T> {
  const response = await fetch(`${spreeApiUrl}/api/v3/admin${path}`, {
    headers: {
      Accept: "application/json",
      "X-Spree-Api-Key": spreeAdminApiKey,
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `Spree Admin API ${response.status} en ${path}: ${body.slice(0, 500)}`,
    );
  }

  return (await response.json()) as T;
}

async function loadSpreeVariants(): Promise<Map<string, { product: SpreeProduct; variant: SpreeVariant }>> {
  const bySku = new Map<
    string,
    { product: SpreeProduct; variant: SpreeVariant }
  >();

  for (let page = 1; page <= maxPages; page += 1) {
    const params = new URLSearchParams({
      page: String(page),
      limit: String(pageSize),
      expand: "variants,default_variant",
    });
    const response = await spreeGet<SpreeListResponse>(`/products?${params}`);

    for (const product of response.data ?? []) {
      const variants = product.variants?.length
        ? product.variants
        : product.default_variant
          ? [product.default_variant]
          : [];

      for (const variant of variants) {
        const sku = variant.sku?.trim();
        if (!sku) continue;
        if (bySku.has(sku)) {
          throw new Error(`SKU duplicado en Spree: ${sku}`);
        }
        bySku.set(sku, { product, variant });
      }
    }

    const pages = response.meta?.pages ?? page;
    console.log(`Spree: página ${page}/${pages} — ${bySku.size} SKUs indexados.`);
    if (page >= pages || response.data.length === 0) break;
  }

  return bySku;
}

async function main(): Promise<void> {
  const catalog = JSON.parse(await readFile(catalogPath, "utf8")) as {
    products: DevirProduct[];
  };
  const products = catalog.products ?? [];

  if (!products.length) {
    throw new Error(`El catálogo Devir está vacío: ${catalogPath}`);
  }

  const spreeBySku = await loadSpreeVariants();
  let matched = 0;
  let missing = 0;

  console.log("\nDRY-RUN — no se modifica Spree.\n");

  for (const devir of products) {
    const match = spreeBySku.get(devir.sku);

    if (!match) {
      missing += 1;
      console.log(
        `MISS  ${devir.sku} — ${devir.name} — no existe una variante con ese SKU en Spree`,
      );
      continue;
    }

    matched += 1;
    const { product, variant } = match;
    const spreePrice =
      variant.price === null || variant.price === undefined
        ? "—"
        : `${variant.price} ${variant.currency ?? "EUR"}`;

    console.log(
      `MATCH ${devir.sku} — ${product.name} — variante ${variant.id} — Spree: ${spreePrice} — Devir coste: ${devir.purchasePrice ?? "—"} € — estado: ${devir.availability}`,
    );
  }

  console.log(
    `\nResultado: ${matched} encontrados, ${missing} no encontrados, ${products.length} Devir en total.`,
  );
  console.log(
    "No se han enviado PATCH/POST/DELETE y no se han escrito precios, stock ni estados.",
  );

  if (missing > 0) {
    process.exitCode = 2;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
