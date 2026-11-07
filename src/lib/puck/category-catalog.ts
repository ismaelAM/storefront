import type { Data } from "@puckeditor/core";
import type { ProductListParams } from "@spree/sdk";
import { PRODUCT_CARD_FIELDS } from "@/lib/data/cached";

/** Category blocks share the existing eight-product pool from their category. */
export function getCategoryCatalogParams(data: Data): ProductListParams {
  let needsProducts = false;
  let needsVariants = false;
  function visit(value: unknown): void {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    const item = value as Record<string, unknown>;
    if (item.type === "ProductGrid") {
      needsProducts = true;
      const props = (item.props ?? {}) as Record<string, unknown>;
      needsVariants ||= Boolean(
        (Array.isArray(props.selectedVariantIds) &&
          props.selectedVariantIds.length) ||
          (typeof props.variantFilter === "string" &&
            props.variantFilter.trim()),
      );
    } else if (
      item.type === "RealProductShowcase" ||
      item.type === "CategoryProductGrid"
    ) {
      needsProducts = true;
    }
    Object.values(item).forEach(visit);
  }
  visit(data);
  return {
    limit: needsProducts ? 8 : 0,
    fields: needsVariants
      ? [...PRODUCT_CARD_FIELDS, "variants"]
      : PRODUCT_CARD_FIELDS,
    ...(needsVariants ? { expand: ["variants"] } : {}),
  };
}
