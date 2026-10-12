import { createHash } from "node:crypto";
import { translationFingerprint } from "@/lib/metadata/alternates";
import type { SitemapCategory, SitemapProduct } from "./sitemap";

/** Compact comparison of the exact translated fields used by page metadata. */
export function hashSitemapResource(
  resource: SitemapProduct | SitemapCategory,
): string {
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
