import type { Data } from "@puckeditor/core";
import type { ProductListParams } from "@spree/sdk";
import { PRODUCT_CARD_FIELDS } from "@/lib/data/cached";

/** Match the published grids' needs without shipping the editor's whole pool. */
export function getHomeCatalogParams(data: Data): ProductListParams {
  let limit = 0;
  let needsVariants = false;
  function visit(value: unknown): void {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    const item = value as Record<string, unknown>;
    if (item.type === "ProductGrid") {
      const props = (item.props ?? {}) as Record<string, unknown>;
      if (
        props.productFilter !== "sale" &&
        props.productFilter !== "preorder"
      ) {
        const variants = Boolean(
          (Array.isArray(props.selectedVariantIds) &&
            props.selectedVariantIds.length) ||
            (typeof props.variantFilter === "string" &&
              props.variantFilter.trim()),
        );
        const filtered =
          variants ||
          props.productFilter === "available" ||
          [props.selectedProductIds, props.selectedCategoryIds].some(
            (ids) => Array.isArray(ids) && ids.length > 0,
          );
        const count = Number(props.productCount ?? "8");
        limit = Math.max(
          limit,
          filtered
            ? 100
            : Number.isFinite(count)
              ? Math.min(100, Math.max(0, count))
              : 100,
        );
        needsVariants ||= variants;
      }
    }
    Object.values(item).forEach(visit);
  }
  visit(data);
  return {
    limit,
    fields: needsVariants
      ? [...PRODUCT_CARD_FIELDS, "variants"]
      : PRODUCT_CARD_FIELDS,
    ...(needsVariants ? { expand: ["variants"] } : {}),
  };
}
