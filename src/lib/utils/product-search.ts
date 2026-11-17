/** Keep equivalent searches on one cache key and bound the upstream query. */
export function normalizeProductSearch(value: string | undefined): string {
  if (typeof value !== "string") return "";
  return value.trim().replace(/\s+/g, " ").slice(0, 120).trimEnd();
}
