// Pure withdrawal manifest: no credentials, HTTP, stock writes or title matching.
export function buildDevirRetirementPlan(manifest, nativeProducts) {
  if (!Array.isArray(manifest) || !manifest.length || !Array.isArray(nativeProducts)) {
    throw new Error('Missing verified supplier/native snapshots');
  }
  const products = new Map();
  for (const product of nativeProducts) {
    if (products.has(product.mapped_id)) throw new Error('Duplicate native product mapping');
    products.set(product.mapped_id, product);
  }
  const groups = new Map();
  const sourceVariants = new Set();
  const mappedVariants = new Set();
  for (const row of manifest) {
    if (!row.variant_id || !row.product_id || !row.spree_product_id ||
        row.has_devir !== true || typeof row.has_other !== 'boolean' || typeof row.product_has_other !== 'boolean' ||
        (row.has_other && !row.product_has_other) || sourceVariants.has(row.variant_id) || (row.spree_variant_id && mappedVariants.has(row.spree_variant_id))) {
      throw new Error('Invalid or duplicate supplier identity');
    }
    sourceVariants.add(row.variant_id);
    if (row.spree_variant_id) mappedVariants.add(row.spree_variant_id);
    const rows = groups.get(row.spree_product_id) ?? [];
    rows.push(row);
    groups.set(row.spree_product_id, rows);
  }
  const plan = { archiveProductIds: [], archiveNativeIds: [], keepProductIds: [], heldProductIds: [], mixedProductPatches: [] };
  for (const [productId, rows] of groups) {
    const product = products.get(productId);
    if (!product || !Number.isSafeInteger(product.id) || product.id <= 0 || product.store_id !== 4 || product.deleted_at || !Array.isArray(product.variants) ||
        rows.some(row => row.product_id !== product.private_metadata?.recovery_source?.id ||
          row.product_has_other !== rows[0].product_has_other)) {
      throw new Error('Native product ownership is not verified');
    }
    if (rows.some(row => !row.spree_variant_id)) {
      plan.heldProductIds.push(productId);
      continue;
    }
    const nativeBySource = new Map();
    let physicalStock = false;
    for (const variant of product.variants) {
      if (!Number.isSafeInteger(variant.id) || variant.id <= 0 || variant.product_id !== product.id || !Array.isArray(variant.stock)) throw new Error('Invalid native variant');
      if (variant.deleted_at) continue;
      const sourceId = variant.private_metadata?.recovery_source?.id;
      if (sourceId) {
        if (nativeBySource.has(sourceId)) throw new Error('Duplicate native variant identity');
        nativeBySource.set(sourceId, variant);
      }
      if (!rows[0].product_has_other && variant.sku && !rows.some(row => row.variant_id === sourceId)) {
        throw new Error('Unaccounted commercial sibling variant');
      }
      for (const stock of variant.stock) {
        if (stock.deleted_at) continue;
        if (!Number.isInteger(stock.count_on_hand)) throw new Error('Invalid physical quantity');
        if (stock.count_on_hand > 0) physicalStock = true;
      }
    }
    for (const row of rows) {
      const variant = nativeBySource.get(row.variant_id);
      if (!variant || variant.sku !== row.canonical_sku) throw new Error('Native variant ownership is not verified');
    }
    if (!rows[0].product_has_other && !physicalStock) {
      plan.archiveProductIds.push(productId);
      plan.archiveNativeIds.push(String(product.id));
      continue;
    }
    plan.keepProductIds.push(productId);
    const patches = rows.filter(row => !row.has_other).map(row => {
      const native = nativeBySource.get(row.variant_id);
      return {
        productId,
        variantId: row.spree_variant_id,
        nativeProductId: String(product.id),
        nativeVariantId: String(native.id),
        body: { track_inventory: true, preorderable: false, preorder_ships_at: null, backorder_limit: 0 },
        // Use individual PATCH routes: the inline product/stock setters replace
        // omitted siblings/locations and are unsuitable for a scoped withdrawal.
        stockItemUpdates: native.stock.filter(stock => !stock.deleted_at).map(stock => ({ id: String(stock.id), body: { backorderable: false } })),
      };
    });
    plan.mixedProductPatches.push(...patches);
  }
  return plan;
}
