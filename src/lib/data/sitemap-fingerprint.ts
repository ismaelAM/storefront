import { createHash } from "node:crypto";
import type { Category, Product } from "@spree/sdk";
import { translationFingerprint } from "@/lib/metadata/alternates";

type TranslatedFields =
  | "id"
  | "name"
  | "description"
  | "description_html"
  | "meta_title"
  | "meta_description"
  | "meta_keywords";
type SourceContent =
  | Pick<Product, TranslatedFields | "slug">
  | Pick<Category, TranslatedFields | "permalink">;

export interface SitemapFingerprint {
  id: string;
  fingerprint: string;
}

/** Compact comparison of the exact translated fields used by page metadata. */
export function hashSitemapResource(
  resource: SourceContent | SitemapFingerprint,
): string {
  // Pages cache the hash, not the long translated descriptions used to make it.
  if ("fingerprint" in resource) return resource.fingerprint;
  const fingerprint = translationFingerprint(
    resource.name,
    "slug" in resource ? resource.slug : resource.permalink,
    resource.description,
    resource.description_html,
    resource.meta_title,
    resource.meta_description,
    resource.meta_keywords,
  );
  return createHash("sha256").update(fingerprint).digest("hex");
}
