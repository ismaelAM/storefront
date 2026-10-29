import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildDevirRetirementPlan } from './retire-devir-plan.mjs';

const row = (extra = {}) => ({ variant_id: 'cv1', product_id: 'cp1', spree_variant_id: 'variant_one', spree_product_id: 'prod_one', canonical_sku: 'SKU1', has_devir: true, has_other: false, product_has_other: false, ...extra });
const product = (extra = {}) => ({ id: 1, store_id: 4, mapped_id: 'prod_one', status: 'active', deleted_at: null, private_metadata: { recovery_source: { id: 'cp1' } }, variants: [{ id: 10, product_id: 1, sku: 'SKU1', deleted_at: null, track_inventory: true, private_metadata: { recovery_source: { id: 'cv1' } }, stock: [{ id: 20, count_on_hand: 0, backorderable: true, deleted_at: null }] }], ...extra });

test('archives only the supplier-exclusive zero-stock product', () => {
  const p = buildDevirRetirementPlan([row()], [product()]);
  assert.deepEqual(p.archiveProductIds, ['prod_one']);
  assert.deepEqual(p.archiveNativeIds, ['1']);
  assert.deepEqual(p.mixedProductPatches, []);
});
test('keeps shared variants and products even if the other offer is stale', () => {
  const p = buildDevirRetirementPlan([row({ has_other: true, product_has_other: true })], [product()]);
  assert.deepEqual(p.archiveProductIds, []);
  assert.deepEqual(p.mixedProductPatches, []);
  assert.deepEqual(p.keepProductIds, ['prod_one']);
});
test('withdraws only the Devir variant inside a mixed product without quantities or prices', () => {
  const p = buildDevirRetirementPlan([row({ product_has_other: true })], [product()]);
  assert.deepEqual(p.archiveProductIds, []);
  assert.deepEqual(p.mixedProductPatches, [{ productId: 'prod_one', variantId: 'variant_one', nativeProductId: '1', nativeVariantId: '10', body: { track_inventory: true, preorderable: false, preorder_ships_at: null, backorder_limit: 0 }, stockItemUpdates: [{ id: '20', body: { backorderable: false } }] }]);
  assert.equal(JSON.stringify(p).includes('stock_items'), false);
  assert.equal(JSON.stringify(p).includes('count_on_hand'), false);
  assert.equal(JSON.stringify(p).includes('prices'), false);
});
test('preserves every product with physical stock in any live location', () => {
  const p = product(); p.variants[0].stock.push({ id: 21, count_on_hand: 6, backorderable: false, deleted_at: null });
  const plan = buildDevirRetirementPlan([row()], [p]);
  assert.deepEqual(plan.archiveProductIds, []);
  assert.deepEqual(plan.keepProductIds, ['prod_one']);
});
test('protects stock on a sibling variant and ignores soft-deleted stock', () => {
  const p = product(); p.variants.push({ ...p.variants[0], id: 11, sku: '', private_metadata: {}, stock: [{ id: 21, count_on_hand: 6, backorderable: false, deleted_at: null }] });
  assert.deepEqual(buildDevirRetirementPlan([row()], [p]).archiveProductIds, []);
  p.variants[1].stock[0].deleted_at = '2026-01-01';
  assert.deepEqual(buildDevirRetirementPlan([row()], [p]).archiveProductIds, ['prod_one']);
});
test('refuses wrong identity, wrong store, missing mappings and duplicate mappings', () => {
  for (const p of [product({ store_id: 5 }), product({ private_metadata: { recovery_source: { id: 'another' } } })]) {
    assert.throws(() => buildDevirRetirementPlan([row()], [p]));
  }
  const p = product(); p.variants[0].sku = 'ANOTHER';
  assert.throws(() => buildDevirRetirementPlan([row()], [p]));
  assert.throws(() => buildDevirRetirementPlan([row()], []));
  assert.throws(() => buildDevirRetirementPlan([row(), row()], [product()]));
  assert.throws(() => buildDevirRetirementPlan([row()], [product(), product()]));
  assert.throws(() => buildDevirRetirementPlan([row()], [product({ id: 'wrong' })]));
});
test('refuses malformed physical quantities and an unaccounted commercial sibling', () => {
  const p = product(); p.variants[0].stock[0].count_on_hand = 'not-a-number';
  assert.throws(() => buildDevirRetirementPlan([row()], [p]));
  const q = product(); q.variants.push({ ...q.variants[0], id: 11, sku: 'MANUAL', private_metadata: {} });
  assert.throws(() => buildDevirRetirementPlan([row()], [q]));
});
test('does not mutate its source manifest or native snapshot', () => {
  const rows = [row({ product_has_other: true })]; const native = [product()];
  const before = JSON.stringify({ rows, native });
  buildDevirRetirementPlan(rows, native);
  assert.equal(JSON.stringify({ rows, native }), before);
});
test('leaves an unresolved variant family untouched instead of guessing its native identity', () => {
  const plan = buildDevirRetirementPlan([row({ spree_variant_id: null })], [product()]);
  assert.deepEqual(plan.archiveProductIds, []);
  assert.deepEqual(plan.mixedProductPatches, []);
  assert.deepEqual(plan.heldProductIds, ['prod_one']);
});
