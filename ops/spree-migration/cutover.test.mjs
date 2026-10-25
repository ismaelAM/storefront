import assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderCutover } from './cutover.mjs';

const rows = [];
for (const [table, prefix, count] of [['catalog_products', 'prod', 5000], ['catalog_variants', 'variant', 5013]]) {
  for (let i = 0; i < count; i++) rows.push({ source_table: table,
    source_id: `00000000-0000-4000-${prefix === 'prod' ? '8000' : '9000'}-${String(i).padStart(12, '0')}`,
    old_id: `${prefix}_Old${i}`, destination_id: `${prefix}_New${i}` });
}
const proof = { backend: 'https://project-7ck7q.vercel.app', authenticated: true, identityHold: true, products: 5000, variants: 5013 };
test('refuses cutover without verified destination ownership and authenticated API', () => {
  for (const patch of [{ authenticated: false }, { identityHold: false }, { backend: 'https://evil.invalid' }, { products: 4999 }, { variants: 5015 }]) {
    assert.throws(() => renderCutover(rows, { ...proof, ...patch }), /verified destination/i);
  }
  assert.throws(() => renderCutover(rows.slice(1), proof), /checkpoint counts/i);
});
test('cutover is atomic, requires paused workers and keeps the supplier cron stopped', () => {
  const sql = renderCutover(rows, proof);
  assert.match(sql, /^DO \$cutover\$/);
  assert.match(sql, /lock_until/);
  assert.match(sql, /cron\.job/);
  assert.match(sql, /active\)/);
  assert.match(sql, /enabled=false/);
  assert.doesNotMatch(sql, /cron\.schedule|cron\.alter_job/);
  assert.doesNotMatch(sql, /(?:^|\n)\s*(?:COMMIT|ROLLBACK)\s*;/);
});
test('quarantines unresolved old references without changing physical-only policy or prices', () => {
  const sql = renderCutover(rows, proof);
  assert.match(sql, /9625ea8c-f86e-4120-9003-d44acac1016b/);
  assert.match(sql, /9d82611d-69c6-43f8-b53b-cd50fa4f8f97/);
  assert.match(sql, /physical_only/);
  assert.match(sql, /SET spree_product_id=NULL, spree_variant_id=NULL/);
  assert.doesNotMatch(sql, /SET (?:fulfillment_mode|last_auto_price|count_on_hand|requires_review)/);
});
test('loads the new credential from private vault rather than embedding credentials', () => {
  const sql = renderCutover(rows, proof);
  assert.match(sql, /vault\.decrypted_secrets/);
  assert.match(sql, /spree_owned_bot_20261026/);
  assert.doesNotMatch(sql, /sk_[a-zA-Z0-9]{8}/);
});
