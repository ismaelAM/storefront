// @vitest-environment node

import { EventEmitter } from "node:events";
import type { RequestOptions } from "node:https";
import { PassThrough } from "node:stream";
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const network = vi.hoisted(() => ({
  addresses: [{ address: "93.184.216.34", family: 4 }],
  stallDns: false,
  responses: [] as Array<{
    status?: number;
    type?: string;
    location?: string;
    bytes?: Buffer;
    stallBody?: boolean;
  }>,
  calls: [] as string[],
  connectionOptions: [] as RequestOptions[],
}));

vi.mock("node:dns/promises", () => ({
  lookup: async () =>
    network.stallDns ? new Promise(() => {}) : network.addresses,
}));
vi.mock("node:https", () => ({
  request: (
    url: URL,
    options: RequestOptions,
    callback: (response: PassThrough) => void,
  ) => {
    network.calls.push(url.href);
    network.connectionOptions.push(options);
    const request = new EventEmitter() as EventEmitter & {
      end: () => void;
      destroy: (error?: Error) => void;
    };
    request.destroy = (error) => {
      if (error) request.emit("error", error);
    };
    options.signal?.addEventListener(
      "abort",
      () => request.destroy(new Error("Image request aborted")),
      { once: true },
    );
    request.end = () =>
      queueMicrotask(() => {
        const fixture = network.responses.shift() ?? {};
        const response = Object.assign(new PassThrough(), {
          statusCode: fixture.status ?? 200,
          headers: {
            "content-type": fixture.type ?? "image/png",
            location: fixture.location,
          },
        });
        callback(response);
        if (!fixture.stallBody)
          response.end(fixture.bytes ?? Buffer.from("broken image"));
      });
    return request;
  },
}));

import { renderOfferSlide } from "./template";

const offer = {
  name: "Producto de prueba — jamás publicar",
  price: 12.5,
  originalPrice: 20,
  imageUrl: "https://console.spree.sh/rails/active_storage/test.png",
};
const input = {
  dayKey: "2026-10-11",
  categoryLabel: "Juegos de mesa + Rol",
  storeUrl: "https://www.bisontcg.com/es/es",
  offers: [offer],
};
let fixture: Buffer;

beforeEach(async () => {
  vi.unstubAllEnvs();
  vi.stubEnv("SPREE_API_URL", "https://bisontcg.spree.sh");
  network.addresses = [{ address: "93.184.216.34", family: 4 }];
  network.stallDns = false;
  network.calls = [];
  network.connectionOptions = [];
  network.responses = [];
  fixture = await sharp({
    create: { width: 200, height: 280, channels: 3, background: "#e3bd74" },
  })
    .png()
    .toBuffer();
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("branded daily offer JPEG", () => {
  it("pins connections to one validated address without Node's second family lookup", async () => {
    network.responses = [{ bytes: fixture }];
    await renderOfferSlide(input);
    expect(network.connectionOptions[0]).toMatchObject({ family: 4 });
  });
  it.each([
    1, 2, 3,
  ])("renders %i real offers as an exact 1080 × 1350 JPEG", async (count) => {
    network.responses = Array.from({ length: count }, () => ({
      bytes: fixture,
    }));
    const result = await renderOfferSlide({
      ...input,
      offers: Array(count).fill(offer),
    });
    const metadata = await sharp(result).metadata();
    expect(metadata).toMatchObject({
      format: "jpeg",
      width: 1080,
      height: 1350,
    });
    expect(result.length).toBeGreaterThan(20_000);
  });

  it("escapes catalog text and safely fits very long names without treating them as markup", async () => {
    network.responses = [{ bytes: fixture }];
    const result = await renderOfferSlide({
      ...input,
      categoryLabel: "TCG & <Rol>",
      offers: [
        { ...offer, name: '<span foreground="red">A&B</span> '.repeat(20) },
      ],
    });
    expect(await sharp(result).metadata()).toMatchObject({
      width: 1080,
      height: 1350,
    });
  });

  it("produces deterministic pixels and uses typographic branding without a logo", async () => {
    network.responses = [{ bytes: fixture }, { bytes: fixture }];
    const first = await renderOfferSlide(input);
    const second = await renderOfferSlide(input);
    expect(first.equals(second)).toBe(true);
  });

  it.each(
    [
      [],
      [{ ...offer, price: 0 }],
      [{ ...offer, price: 20 }],
      [{ ...offer, price: Number.NaN }],
      [{ ...offer, originalPrice: Number.POSITIVE_INFINITY }],
      [{ ...offer, price: 9.991, originalPrice: 9.994 }],
      Array(4).fill(offer),
    ].map((offers) => ({ offers })),
  )("rejects empty, invalid or oversized selections before fetching: %j", async ({
    offers,
  }) => {
    await expect(renderOfferSlide({ ...input, offers })).rejects.toThrow();
    expect(network.calls).toHaveLength(0);
  });

  it.each([
    "",
    "http://console.spree.sh/x",
    "https://console.spree.sh:8443/x",
    "https://user:pass@console.spree.sh/x",
    "https://127.0.0.1/x",
    "https://other.example/image.png",
  ])('rejects an unsafe or missing product image "%s"', async (imageUrl) => {
    await expect(
      renderOfferSlide({ ...input, offers: [{ ...offer, imageUrl }] }),
    ).rejects.toThrow();
    expect(network.calls).toHaveLength(0);
  });

  it("blocks private DNS results before creating the image request", async () => {
    network.addresses = [{ address: "192.168.1.1", family: 4 }];
    await expect(renderOfferSlide(input)).rejects.toThrow();
    expect(network.calls).toHaveLength(0);
  });

  it("bounds an image body that never finishes", async () => {
    const timeout = AbortSignal.timeout.bind(AbortSignal);
    vi.spyOn(AbortSignal, "timeout").mockImplementation(() => timeout(25));
    network.responses = [{ stallBody: true }];
    await expect(renderOfferSlide(input)).rejects.toThrow("aborted");
  });

  it("bounds DNS resolution that never finishes", async () => {
    const timeout = AbortSignal.timeout.bind(AbortSignal);
    vi.spyOn(AbortSignal, "timeout").mockImplementation(() => timeout(25));
    network.stallDns = true;
    await expect(renderOfferSlide(input)).rejects.toThrow("DNS timeout");
    expect(network.calls).toHaveLength(0);
  });

  it("validates redirect destinations instead of following an internal redirect", async () => {
    network.responses = [
      { status: 302, location: "http://169.254.169.254/latest/meta-data/" },
    ];
    await expect(renderOfferSlide(input)).rejects.toThrow();
    expect(network.calls).toHaveLength(1);
  });

  it("follows a redirect only to an explicitly configured public image origin", async () => {
    vi.stubEnv("SPREE_IMAGES_URL", "https://images.example.test");
    network.responses = [
      { status: 302, location: "https://images.example.test/product.png" },
      { bytes: fixture },
    ];
    expect(await sharp(await renderOfferSlide(input)).metadata()).toMatchObject(
      { format: "jpeg" },
    );
    expect(network.calls).toHaveLength(2);
  });

  it.each([
    "https://spree-assets.s3.eu-west-1.amazonaws.com/test.png?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Signature=fixture",
    "https://spreeassets.blob.core.windows.net/public/test.png?sv=2025-01-01&sig=fixture",
  ])("allows signed object-storage redirects from trusted Spree: %s", async (location) => {
    network.responses = [{ status: 302, location }, { bytes: fixture }];
    expect(await sharp(await renderOfferSlide(input)).metadata()).toMatchObject(
      { format: "jpeg" },
    );
    expect(network.calls).toHaveLength(2);
  });

  it.each([
    "https://spree-assets.s3.eu-west-1.amazonaws.com.attacker.example/test.png?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Signature=fixture",
    "https://spree-assets.s3.eu-west-1.amazonaws.com/test.png",
  ])("rejects unsigned or disguised object storage redirects: %s", async (location) => {
    network.responses = [{ status: 302, location }];
    await expect(renderOfferSlide(input)).rejects.toThrow();
    expect(network.calls).toHaveLength(1);
  });

  it("never accepts a signed object storage URL as an initial unapproved source", async () => {
    await expect(
      renderOfferSlide({
        ...input,
        offers: [
          {
            ...offer,
            imageUrl:
              "https://spree-assets.s3.eu-west-1.amazonaws.com/test.png?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Signature=fixture",
          },
        ],
      }),
    ).rejects.toThrow();
    expect(network.calls).toHaveLength(0);
  });

  it("rejects a decompression bomb before resizing the product image", async () => {
    const bytes = await sharp({
      create: { width: 4096, height: 4096, channels: 3, background: "#fff" },
    })
      .png()
      .toBuffer();
    network.responses = [{ bytes }];
    await expect(renderOfferSlide(input)).rejects.toThrow();
  });

  it("renders the real optional logo when a bounded bitmap is available", async () => {
    network.responses = [
      { bytes: fixture },
      { bytes: fixture },
      { bytes: fixture },
    ];
    const branded = await renderOfferSlide({
      ...input,
      logoUrl: offer.imageUrl,
    });
    const textual = await renderOfferSlide(input);
    expect(branded.equals(textual)).toBe(false);
    expect(await sharp(branded).metadata()).toMatchObject({
      format: "jpeg",
      width: 1080,
      height: 1350,
    });
  });

  it.each([
    {
      type: "image/svg+xml",
      bytes: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'),
    },
    {
      type: "image/png",
      bytes: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'),
    },
    { status: 404 },
    { bytes: Buffer.alloc(8 * 1024 * 1024 + 1) },
  ])("fails closed on bad, vector, missing and oversized images", async (response) => {
    network.responses = [response];
    await expect(renderOfferSlide(input)).rejects.toThrow();
  });

  it("falls back to brand text when the optional logo is invalid", async () => {
    network.responses = [{ bytes: fixture }, { bytes: fixture }];
    const withBadLogo = await renderOfferSlide({
      ...input,
      logoUrl: "javascript:alert(1)",
    });
    const withoutLogo = await renderOfferSlide(input);
    expect(withBadLogo.equals(withoutLogo)).toBe(true);
  });
});
