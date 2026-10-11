import "server-only";

import type { LookupAddress } from "node:dns";
import { lookup } from "node:dns/promises";
import { request } from "node:https";
import { isIP } from "node:net";
import { join } from "node:path";
import sharp, { type OverlayOptions } from "sharp";

export interface OfferSlideInput {
  dayKey: string;
  categoryLabel: string;
  offers: Array<{
    name: string;
    price: number;
    originalPrice: number;
    imageUrl: string;
  }>;
  logoUrl?: string | null;
  storeUrl: string;
}

const WIDTH = 1080;
const HEIGHT = 1350;
const MAX_BYTES = 8 * 1024 * 1024;
const MAX_PIXELS = 16_000_000;
// A filesystem asset, not a JS import: resolving .ttf as a module makes
// Turbopack try to compile an unknown module type. Explicit tracing ships it.
const FONT_FILE = join(
  process.cwd(),
  "node_modules",
  "next/dist/compiled/@vercel/og/Geist-Regular.ttf",
);
const BROWN = "#30271f";
const CREAM = "#f5f0e6";
const AMBER = "#edba62";
const currency = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
});

function publicAddress(address: string): boolean {
  if (isIP(address) === 6) {
    // Global unicast only; exclude documentation and IPv4 transition ranges.
    return (
      /^[23]/i.test(address) &&
      !/^2001:(?:db8|0|):/i.test(address) &&
      !/^2002:/i.test(address)
    );
  }
  if (isIP(address) !== 4) return false;
  const [a, b] = address.split(".").map(Number);
  return !(
    a === 0 ||
    a === 10 ||
    a === 127 ||
    a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && (b === 0 || b === 168)) ||
    (a === 198 && (b === 18 || b === 19 || b === 51)) ||
    (a === 203 && b === 0)
  );
}

function secureUrl(raw: string): URL {
  const url = new URL(raw);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    (url.port && url.port !== "443") ||
    isIP(url.hostname.replace(/^\[|\]$/g, "")) ||
    !url.hostname.includes(".") ||
    url.hostname.endsWith(".localhost") ||
    url.hostname.endsWith(".local")
  )
    throw new Error("Unsafe social image URL");
  return url;
}

function imageOrigins(): Set<string> {
  const origins = new Set(["https://console.spree.sh"]);
  for (const raw of [
    process.env.SPREE_API_URL,
    process.env.SPREE_IMAGES_URL,
    ...(process.env.SOCIAL_IMAGE_ALLOWED_ORIGINS?.split(",") ?? []),
  ]) {
    if (!raw?.trim()) continue;
    try {
      origins.add(secureUrl(raw.trim()).origin);
    } catch {
      /* Unusable config grants no access. */
    }
  }
  return origins;
}

function signedObjectStorage(url: URL): boolean {
  const signedS3 =
    /^(?:[a-z0-9][a-z0-9.-]*\.)?s3(?:[.-][a-z0-9-]+)?\.amazonaws\.com$/.test(
      url.hostname,
    ) &&
    ((url.searchParams.get("X-Amz-Algorithm") === "AWS4-HMAC-SHA256" &&
      url.searchParams.has("X-Amz-Signature")) ||
      (url.searchParams.has("AWSAccessKeyId") &&
        url.searchParams.has("Signature") &&
        url.searchParams.has("Expires")));
  return (
    signedS3 ||
    (/^[a-z0-9]+\.blob\.core\.windows\.net$/.test(url.hostname) &&
      url.searchParams.has("sig") &&
      url.searchParams.has("sv"))
  );
}

async function dnsAddresses(hostname: string, signal: AbortSignal) {
  return new Promise<LookupAddress[]>((resolve, reject) => {
    const abort = () => reject(new Error("Social image DNS timeout"));
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) abort();
    lookup(hostname, { all: true, verbatim: true })
      .then(resolve, reject)
      .finally(() => signal.removeEventListener("abort", abort));
  });
}

async function imageBytes(raw: string): Promise<Buffer> {
  const origins = imageOrigins();
  let url = secureUrl(raw);
  if (!origins.has(url.origin))
    throw new Error("Unapproved social image origin");
  const signal = AbortSignal.timeout(12_000);
  for (let redirects = 0; redirects <= 3; redirects++) {
    const addresses = await dnsAddresses(url.hostname, signal);
    if (
      !addresses.length ||
      addresses.some(({ address }) => !publicAddress(address))
    )
      throw new Error("Social image resolves to a private network");
    const address = addresses[0];
    const result = await new Promise<{ bytes?: Buffer; location?: string }>(
      (resolve, reject) => {
        const req = request(
          url,
          {
            method: "GET",
            agent: false,
            signal,
            family: address.family,
            // Resolve once and pin the connection. A second DNS lookup cannot rebind it.
            lookup: (_hostname, _options, callback) =>
              callback(null, address.address, address.family),
            headers: {
              Accept: "image/jpeg,image/png,image/webp",
              "User-Agent": "BisonTCG-Social/1.0",
            },
          },
          (res) => {
            res.on("error", reject);
            const status = res.statusCode ?? 0;
            if (
              [301, 302, 303, 307, 308].includes(status) &&
              res.headers.location
            ) {
              res.destroy();
              resolve({ location: res.headers.location });
              return;
            }
            const type = res.headers["content-type"]
              ?.split(";")[0]
              .trim()
              .toLowerCase();
            if (
              status !== 200 ||
              !["image/jpeg", "image/png", "image/webp"].includes(type ?? "") ||
              Number(res.headers["content-length"]) > MAX_BYTES
            ) {
              res.destroy();
              reject(
                new Error("Social product image unavailable or unsupported"),
              );
              return;
            }
            const chunks: Buffer[] = [];
            let length = 0;
            res.on("data", (chunk: Buffer) => {
              length += chunk.length;
              if (length > MAX_BYTES) {
                res.destroy();
                reject(new Error("Social product image exceeds byte limit"));
              } else chunks.push(chunk);
            });
            res.on("end", () => resolve({ bytes: Buffer.concat(chunks) }));
            res.on("aborted", () =>
              reject(new Error("Social product image body aborted")),
            );
          },
        );
        req.on("error", reject);
        req.end();
      },
    );
    if (result.bytes) return result.bytes;
    if (!result.location || redirects === 3)
      throw new Error("Too many social image redirects");
    url = secureUrl(new URL(result.location, url).href);
    if (!origins.has(url.origin) && !signedObjectStorage(url))
      throw new Error("Unsafe social image redirect");
  }
  throw new Error("Social product image unavailable");
}

async function image(
  raw: string,
  width: number,
  height: number,
): Promise<Buffer> {
  const bytes = await imageBytes(raw);
  const bitmapSignature =
    bytes
      .subarray(0, 8)
      .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ||
    bytes.subarray(0, 3).equals(Buffer.from([255, 216, 255])) ||
    (bytes.subarray(0, 4).toString("ascii") === "RIFF" &&
      bytes.subarray(8, 12).toString("ascii") === "WEBP");
  // Never hand an arbitrary remote SVG to librsvg, even with a forged MIME type.
  if (!bitmapSignature) throw new Error("Unsupported social image signature");
  const decoder = sharp(bytes, {
    limitInputPixels: MAX_PIXELS,
    animated: false,
    failOn: "error",
  }).timeout({ seconds: 5 });
  const metadata = await decoder.metadata();
  if (
    !metadata.format ||
    !["jpeg", "png", "webp"].includes(metadata.format) ||
    (metadata.pages ?? 1) > 1
  )
    throw new Error("Unsupported social image encoding");
  return decoder
    .rotate()
    .resize(width, height, { fit: "contain", background: "#ffffff" })
    .png()
    .toBuffer();
}

function escapeText(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function cleanText(value: string, max: number): string {
  const text = value
    // biome-ignore lint/suspicious/noControlCharactersInRegex: strip catalog controls before passing plain text to Pango.
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

async function textOverlay(
  text: string,
  left: number,
  top: number,
  width: number,
  size: number,
  color = BROWN,
  maxHeight?: number,
): Promise<OverlayOptions> {
  let layer = sharp({
    text: {
      text: `<span foreground="${color}">${escapeText(text)}</span>`,
      font: `Geist ${size}`,
      fontfile: FONT_FILE,
      width,
      dpi: 72,
      rgba: true,
      wrap: "word-char",
    },
  });
  const bytes = await layer.png().toBuffer();
  const metadata = await sharp(bytes).metadata();
  if (maxHeight && (metadata.height ?? 0) > maxHeight) {
    layer = sharp(bytes).resize({
      height: maxHeight,
      withoutEnlargement: true,
    });
    return { input: await layer.png().toBuffer(), left, top };
  }
  return { input: bytes, left, top };
}

/** Static branded template; every photo and price must come from the real offer. */
export async function renderOfferSlide(
  input: OfferSlideInput,
): Promise<Buffer> {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(input.dayKey) ||
    !input.categoryLabel?.trim() ||
    input.offers.length < 1 ||
    input.offers.length > 3
  )
    throw new Error("Invalid social slide selection");
  const date = new Date(`${input.dayKey}T12:00:00Z`);
  if (
    Number.isNaN(date.valueOf()) ||
    date.toISOString().slice(0, 10) !== input.dayKey
  )
    throw new Error("Invalid social slide date");
  for (const offer of input.offers) {
    if (
      !offer.name?.trim() ||
      !Number.isFinite(offer.price) ||
      !Number.isFinite(offer.originalPrice) ||
      offer.price <= 0 ||
      offer.originalPrice <= offer.price ||
      Math.round(offer.price * 100) >= Math.round(offer.originalPrice * 100)
    )
      throw new Error("Invalid social offer price or name");
    secureUrl(offer.imageUrl);
  }
  const storefront = secureUrl(input.storeUrl);
  const count = input.offers.length;
  const gap = 24;
  const cardHeight = count === 1 ? 860 : count === 2 ? 418 : 270;
  const cardTop = 326;
  const cards = input.offers
    .map((_offer, index) => {
      const y = cardTop + index * (cardHeight + gap);
      return `<rect x="48" y="${y}" width="984" height="${cardHeight}" rx="26" fill="#fff"/><rect x="${count === 1 ? 78 : 398}" y="${count === 1 ? y + 574 : y + cardHeight - 83}" width="258" height="56" rx="14" fill="${AMBER}"/>`;
    })
    .join("");
  const background = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}"><rect width="1080" height="1350" fill="${CREAM}"/><rect width="1080" height="312" fill="${BROWN}"/><circle cx="1008" cy="-52" r="226" fill="#47382a"/><circle cx="1026" cy="16" r="122" fill="#5b432b"/><rect x="48" y="156" width="92" height="6" rx="3" fill="${AMBER}"/>${cards}<rect x="48" y="1212" width="984" height="2" fill="#d8cdbb"/></svg>`,
  );
  const overlays: OverlayOptions[] = [];
  const photos = await Promise.all(
    input.offers.map((offer) =>
      image(
        offer.imageUrl,
        count === 1 ? 580 : 292,
        count === 1 ? 460 : cardHeight - 48,
      ),
    ),
  );
  let logo: Buffer | undefined;
  if (input.logoUrl) {
    try {
      logo = await image(input.logoUrl, 220, 84);
    } catch {
      /* The name is authoritative fallback branding. */
    }
  }
  if (logo) overlays.push({ input: logo, left: 48, top: 38 });
  else overlays.push(await textOverlay("BisonTCG", 48, 46, 520, 58, CREAM));
  overlays.push(await textOverlay("OFERTAS DEL DÍA", 48, 184, 760, 52, CREAM));
  overlays.push(
    await textOverlay(
      cleanText(input.categoryLabel, 42),
      48,
      253,
      900,
      30,
      AMBER,
      42,
    ),
  );
  const dateLabel = new Intl.DateTimeFormat("es-ES", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
  overlays.push(await textOverlay(dateLabel, 816, 66, 222, 25, CREAM));
  for (let index = 0; index < count; index++) {
    const offer = input.offers[index];
    const y = cardTop + index * (cardHeight + gap);
    const left = count === 1 ? 78 : 398;
    const nameY = count === 1 ? y + 498 : y + 33;
    const priceY = count === 1 ? y + 587 : y + cardHeight - 69;
    overlays.push({
      input: photos[index],
      left: count === 1 ? 250 : 72,
      top: y + 24,
    });
    overlays.push(
      await textOverlay(
        cleanText(offer.name, 94),
        left,
        nameY,
        count === 1 ? 910 : 600,
        count === 1 ? 36 : 32,
        BROWN,
        count === 1 ? 66 : cardHeight - 150,
      ),
    );
    overlays.push(
      await textOverlay(
        currency.format(offer.price),
        left + 16,
        priceY,
        240,
        34,
      ),
    );
    const original = await textOverlay(
      currency.format(offer.originalPrice),
      left + 285,
      priceY + 7,
      250,
      25,
      "#776d60",
    );
    overlays.push(original);
    const originalWidth =
      (await sharp(original.input as Buffer).metadata()).width ?? 100;
    overlays.push({
      input: Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${originalWidth}" height="2"><rect width="100%" height="2" fill="#776d60"/></svg>`,
      ),
      left: left + 285,
      top: priceY + 21,
    });
    // Round toward zero so the badge never overstates the reduction.
    const percent = Math.floor(
      (1 - offer.price / offer.originalPrice) * 100 + 1e-9,
    );
    overlays.push(
      await textOverlay(
        percent > 0 ? `−${percent}%` : "OFERTA",
        count === 1 ? 794 : 826,
        priceY + 4,
        164,
        28,
      ),
    );
  }
  overlays.push(
    await textOverlay(
      storefront.hostname.replace(/^www\./, ""),
      48,
      1240,
      490,
      30,
    ),
  );
  overlays.push(
    await textOverlay(
      "Precios y disponibilidad en la tienda",
      558,
      1246,
      480,
      22,
      "#776d60",
    ),
  );
  return sharp(background)
    .composite(overlays)
    .jpeg({ quality: 90, chromaSubsampling: "4:4:4", mozjpeg: true })
    .toBuffer();
}
