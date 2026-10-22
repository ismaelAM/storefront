import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildRebindPlan, renderRehearsal } from './rebind.mjs';

const product = { source_table: 'catalog_products', source_id: '00000000-0000-4000-8000-000000000001', old_id: 'prod_Old123', destination_id: 'prod_New123' };
const variant = { source_table: 'catalog_variants', source_id: '00000000-0000-4000-8000-000000000002', old_id: 'variant_Old123', destination_id: 'variant_New123' };

test('preserves canonical identity and separates old and new backend references', () => {
  const plan = buildRebindPlan([variant, product]);
  assert.deepEqual(plan.products, [product]);
  assert.deepEqual(plan.variants, [variant]);
});
test('accepts a recovered record that had never reached the old backend', () => {
  assert.equal(buildRebindPlan([{ ...product, old_id: null }]).products[0].old_id, null);
});
test('rejects duplicate canonical identities and duplicate destination IDs', () => {
  for (const extra of [product, { ...product, source_id: variant.source_id }]) {
    assert.throws(() => buildRebindPlan([product, extra]), /duplicate/i);
  }
});
test('rejects an old ID shared by two canonical records', () => {
  assert.throws(() => buildRebindPlan([product, { ...product, source_id: variant.source_id, destination_id: 'prod_New456' }]), /duplicate/i);
});
test('allows an old ID to be reused by a different record on the new server', () => {
  const other = { ...product, source_id: variant.source_id, old_id: 'prod_Old456', destination_id: product.old_id };
  assert.equal(buildRebindPlan([product, other]).products.length, 2);
});
test('rejects wrong resource types and untrusted SQL content', () => {
  for (const patch of [
    { source_table: 'spree_users' },
    { source_id: "bad'); COMMIT;--" },
    { destination_id: 'variant_Wrong' },
    { old_id: "prod_X';COMMIT;--" },
  ]) assert.throws(() => buildRebindPlan([{ ...product, ...patch }]), /invalid/i);
});
test('rejects unverified or secret fields instead of embedding them into output', () => {
  assert.throws(() => buildRebindPlan([{ ...product, token: 'private' }]), /unexpected/i);
});
test('rejects arrays masquerading as scalar identifiers', () => {
  for (const key of ['source_table', 'source_id', 'old_id', 'destination_id']) {
    assert.throws(() => buildRebindPlan([{ ...product, [key]: [product[key]] }]), /invalid/i);
  }
});
test('rejects inherited property names as table identities', () => {
  assert.throws(() => buildRebindPlan([{ ...product, source_table: '__proto__', old_id: 'o_123', destination_id: 'o_456' }]), /invalid/i);
});
test('refuses to produce a runnable rehearsal from a partial mapping export', () => {
  assert.throws(() => renderRehearsal([product, variant]), /checkpoint counts/i);
});
test('does not mutate input records when producing the migration plan', () => {
  const input = [{ ...product }];
  const plan = buildRebindPlan(input);
  plan.products[0].old_id = null;
  assert.equal(input[0].old_id, 'prod_Old123');
});
