export function legacyGroupedProductSlug(slug: string): string | null {
  const cleaned = slug
    .replace(
      /-(?:tomo|num|numero|vol|volumen)-?\d{1,3}(?:-de-\d{1,3})?$/i,
      "",
    )
    .replace(/-+$/g, "");

  return cleaned && cleaned !== slug ? cleaned : null;
}
