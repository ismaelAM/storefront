import { buildRebindPlan } from './rebind.mjs';

// Separate from the rollback-only rehearsal: API verification is an external
// prerequisite, and this operation clears unsafe unmapped references, switches
// the credential/URL atomically, and deliberately leaves all producers paused.
export function renderCutover(rows, proof) {
  if (proof?.backend !== 'https://project-7ck7q.vercel.app' || proof.authenticated !== true || proof.identityHold !== true ||
      proof.products !== 5000 || proof.variants !== 5013) throw new Error('Missing verified destination');
  const plan = buildRebindPlan(rows);
  if (plan.products.length !== 5000 || plan.variants.length !== 5013) throw new Error('Unexpected recovery checkpoint counts');
  const values = [...plan.products, ...plan.variants].map(row =>
    `('${row.source_table}','${row.source_id}',${row.old_id === null ? 'NULL' : `'${row.old_id}'`},'${row.destination_id}')`).join(',\n');
  return `DO $cutover$
DECLARE new_key text;
BEGIN
 PERFORM set_config('lock_timeout','5s',true);
 PERFORM set_config('statement_timeout','60s',true);
 LOCK TABLE public.catalog_products, public.catalog_variants, public.devir_sync_catalog, public.devir_sync_config IN SHARE ROW EXCLUSIVE MODE;
 IF current_database()<>'postgres'
 OR (SELECT count(*) FROM public.catalog_products)<>5000
 OR (SELECT count(*) FROM public.catalog_variants)<>5015
 OR NOT EXISTS(SELECT 1 FROM public.devir_sync_config WHERE id='primary' AND spree_api_url='https://bisontcg.spree.sh' AND (lock_until IS NULL OR lock_until<now()))
 OR NOT EXISTS(SELECT 1 FROM cron.job WHERE jobname='devir-cloud-sync-tick')
 OR EXISTS(SELECT 1 FROM cron.job WHERE jobname='devir-cloud-sync-tick' AND active)
 THEN RAISE EXCEPTION 'Cutover source is not paused at the original checkpoint'; END IF;
 IF (SELECT md5(string_agg(md5(to_jsonb(t)::text),'' ORDER BY id)) FROM migration_checkpoint_20261015.catalog_products t)<>'08419a6e1fd6ca51e88e49ada8911f4c'
 OR (SELECT md5(string_agg(md5(to_jsonb(t)::text),'' ORDER BY id)) FROM migration_checkpoint_20261015.catalog_variants t)<>'8e1890b39483959230347980b8bd65f3'
 OR EXISTS(SELECT 1 FROM public.catalog_products p FULL JOIN migration_checkpoint_20261015.catalog_products c USING(id) WHERE (to_jsonb(p)-'updated_at') IS DISTINCT FROM (to_jsonb(c)-'updated_at'))
 OR EXISTS(SELECT 1 FROM public.catalog_variants v FULL JOIN migration_checkpoint_20261015.catalog_variants c USING(id) WHERE (to_jsonb(v)-'updated_at') IS DISTINCT FROM (to_jsonb(c)-'updated_at'))
 THEN RAISE EXCEPTION 'Canonical data or recovery checkpoint changed'; END IF;
 SELECT decrypted_secret INTO STRICT new_key FROM vault.decrypted_secrets WHERE name='spree_owned_bot_20261026';
 IF new_key NOT LIKE 'sk_%' OR length(new_key)<20 THEN RAISE EXCEPTION 'Verified integration credential is missing'; END IF;
 CREATE TEMP TABLE recovery_cutover_map(source_table text,source_id uuid,old_id text,new_id text,
 PRIMARY KEY(source_table,source_id),UNIQUE(source_table,old_id),UNIQUE(source_table,new_id)) ON COMMIT DROP;
 INSERT INTO recovery_cutover_map VALUES
${values};
 IF EXISTS(SELECT 1 FROM recovery_cutover_map m LEFT JOIN public.catalog_products p ON p.id=m.source_id WHERE m.source_table='catalog_products' AND (p.id IS NULL OR p.spree_product_id IS DISTINCT FROM m.old_id))
 OR EXISTS(SELECT 1 FROM recovery_cutover_map m LEFT JOIN public.catalog_variants v ON v.id=m.source_id WHERE m.source_table='catalog_variants' AND (v.id IS NULL OR v.spree_variant_id IS DISTINCT FROM m.old_id))
 THEN RAISE EXCEPTION 'Cutover mapping does not match canonical ownership'; END IF;
 CREATE TEMP TABLE recovery_quarantine ON COMMIT DROP AS SELECT v.* FROM public.catalog_variants v
 WHERE v.id IN ('9625ea8c-f86e-4120-9003-d44acac1016b','9d82611d-69c6-43f8-b53b-cd50fa4f8f97');
 IF (SELECT count(*) FROM recovery_quarantine WHERE requires_review AND fulfillment_mode='physical_only')<>2
 OR EXISTS(SELECT 1 FROM public.catalog_variants v WHERE NOT EXISTS(SELECT 1 FROM recovery_cutover_map m WHERE m.source_table='catalog_variants' AND m.source_id=v.id) AND NOT EXISTS(SELECT 1 FROM recovery_quarantine q WHERE q.id=v.id))
 OR EXISTS(SELECT 1 FROM recovery_quarantine q JOIN recovery_cutover_map m ON m.source_table='catalog_variants' AND m.source_id=q.id)
 THEN RAISE EXCEPTION 'Unexpected unresolved variant identity'; END IF;
 IF EXISTS(SELECT 1 FROM public.devir_sync_catalog WHERE spree_product_id IS NOT NULL AND spree_variant_id IS NULL)
 OR EXISTS(SELECT 1 FROM public.devir_sync_catalog d WHERE d.spree_variant_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.catalog_variants v JOIN public.catalog_products p ON p.id=v.product_id WHERE v.spree_variant_id=d.spree_variant_id AND p.spree_product_id=d.spree_product_id))
 THEN RAISE EXCEPTION 'Legacy identity is not reconciled'; END IF;
 CREATE TEMP TABLE recovery_legacy_expected ON COMMIT DROP AS
 SELECT d.supplier_sku,
 CASE WHEN q.id IS NOT NULL THEN NULL WHEN vm.new_id IS NOT NULL THEN pm.new_id ELSE d.spree_product_id END AS product_id,
 CASE WHEN q.id IS NOT NULL THEN NULL ELSE coalesce(vm.new_id,d.spree_variant_id) END AS variant_id,
 md5((to_jsonb(d)-'spree_product_id'-'spree_variant_id'-'updated_at')::text) AS business_hash
 FROM public.devir_sync_catalog d
 LEFT JOIN public.catalog_variants v ON v.spree_variant_id=d.spree_variant_id
 LEFT JOIN recovery_cutover_map vm ON vm.source_table='catalog_variants' AND vm.source_id=v.id
 LEFT JOIN recovery_cutover_map pm ON pm.source_table='catalog_products' AND pm.source_id=v.product_id
 LEFT JOIN recovery_quarantine q ON q.id=v.id;
 UPDATE public.devir_sync_catalog d SET spree_product_id=NULL, spree_variant_id=NULL
 FROM recovery_quarantine q WHERE d.spree_variant_id=q.spree_variant_id;
 UPDATE public.devir_sync_catalog d SET spree_product_id=pm.new_id,spree_variant_id=vm.new_id
 FROM public.catalog_variants v JOIN recovery_cutover_map vm ON vm.source_table='catalog_variants' AND vm.source_id=v.id
 JOIN recovery_cutover_map pm ON pm.source_table='catalog_products' AND pm.source_id=v.product_id
 WHERE d.spree_variant_id=vm.old_id AND d.spree_product_id=pm.old_id;
 UPDATE public.catalog_products SET spree_product_id=NULL;
 UPDATE public.catalog_variants SET spree_variant_id=NULL;
 UPDATE public.catalog_products p SET spree_product_id=m.new_id FROM recovery_cutover_map m WHERE m.source_table='catalog_products' AND p.id=m.source_id;
 UPDATE public.catalog_variants v SET spree_variant_id=m.new_id FROM recovery_cutover_map m WHERE m.source_table='catalog_variants' AND v.id=m.source_id;
 IF (SELECT count(*) FROM public.catalog_products p JOIN recovery_cutover_map m ON m.source_table='catalog_products' AND m.source_id=p.id AND m.new_id=p.spree_product_id)<>5000
 OR (SELECT count(*) FROM public.catalog_variants v JOIN recovery_cutover_map m ON m.source_table='catalog_variants' AND m.source_id=v.id AND m.new_id=v.spree_variant_id)<>5013
 OR EXISTS(SELECT 1 FROM public.catalog_variants v JOIN recovery_quarantine q USING(id) WHERE v.spree_variant_id IS NOT NULL)
 OR EXISTS(SELECT 1 FROM public.catalog_products p FULL JOIN migration_checkpoint_20261015.catalog_products c USING(id) WHERE (to_jsonb(p)-'updated_at'-'spree_product_id') IS DISTINCT FROM (to_jsonb(c)-'updated_at'-'spree_product_id'))
 OR EXISTS(SELECT 1 FROM public.catalog_variants v FULL JOIN migration_checkpoint_20261015.catalog_variants c USING(id) WHERE (to_jsonb(v)-'updated_at'-'spree_variant_id') IS DISTINCT FROM (to_jsonb(c)-'updated_at'-'spree_variant_id'))
 OR EXISTS(SELECT 1 FROM public.devir_sync_catalog d FULL JOIN recovery_legacy_expected e USING(supplier_sku) WHERE d.supplier_sku IS NULL OR e.supplier_sku IS NULL OR d.spree_product_id IS DISTINCT FROM e.product_id OR d.spree_variant_id IS DISTINCT FROM e.variant_id OR md5((to_jsonb(d)-'spree_product_id'-'spree_variant_id'-'updated_at')::text) IS DISTINCT FROM e.business_hash)
 THEN RAISE EXCEPTION 'Cutover reconciliation failed'; END IF;
 UPDATE public.devir_sync_config SET enabled=false,spree_api_url='https://project-7ck7q.vercel.app',spree_admin_api_key=new_key,updated_at=now() WHERE id='primary';
END $cutover$;`;
}
