// @vitest-environment node
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { expect, it } from "vitest";

it("attaches supplier photos synchronously instead of only queuing a SaveFromUrl job", async () => {
  const source = ts.createSourceFile(
    "index.ts",
    readFileSync("supabase/functions/devir-sync/index.ts", "utf8"),
    ts.ScriptTarget.Latest,
    true,
  );
  const names = [
    "syncImages",
    "uploadSupplierImage",
    "supplierImageBytes",
    "fetchSyncText",
    "syncDeferred",
    "canStartSyncWork",
  ];
  const code = ts.transpileModule(
    source.statements
      .filter(
        (n) =>
          ts.isFunctionDeclaration(n) && names.includes(n.name?.text ?? ""),
      )
      .map((n) => n.getText(source))
      .join("\n"),
    { compilerOptions: { target: ts.ScriptTarget.ES2022 } },
  ).outputText;
  const bytes = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
    "base64",
  );
  const media: Record<string, unknown>[] = [];
  const fetches: Array<{ url: string; method?: string; body?: unknown }> = [];
  const run = runInNewContext(`${code}; syncImages`, {
    URL,
    Response,
    AbortController,
    setTimeout,
    clearTimeout,
    Uint8Array,
    TextDecoder,
    createHash,
    console,
    isSyncDeferred: (e: Error) => e.name === "SyncDeferred",
    fetch: async (url: string, init: RequestInit = {}) => {
      fetches.push({ url: String(url), method: init.method, body: init.body });
      if (url === "https://tcgfactory.com/photo.png")
        return new Response(bytes, {
          headers: { "Content-Type": "image/png" },
        });
      if (
        url ===
          "https://dtrospakebdiqihhcrub.storage.supabase.co/storage/v1/s3/photo?X-Amz-Signature=fixture" &&
        init.method === "PUT"
      )
        return new Response("", { status: 200 });
      throw Error("Unexpected image transport");
    },
    spreeList: async () => media,
    spreeRequest: async (_c: unknown, _m: string, path: string, body: any) => {
      if (path === "/direct_uploads") {
        expect(body.blob).toMatchObject({
          byte_size: bytes.length,
          content_type: "image/png",
          checksum: createHash("md5").update(bytes).digest("base64"),
        });
        return {
          signed_id: "signed_blob",
          direct_upload: {
            url: "https://dtrospakebdiqihhcrub.storage.supabase.co/storage/v1/s3/photo?X-Amz-Signature=fixture",
            headers: { "Content-Type": "image/png" },
          },
        };
      }
      if (
        path === "/products/prod1/media" &&
        body.signed_id === "signed_blob"
      ) {
        media.push({
          id: "media1",
          original_url: "https://project-7ck7q.vercel.app/photo.png",
        });
        return media[0];
      }
      // The existing URL endpoint only enqueues work; it does not attach a file.
      if (body.url) return null;
      throw Error("Unexpected media request");
    },
  });
  expect(
    await run({}, "prod1", {
      name: "Product",
      imageUrls: ["https://tcgfactory.com/photo.png"],
    }),
  ).toBe(1);
  expect(media[0]?.original_url).toBe(
    "https://project-7ck7q.vercel.app/photo.png",
  );
  expect(fetches.find((f) => f.method === "PUT")?.body).toEqual(
    new Uint8Array(bytes),
  );
});
