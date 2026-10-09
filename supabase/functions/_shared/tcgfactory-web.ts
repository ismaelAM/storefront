import {
  normalizeText,
  type SupplierAvailability,
} from "./catalog-sourcing.ts";
import { mapTcgFactoryAvailability } from "./tcgfactory-adapter.ts";
import { inferDevirCategoryKey } from "./devir-catalog-policy.ts";

export const TCGFACTORY_BASE_URL = "https://tcgfactory.com";
export const TCGFACTORY_ACCESSORIES_URL =
  "https://tcgfactory.com/es/distribucion-accesorios";

export const TCGFACTORY_CATALOG_SECTIONS = [
  { key: "accessories", url: TCGFACTORY_ACCESSORIES_URL },
  { key: "tcg", url: `${TCGFACTORY_BASE_URL}/es/trading-card-games` },
  { key: "board_games", url: `${TCGFACTORY_BASE_URL}/es/distribucion-juegos-de-mesa` },
  { key: "merchandising", url: `${TCGFACTORY_BASE_URL}/es/distribucion-merchandising` },
  { key: "paints", url: `${TCGFACTORY_BASE_URL}/es/pinturas` },
] as const;

export const TCGFACTORY_TCG_CATEGORY_SPECS = [
  { key: "tcg/mtg", name: "MTG", slug: "mtg", game: "magic-the-gathering" },
  { key: "tcg/yugioh", name: "Yugioh", slug: "yugioh", game: "yu-gi-oh-juego-de-cartas-coleccionable" },
  { key: "tcg/lorcana", name: "Disney Lorcana", slug: "lorcana", game: "disney-lorcana-tcg" },
  { key: "tcg/digimon", name: "Digimon", slug: "digimon", game: "digimon-card-game" },
  { key: "tcg/dbscg-masters", name: "Dragon Ball Masters", slug: "dbscg-masters", game: "dbscg-masters" },
  { key: "tcg/dbscg-fusion-world", name: "Dragon Ball Fusion World", slug: "dbscg-fusion-world", game: "dbscg-fusion-world" },
  { key: "tcg/gundam", name: "Gundam", slug: "gundam", game: "gundam-card-game" },
  { key: "tcg/one-piece", name: "One Piece", slug: "one-piece", game: "one-piece-card-game" },
  { key: "tcg/club-legacyz", name: "Club Legacyz", slug: "club-legacyz", game: "club-legacyz" },
  { key: "tcg/cyberpunk", name: "Cyberpunk", slug: "cyberpunk", game: "cyberpunk-tcg" },
  { key: "tcg/palworld", name: "Palworld", slug: "palworld", game: "palworld" },
  { key: "tcg/weiss-schwarz", name: "Weiß Schwarz", slug: "weiss-schwarz", game: "wei-schwarz" },
  { key: "tcg/hololive", name: "Hololive", slug: "hololive", game: "hololive-card-game" },
  { key: "tcg/vanguard", name: "Cardfight!! Vanguard", slug: "vanguard", game: "cardfight-vanguard" },
  { key: "tcg/shadowverse", name: "Shadowverse: Evolve", slug: "shadowverse", game: "shadowverse-evolve" },
  { key: "tcg/topps", name: "Topps", slug: "topps", game: "topps" },
  { key: "tcg/icoins", name: "Icoins", slug: "icoins", game: "icoins" },
  { key: "tcg/panini", name: "Panini", slug: "panini", game: "panini-cromos" },
  { key: "tcg/otros", name: "Otros TCG y coleccionismo", slug: "otros", game: "" },
] as const;

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
  return mapTcgFactoryAvailability(value);
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
  // Product recommendations can contain the same price selectors. Quantity
  // tables belong to the current product; never use their cheapest tier or RRP.
  html = html.replace(/<article\b[^>]*class=["'][^"']*product-miniature[^"']*["'][\s\S]*?<\/article>/gi, "");
  const tiers: number[] = [];
  for (const table of html.matchAll(/<table\b[^>]*class=["'][^"']*table-product-discounts[^"']*["'][\s\S]*?<\/table>/gi)) {
    for (const cell of table[0].matchAll(/<td\b[^>]*rel=["']\d+["'][^>]*>([\s\S]*?)<\/td>/gi)) {
      const price = decimal(stripHtml(cell[1]));
      if (price !== null) tiers.push(price);
    }
  }
  const candidates = [
    /class=["'][^"']*current-price-value[^"']*["'][^>]*(?:content|data-price-amount)=["']([0-9.,]+)["']/i,
    /(?:content|data-price-amount)=["']([0-9.,]+)["'][^>]*class=["'][^"']*current-price-value/i,
    /class=["'][^"']*current-price[^"']*["'][\s\S]{0,300}?([0-9]+[.,][0-9]{2})\s*€/i,
    /data-product-price=["']([0-9.,]+)["']/i,
    /itemprop=["']price["'][^>]*content=["']([0-9.,]+)["']/i,
  ];
  for (const pattern of candidates) {
    const value = decimal(html.match(pattern)?.[1]);
    if (value !== null) return Math.max(value, ...tiers);
  }
  return tiers.length ? Math.max(...tiers) : null;
}

function normalizeTcgFactoryMediaStem(value: string): string {
  return decodeURIComponent(value)
    .replace(/\.[a-z0-9]{2,5}$/i, "")
    .replace(/^-+/, "")
    .trim()
    .toLowerCase();
}

function tcgFactoryProductSlug(sourceUrl: string): string | null {
  try {
    const raw = new URL(sourceUrl).pathname.split("/").pop() ?? "";
    return normalizeTcgFactoryMediaStem(raw.replace(/\.html$/i, "")) || null;
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
  if (isTcgFactoryKnownPollutionMediaReference(value)) return false;
  const slug = tcgFactoryProductSlug(sourceUrl);
  if (!slug) return false;
  return normalizeTcgFactoryMediaStem(imageFilename(value)) === slug;
}

function isTcgFactorySourceProductImageReference(
  value: string,
  sourceUrl: string,
): boolean {
  if (!isTcgFactoryProductImageReference(value, sourceUrl)) return false;
  try {
    const url = new URL(value);
    if (
      url.hostname !== "tcgfactory.com" &&
      !url.hostname.endsWith(".tcgfactory.com")
    ) {
      return false;
    }
    const parts = url.pathname.split("/").filter(Boolean);
    const rendition = parts.length > 1 ? parts[parts.length - 2] : "";
    return /^\d+-(?:thickbox_default|large_default|medium_default|home_default|imagen_producto_newsletter)$/i.test(
      rendition,
    );
  } catch {
    return false;
  }
}

const TCGFACTORY_SITE_CHROME_MEDIA_STEMS = new Set([
  "juego-cartas",
  "juego-de-mesa",
  "accesorios",
  "merchandising",
  "marcas",
  "nuestros-productos",
  "ofertas",
  "contacto",
  "compra",
  "envio",
]);

export function isTcgFactoryKnownPollutionMediaReference(
  value: string,
): boolean {
  const filename = imageFilename(value).toLowerCase();
  if (!filename) return false;
  if (/^\d+\.(?:jpe?g|png|webp)$/i.test(filename)) return true;

  const stem = normalizeTcgFactoryMediaStem(filename).replace(/_\d+$/, "");
  return TCGFACTORY_SITE_CHROME_MEDIA_STEMS.has(stem);
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
      if (url && isTcgFactorySourceProductImageReference(url, sourceUrl)) {
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
  const listStart = html.search(/<[^>]+\bid=["']js-product-list["']/i);
  const listingHtml = listStart < 0 ? html : html.slice(listStart).split(/<nav\b[^>]*class=["'][^"']*pagination/i)[0];
  for (const match of listingHtml.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>/gi)) {
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
  const listingUrl = new URL(pageUrl);
  const linkedPages = Array.from(html.matchAll(/<a\b[^>]*href=["']([^"']+)["']/gi), (match) => {
    const value = absoluteOfficialUrl(match[1], pageUrl);
    if (!value) return 0;
    const link = new URL(value);
    return link.pathname === listingUrl.pathname ? Number(link.searchParams.get("page") ?? 0) : 0;
  }).filter(Number.isFinite);
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
  section?: string,
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
      /\b(Disponible|En reposici[oó]n|Restock|Preventa|Agotado|Sin stock)\b/i,
    )?.[1] ??
    "";
  const productType =
    field(lines, /^Tipo de accesorio\s*:?/i) ??
    field(lines, /^Tipo de producto\s*:?/i);
  const manufacturer = field(lines, /^(?:Marca|Fabricante|Editorial)\s*:?/i);
  // Breadcrumb and technical sheet are product-scoped; the global navigation
  // contains every game and must not influence classification.
  const breadcrumb = stripHtml(html.match(/<(?:nav|ol)\b[^>]*class=["'][^"']*breadcrumb[^"']*["'][\s\S]*?<\/(?:nav|ol)>/i)?.[0] ?? "");
  const route = normalizeText(breadcrumb);
  const game = field(lines, /^Juego(?:\s*:|\s*$)/i);
  const gameKey = normalizeText(game ?? "");
  const family = /merchandising/.test(route) ? "merchandising"
    : /pinturas/.test(route) ? "paints"
    : /juegos-de-mesa/.test(route) ? "board_games"
    : /accesorios/.test(route) ? "accessories"
    : /trading-card-games|coleccionismo/.test(route) ? "tcg"
    : section;
  let categoryKey: string;
  if (family === "merchandising") categoryKey = "merchandising";
  else if (family === "paints") categoryKey = "pinturas";
  else if (family === "board_games") {
    const inferred = inferDevirCategoryKey({ name: `${productType ?? ""} ${productName}` });
    categoryKey = /^(?:rol|juegos-de-mesa)\//.test(inferred) ? inferred : "juegos-de-mesa/general";
  } else if (family === "accessories") {
    categoryKey = tcgFactoryAccessoryCategory(productName, productType);
  } else if (family === "tcg" || gameKey) {
    categoryKey = TCGFACTORY_TCG_CATEGORY_SPECS.find(spec => spec.game && (
      spec.game === gameKey || (gameKey && spec.game.startsWith(gameKey + "-")) ||
      normalizeText(spec.name) === gameKey || route.includes(spec.game) || route.includes(normalizeText(spec.name))
    ))?.key ?? "tcg/otros";
  } else categoryKey = tcgFactoryAccessoryCategory(productName, productType);
  const options: Record<string, string> = {};
  for (const [key, label] of [
    ["color", /^Color\s*:?/i],
    ["tamano", /^Tamañ?o\s*:?/i],
    ["idioma", /^Idioma\s*:?/i],
    ["edicion", /^Edici[oó]n\s*:?/i],
    ["serie", /^Serie\s*:?/i],
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
      game,
      section: section ?? null,
      publicReferenceOnly: true,
    },
  };
}
