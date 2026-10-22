import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const PREFIX = { catalog_products: 'prod', catalog_variants: 'variant' };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const FIELDS = ['source_table', 'source_id', 'old_id', 'destination_id'];

/** Validate identities before producing a private, rollback-only rehearsal. */
export function buildRebindPlan(rows) {
  if (!Array.isArray(rows) || rows.length === 0) throw new Error('Invalid mappings');
  const seen = new Set();
  const products = [];
  const variants = [];
  for (const row of rows) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) throw new Error('Invalid mapping');
    if (Object.keys(row).some(key => !FIELDS.includes(key))) throw new Error('Unexpected mapping field');
    if (FIELDS.some(key => key === 'old_id' && row[key] === null ? false : typeof row[key] !== 'string')) throw new Error('Invalid mapping field type');
    const prefix = Object.hasOwn(PREFIX, row.source_table) ? PREFIX[row.source_table] : null;
    if (!prefix || !UUID.test(row.source_id)) throw new Error('Invalid mapping identity');
    const idPattern = new RegExp(`^${prefix}_[a-zA-Z0-9]+$`);
    if (!idPattern.test(row.destination_id) || (row.old_id !== null && !idPattern.test(row.old_id))) throw new Error('Invalid backend reference');
    for (const [kind, value] of [['source', row.source_id], ['destination', row.destination_id], ['old', row.old_id]]) {
      if (value === null) continue;
      const key = `${row.source_table}:${kind}:${value}`;
      if (seen.has(key)) throw new Error('Duplicate mapping identity');
      seen.add(key);
    }
    (prefix === 'prod' ? products : variants).push({ ...row });
  }
  const bySource = (a, b) => a.source_id.localeCompare(b.source_id);
  return { products: products.sort(bySource), variants: variants.sort(bySource) };
}

export function renderRehearsal(rows) {
  const plan = buildRebindPlan(rows);
  if (plan.products.length !== 5000 || plan.variants.length !== 5013) throw new Error('Unexpected recovery checkpoint counts');
  const values = [...plan.products, ...plan.variants].map(row =>
    `('${row.source_table}','${row.source_id}',${row.old_id === null ? 'NULL' : `'${row.old_id}'`},'${row.destination_id}')`).join(',\n');
  return `-- PRIVATE. Only project ikglqbjlbkbaronbiryl. Never commit real mappings.
-- Rehearsal ONLY: all writes roll back. No credentials, URL, stock or prices change.
-- The SQL executor MUST stop on the first error (psql: ON_ERROR_STOP=1).
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
LOCK TABLE public.catalog_products, public.catalog_variants, public.devir_sync_catalog, public.devir_sync_config IN SHARE ROW EXCLUSIVE MODE;
CREATE TEMP TABLE recovery_id_map (
 source_table text NOT NULL, source_id uuid NOT NULL, old_id text, new_id text NOT NULL,
 PRIMARY KEY(source_table,source_id), UNIQUE(source_table,new_id), UNIQUE(source_table,old_id)
) ON COMMIT DROP;
INSERT INTO recovery_id_map VALUES
${values};
DO $rehearsal$
BEGIN
 IF current_database() <> 'postgres'
 OR (SELECT count(*) FROM public.catalog_products) <> 5000
 OR (SELECT count(*) FROM public.catalog_variants) <> 5015
 OR NOT EXISTS(SELECT 1 FROM public.devir_sync_config WHERE id='primary' AND spree_api_url='https://bisontcg.spree.sh' AND (lock_until IS NULL OR lock_until<now()))
 OR NOT EXISTS(SELECT 1 FROM cron.job WHERE jobname='devir-cloud-sync-tick')
 OR EXISTS(SELECT 1 FROM cron.job WHERE jobname='devir-cloud-sync-tick' AND active)
 THEN RAISE EXCEPTION 'Source guard: wrong database, config, active worker or counts'; END IF;
 IF (SELECT md5(string_agg(md5(to_jsonb(t)::text),'' ORDER BY id)) FROM migration_checkpoint_20261015.catalog_products t) <> '08419a6e1fd6ca51e88e49ada8911f4c'
 OR (SELECT md5(string_agg(md5(to_jsonb(t)::text),'' ORDER BY id)) FROM migration_checkpoint_20261015.catalog_variants t) <> '8e1890b39483959230347980b8bd65f3'
 THEN RAISE EXCEPTION 'Source guard: checkpoint changed'; END IF;
 IF EXISTS(SELECT 1 FROM public.catalog_products p FULL JOIN migration_checkpoint_20261015.catalog_products c USING(id) WHERE (to_jsonb(p)-'updated_at') IS DISTINCT FROM (to_jsonb(c)-'updated_at'))
 OR EXISTS(SELECT 1 FROM public.catalog_variants v FULL JOIN migration_checkpoint_20261015.catalog_variants c USING(id) WHERE (to_jsonb(v)-'updated_at') IS DISTINCT FROM (to_jsonb(c)-'updated_at'))
 THEN RAISE EXCEPTION 'Source guard: canonical data changed'; END IF;
 IF EXISTS(SELECT 1 FROM recovery_id_map m LEFT JOIN public.catalog_products p ON p.id=m.source_id WHERE m.source_table='catalog_products' AND (p.id IS NULL OR p.spree_product_id IS DISTINCT FROM m.old_id))
 OR EXISTS(SELECT 1 FROM recovery_id_map m LEFT JOIN public.catalog_variants v ON v.id=m.source_id WHERE m.source_table='catalog_variants' AND (v.id IS NULL OR v.spree_variant_id IS DISTINCT FROM m.old_id))
 THEN RAISE EXCEPTION 'Source guard: mapping does not match canonical identity'; END IF;
 IF EXISTS(SELECT 1 FROM public.devir_sync_catalog d JOIN public.catalog_variants v ON v.spree_variant_id=d.spree_variant_id JOIN public.catalog_products p ON p.id=v.product_id WHERE d.spree_product_id IS DISTINCT FROM p.spree_product_id)
 OR EXISTS(SELECT 1 FROM public.devir_sync_catalog d WHERE d.spree_variant_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.catalog_variants v WHERE v.spree_variant_id=d.spree_variant_id))
 THEN RAISE EXCEPTION 'Source guard: legacy identity is ambiguous'; END IF;
END $rehearsal$;
CREATE TEMP TABLE recovery_legacy_before ON COMMIT DROP AS
SELECT d.supplier_sku,
 CASE WHEN vm.new_id IS NOT NULL THEN pm.new_id ELSE d.spree_product_id END AS expected_product_id,
 coalesce(vm.new_id,d.spree_variant_id) AS expected_variant_id,
 md5((to_jsonb(d)-'spree_product_id'-'spree_variant_id'-'updated_at')::text) AS business_hash
FROM public.devir_sync_catalog d
LEFT JOIN public.catalog_variants v ON v.spree_variant_id=d.spree_variant_id
LEFT JOIN recovery_id_map vm ON vm.source_table='catalog_variants' AND vm.source_id=v.id
LEFT JOIN recovery_id_map pm ON pm.source_table='catalog_products' AND pm.source_id=v.product_id;
-- Join the legacy variant to its canonical parent before changing canonical IDs.
UPDATE public.devir_sync_catalog d SET spree_product_id=pm.new_id, spree_variant_id=vm.new_id
FROM public.catalog_variants v JOIN recovery_id_map vm ON vm.source_table='catalog_variants' AND vm.source_id=v.id
JOIN recovery_id_map pm ON pm.source_table='catalog_products' AND pm.source_id=v.product_id
WHERE d.spree_variant_id=vm.old_id AND d.spree_product_id=pm.old_id;
-- Clear mapped references inside this locked transaction to allow swaps/cycles
-- under nondeferrable UNIQUE constraints. Unmapped references remain intact.
UPDATE public.catalog_products p SET spree_product_id=NULL
FROM recovery_id_map m WHERE m.source_table='catalog_products' AND p.id=m.source_id;
UPDATE public.catalog_variants v SET spree_variant_id=NULL
FROM recovery_id_map m WHERE m.source_table='catalog_variants' AND v.id=m.source_id;
UPDATE public.catalog_products p SET spree_product_id=m.new_id
FROM recovery_id_map m WHERE m.source_table='catalog_products' AND p.id=m.source_id;
UPDATE public.catalog_variants v SET spree_variant_id=m.new_id
FROM recovery_id_map m WHERE m.source_table='catalog_variants' AND v.id=m.source_id;
DO $rehearsal$
BEGIN
 IF (SELECT count(*) FROM public.catalog_products p JOIN recovery_id_map m ON m.source_table='catalog_products' AND m.source_id=p.id AND m.new_id=p.spree_product_id) <> 5000
 OR (SELECT count(*) FROM public.catalog_variants v JOIN recovery_id_map m ON m.source_table='catalog_variants' AND m.source_id=v.id AND m.new_id=v.spree_variant_id) <> 5013
 THEN RAISE EXCEPTION 'Rebinding reconciliation failed'; END IF;
 IF EXISTS(SELECT 1 FROM public.catalog_products p JOIN migration_checkpoint_20261015.catalog_products c USING(id) WHERE (to_jsonb(p)-'updated_at'-'spree_product_id') IS DISTINCT FROM (to_jsonb(c)-'updated_at'-'spree_product_id'))
 OR EXISTS(SELECT 1 FROM public.catalog_variants v JOIN migration_checkpoint_20261015.catalog_variants c USING(id) WHERE (to_jsonb(v)-'updated_at'-'spree_variant_id') IS DISTINCT FROM (to_jsonb(c)-'updated_at'-'spree_variant_id'))
 THEN RAISE EXCEPTION 'Protected canonical fields changed'; END IF;
 -- Old and new servers may reuse the SAME prefixed IDs for different records.
 -- Verify the expected canonical identity, never global absence of old strings.
 IF EXISTS(SELECT 1 FROM public.devir_sync_catalog d FULL JOIN recovery_legacy_before b USING(supplier_sku)
 WHERE d.supplier_sku IS NULL OR b.supplier_sku IS NULL
 OR d.spree_product_id IS DISTINCT FROM b.expected_product_id
 OR d.spree_variant_id IS DISTINCT FROM b.expected_variant_id
 OR md5((to_jsonb(d)-'spree_product_id'-'spree_variant_id'-'updated_at')::text) IS DISTINCT FROM b.business_hash)
 THEN RAISE EXCEPTION 'Legacy identity or protected fields were not preserved'; END IF;
END $rehearsal$;
-- Success is emitted BEFORE rollback: an aborted transaction cannot emit it.
-- Verify original source hashes in a separate request after rollback completes.
SELECT jsonb_build_object('rehearsal','verified_pending_rollback','products',5000,'variants',5013,'unmapped_variants',2,'ready_for_cutover',false) AS result;
ROLLBACK;
`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    if (process.argv.length !== 4) throw new Error('usage');
    const rows = JSON.parse(await readFile(process.argv[2], 'utf8'));
    await writeFile(process.argv[3], renderRehearsal(rows), { flag: 'wx', mode: 0o600 });
    console.log('Private rollback-only rehearsal created; no production data changed.');
  } catch {
    console.error('Rehearsal preparation failed: check mappings, counts and a fresh private output path.');
    process.exitCode = 1;
  }
}
