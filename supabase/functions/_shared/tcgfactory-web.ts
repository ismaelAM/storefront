import {
  normalizeText,
  type SupplierAvailability,
} from "./catalog-sourcing.ts";

export const TCGFACTORY_BASE_URL = "https://tcgfactory.com";
export const TCGFACTORY_ACCESSORIES_URL =
  "https://tcgfactory.com/es/distribucion-accesorios";

export const TCGFACTORY_ACCESSORY_CATEGORY_SPECS = [
  { key: "accesorios/albumes", name: "Álbumes", slug: "albumes" },
  { key: "accesorios/cajas-mazo", name: "Cajas de mazo", slug: "cajas-mazo" },
  {
    key: "accesorios/bolsas-comics",
    name: "Bolsas para cómics",
    slug: "bolsas-comics",
  },
  { key: "accesorios/dados", name: "Dados", slug: "dados" },
  {
    key: "accesorios/fundas-juegos-mesa",
    name: "Fundas para juegos de mesa",
    slug: "fundas-juegos-mesa",
  },
  {
    key: "accesorios/fundas-standard",
    name: "Fundas Standard",
    slug: "fundas-standard",
  },
  {
    key: "accesorios/fundas-small",
    name: "Fundas Small",
    slug: "fundas-small",
  },
  { key: "accesorios/tapetes", name: "Tapetes", slug: "tapetes" },
  { key: "accesorios/almacenaje", name: "Almacenaje", slug: "almacenaje" },
  { key: "accesorios/otros", name: "Otros accesorios", slug: "otros" },
] as const;

export interface TcgFactoryPublicProduct {
  sourceUrl: string;
  externalProductId: string;
  externalVariantId: string;
  reference: string | null;
  ean: string | null;
  productName: string;
  categoryKey: string;
  manufacturer: string | null;
  manufacturerSku: string | null;
  options: Record<string, string>;
  referencePriceNet: number | null;
  availability: SupplierAvailability;
  reportedAvailability: string;
  releaseDate: string | null;
  imageUrls: string[];
  metadata: Record<string, unknown>;
}

export interface TcgFactoryListingPage {
  productUrls: string[];
  page: number;
  totalPages: number;
  totalItems: number | null;
}

function decodeHtml(value: string): string {
  const named: Record<string, string> = {
    amp: "&",
    quot: '"',
    apos: "'",
    lt: "<",
    gt: ">",
    nbsp: " ",
    aacute: "á",
    eacute: "é",
    iacute: "í",
    oacute: "ó",
    uacute: "ú",
    ntilde: "ñ",
    Aacute: "Á",
    Eacute: "É",
    Iacute: "Í",
    Oacute: "Ó",
    Uacute: "Ú",
    Ntilde: "Ñ",
  };
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) =>
      String.fromCodePoint(parseInt(hex, 16)),
    )
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&([a-z]+);/gi, (full, key) => named[key] ?? full);
}

function stripHtml(value: string): string {
  return decodeHtml(
    value
      .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
      .replace(/<br\s*\/?\s*>/gi, "\n")
      .replace(/<\/(?:p|div|li|dt|dd|tr|h[1-6])\s*>/gi, "\n")
      .replace(/<(?:p|div|li|dt|dd|tr|h[1-6])\b[^>]*>/gi, "\n")
      .replace(/<[^>]*>/g, " "),
  )
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}

function absoluteOfficialUrl(value: string, base: string): string | null {
  try {
    const url = new URL(decodeHtml(value), base);
    const official =
      url.hostname === "tcgfactory.com" ||
      url.hostname.endsWith(".tcgfactory.com");
    if (url.protocol !== "https:" || !official) return null;
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

function field(lines: string[], label: RegExp): string | null {
  for (let index = 0; index < lines.length; index += 1) {
    const current = lines[index];
    const sameLine = current.match(label);
    if (!sameLine) continue;
    const tail = current
      .slice(sameLine.index! + sameLine[0].length)
      .replace(/^\s*:\s*/, "")
      .trim();
    if (tail) return tail;
    for (
      let next = index + 1;
      next < Math.min(lines.length, index + 4);
      next += 1
    ) {
      if (lines[next]) return lines[next];
    }
  }
  return null;
}

function decimal(value: string | null | undefined): number | null {
  if (!value) return null;
  const match = value.replace(/\s/g, "").match(/\d+(?:[.,]\d{1,4})?/);
  if (!match) return null;
  const number = Number(match[0].replace(",", "."));
  return Number.isFinite(number) && number > 0 ? number : null;
}

function isoDate(value: string | null): string | null {
  if (!value) return null;
  const dmy = value.match(/(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/);
  if (dmy) {
    return `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;
  }
  const ymd = value.match(/(\d{4})-(\d{2})-(\d{2})/);
  return ymd ? ymd[0] : null;
}

export function mapTcgFactoryPublicAvailability(
  value: string | null | undefined,
): SupplierAvailability {
  const normalized = normalizeText(value ?? "");
  if (["disponible", "en-stock", "stock"].includes(normalized)) {
    return "available";
  }
  if (["preventa", "reserva", "preorder", "pre-order"].includes(normalized)) {
    return "preorder";
  }
  if (
    [
      "en-reposicion",
      "agotado",
      "sin-stock",
      "no-disponible",
      "descatalogado",
    ].includes(normalized)
  ) {
    return "unavailable";
  }
  return "unknown";
}

export function tcgFactoryAccessoryCategory(
  name: string,
  type: string | null | undefined,
): string {
  const value = normalizeText(`${type ?? ""} ${name}`);
  if (/\balbum/.test(value)) return "accesorios/albumes";
  if (/bolsas?.*comics?|comic.*bags?/.test(value)) {
    return "accesorios/bolsas-comics";
  }
  if (/caja.*mazo|deck-box|deck-storage|strongbox|alcove/.test(value)) {
    return "accesorios/cajas-mazo";
  }
  if (/almacenaje|storage-box|card-box|caja.*almacen/.test(value)) {
    return "accesorios/almacenaje";
  }
  if (/\bdados?\b|dice/.test(value)) return "accesorios/dados";
  if (/fundas.*juegos.*mesa|board-game.*sleeves/.test(value)) {
    return "accesorios/fundas-juegos-mesa";
  }
  if (/fundas.*small|small.*sleeves/.test(value)) {
    return "accesorios/fundas-small";
  }
  if (/fundas|sleeves/.test(value)) return "accesorios/fundas-standard";
  if (/tapete|playmat|game-mat|desk-mat/.test(value)) {
    return "accesorios/tapetes";
  }
  return "accesorios/otros";
}

function referencePriceFromHtml(html: string): number | null {
  const candidates = [
    /itemprop=["']price["'][^>]*content=["']([0-9.,]+)["']/i,
    /content=["']([0-9.,]+)["'][^>]*itemprop=["']price["']/i,
    /property=["']product:price:amount["'][^>]*content=["']([0-9.,]+)["']/i,
    /"price"\s*:\s*"?([0-9]+(?:[.,][0-9]+)?)/i,
    /data-product-price=["']([0-9.,]+)["']/i,
  ];
  for (const pattern of candidates) {
    const value = decimal(html.match(pattern)?.[1]);
    if (value !== null) return value;
  }
  return null;
}

export function parseTcgFactoryAuthenticatedPrice(html: string): number | null {
  const candidates = [
    /class=["'][^"']*current-price-value[^"']*["'][^>]*(?:content|data-price-amount)=["']([0-9.,]+)["']/i,
    /(?:content|data-price-amount)=["']([0-9.,]+)["'][^>]*class=["'][^"']*current-price-value/i,
    /class=["'][^"']*current-price[^"']*["'][\s\S]{0,300}?([0-9]+[.,][0-9]{2})\s*€/i,
    /data-product-price=["']([0-9.,]+)["']/i,
    /itemprop=["']price["'][^>]*content=["']([0-9.,]+)["']/i,
  ];
  for (const pattern of candidates) {
    const value = decimal(html.match(pattern)?.[1]);
    if (value !== null) return value;
  }
  return null;
}

function tcgFactoryProductSlug(sourceUrl: string): string | null {
  try {
    return (
      decodeURIComponent(new URL(sourceUrl).pathname.split("/").pop() ?? "")
        .replace(/\.html$/i, "")
        .trim() || null
    );
  } catch {
    return null;
  }
}

function imageFilename(value: string): string {
  try {
    return decodeURIComponent(new URL(value).pathname.split("/").pop() ?? "");
  } catch {
    return "";
  }
}

export function isTcgFactoryProductImageReference(
  value: string,
  sourceUrl: string,
): boolean {
  const slug = tcgFactoryProductSlug(sourceUrl);
  if (!slug) return false;
  const filename = imageFilename(value).replace(/\.[a-z0-9]{2,5}$/i, "");
  return filename === slug;
}

export function isTcgFactoryKnownPollutionMediaReference(
  value: string,
): boolean {
  const filename = imageFilename(value).toLowerCase();
  if (!filename) return false;
  if (/^\d+\.(?:jpe?g|png|webp)$/i.test(filename)) return true;
  return /^(?:juego-cartas|juego-de-mesa|accesorios|merchandising|marcas|nuestros-productos(?:_\d+)?|ofertas)\.(?:jpe?g|png|webp)$/i.test(
    filename,
  );
}

function tcgFactoryImageAssetKey(value: string): string {
  try {
    const parts = new URL(value).pathname.split("/").filter(Boolean);
    const rendition = parts.length > 1 ? parts[parts.length - 2] : "";
    const match = rendition.match(/^(\d+)-[a-z0-9_-]+$/i);
    return match?.[1] ?? value;
  } catch {
    return value;
  }
}

function tcgFactoryImageQuality(value: string): number {
  if (/thickbox_default/i.test(value)) return 5;
  if (/large_default/i.test(value)) return 4;
  if (/medium_default/i.test(value)) return 3;
  if (/home_default/i.test(value)) return 2;
  if (/imagen_producto_newsletter/i.test(value)) return 1;
  return 0;
}

function images(html: string, sourceUrl: string): string[] {
  const candidates: string[] = [];
  for (const pattern of [
    /<meta\b[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/gi,
    /<img\b[^>]*src=["']([^"']+)["']/gi,
  ]) {
    for (const match of html.matchAll(pattern)) {
      const url = absoluteOfficialUrl(match[1], sourceUrl);
      if (url && isTcgFactoryProductImageReference(url, sourceUrl)) {
        candidates.push(url);
      }
    }
  }

  const bestByAsset = new Map<string, string>();
  for (const url of candidates) {
    const key = tcgFactoryImageAssetKey(url);
    const current = bestByAsset.get(key);
    if (
      !current ||
      tcgFactoryImageQuality(url) > tcgFactoryImageQuality(current)
    ) {
      bestByAsset.set(key, url);
    }
  }

  return Array.from(bestByAsset.values()).slice(0, 12);
}

export function parseTcgFactoryMinimumOrderQuantity(
  html: string,
): number | null {
  const patterns = [
    /(?:minimal[_-]?quantity|minimum[_-]?quantity|min[_-]?order[_-]?quantity|minimumOrderQuantity)["']?\s*[:=]\s*["']?(\d+)/i,
    /(?:cantidad|compra|pedido)\s+m[ií]nima(?:\s+de\s+compra)?\s*:?\s*(\d+)/i,
    /cantidad\s+m[ií]nima[\s\S]{0,120}?(?:es|:)\s*(\d+)/i,
    /m[ií]nimo(?:\s+de\s+compra)?\s*:?\s*(\d+)\s+unidades?/i,
    /m[uú]ltiplo(?:\s+de\s+compra)?\s*:?\s*(\d+)/i,
  ];

  for (const source of [html, stripHtml(html)]) {
    for (const pattern of patterns) {
      const quantity = Number(source.match(pattern)?.[1]);
      if (Number.isInteger(quantity) && quantity > 1) return quantity;
    }
  }
  return null;
}

export function parseTcgFactoryListing(
  html: string,
  pageUrl = TCGFACTORY_ACCESSORIES_URL,
): TcgFactoryListingPage {
  const urls: string[] = [];
  for (const match of html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>/gi)) {
    const url = absoluteOfficialUrl(match[1], pageUrl);
    if (
      url &&
      /\/es\/distribucion\/[^/?#]+\.html(?:\?|$)/i.test(url) &&
      !/distribucion-accesorios/i.test(url)
    ) {
      urls.push(url.split("?")[0]);
    }
  }
  const unique = Array.from(new Set(urls));
  const text = stripHtml(html);
  const totalItemsMatch = text.match(/de\s+([0-9.]+)\s+art[ií]culo\(s\)/i);
  const totalItems = totalItemsMatch
    ? Number(totalItemsMatch[1].replace(/\./g, ""))
    : null;
  const currentPage =
    Number(new URL(pageUrl).searchParams.get("page") ?? "1") || 1;
  const linkedPages = Array.from(html.matchAll(/[?&]page=(\d+)/gi), (match) =>
    Number(match[1]),
  ).filter(Number.isFinite);
  const totalPages = Math.max(
    currentPage,
    ...linkedPages,
    totalItems && unique.length > 0
      ? Math.ceil(totalItems / Math.max(unique.length, 27))
      : 1,
  );
  return {
    productUrls: unique,
    page: currentPage,
    totalPages,
    totalItems,
  };
}

export function parseTcgFactoryPublicProduct(
  html: string,
  sourceUrl: string,
): TcgFactoryPublicProduct {
  const officialUrl = absoluteOfficialUrl(sourceUrl, TCGFACTORY_BASE_URL);
  if (!officialUrl || !/\/es\/distribucion\//i.test(officialUrl)) {
    throw new Error("URL de producto TcgFactory no válida");
  }
  const text = stripHtml(html);
  const lines = text.split("\n");
  const h1 = decodeHtml(
    html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1]?.replace(/<[^>]+>/g, " ") ??
      "",
  )
    .replace(/\s+/g, " ")
    .trim();
  const productName = h1 || field(lines, /^Producto\s*$/i) || "";
  if (!productName) throw new Error("TcgFactory: nombre no encontrado");

  const reference = field(lines, /^Referencia\s*:?/i)?.split(/\s+/)[0] ?? null;
  const rawEan = field(lines, /^EAN\s*:?/i);
  const ean = rawEan?.match(/\b\d{8,14}\b/)?.[0] ?? null;
  const releaseDate = isoDate(field(lines, /^Fecha de lanzamiento\s*:?/i));
  const reportedAvailability =
    field(lines, /^Estado de producto\s*:?/i) ??
    text.match(
      /\b(Disponible|En reposici[oó]n|Preventa|Agotado|Sin stock)\b/i,
    )?.[1] ??
    "";
  const productType =
    field(lines, /^Tipo de accesorio\s*:?/i) ??
    field(lines, /^Tipo de producto\s*:?/i);
  const manufacturer = field(lines, /^(?:Marca|Fabricante|Editorial)\s*:?/i);
  const categoryKey = tcgFactoryAccessoryCategory(productName, productType);
  const options: Record<string, string> = {};
  for (const [key, label] of [
    ["color", /^Color\s*:?/i],
    ["tamano", /^Tamañ?o\s*:?/i],
    ["idioma", /^Idioma\s*:?/i],
    ["licencia", /^Licencia\s*:?/i],
  ] as const) {
    const value = field(lines, label);
    if (value) options[key] = value;
  }

  const externalVariantId =
    ean ??
    reference ??
    new URL(officialUrl).pathname
      .split("/")
      .pop()!
      .replace(/\.html$/i, "");

  return {
    sourceUrl: officialUrl,
    externalProductId: officialUrl,
    externalVariantId,
    reference,
    ean,
    productName,
    categoryKey,
    manufacturer,
    manufacturerSku: reference,
    options,
    referencePriceNet: referencePriceFromHtml(html),
    availability: mapTcgFactoryPublicAvailability(reportedAvailability),
    reportedAvailability,
    releaseDate,
    imageUrls: images(html, officialUrl),
    metadata: {
      source: "tcgfactory_public_web",
      productType,
      publicReferenceOnly: true,
    },
  };
}
