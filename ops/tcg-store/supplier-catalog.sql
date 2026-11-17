-- Intended for the canonical catalog project. Preserve mappings and history.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '45s';
LOCK TABLE public.catalog_suppliers, public.catalog_supplier_crawl_state,
  public.catalog_products, public.catalog_variants, public.catalog_supplier_offers,
  public.catalog_supplier_discovery IN SHARE ROW EXCLUSIVE MODE;

DO $guard$
BEGIN
  IF (SELECT count(*) FROM public.catalog_suppliers WHERE code = 'tcgfactory' AND enabled) <> 1
     OR EXISTS (SELECT FROM public.catalog_supplier_crawl_state st JOIN public.catalog_suppliers s
       ON st.supplier_id = s.id WHERE s.code = 'tcgfactory' AND st.status = 'running' AND st.section <> 'tcg')
  THEN RAISE EXCEPTION 'supplier configuration or crawl changed; inspect before cutover'; END IF;
  IF EXISTS (SELECT FROM bison_ops.owner_cleanup_audit WHERE batch_key = 'owner-tcg-shop:2026-11-17')
  THEN RAISE EXCEPTION 'supplier catalog already updated'; END IF;
END $guard$;

CREATE TEMP TABLE tcg_games (path text PRIMARY KEY) ON COMMIT DROP;
INSERT INTO tcg_games SELECT unnest(ARRAY['tcg/mtg', 'tcg/one-piece', 'tcg/yugioh', 'tcg/lorcana', 'tcg/pokemon', 'tcg/digimon', 'tcg/dbscg-fusion-world', 'tcg/dbscg-masters', 'tcg/gundam', 'tcg/cyberpunk', 'tcg/vanguard', 'tcg/weiss-schwarz', 'tcg/hololive', 'tcg/palworld', 'tcg/shadowverse']);
CREATE TEMP TABLE tcg_excluded_products ON COMMIT DROP AS
SELECT p.id FROM public.catalog_products p
WHERE p.id <> 'c6c2830b-0318-4d14-902d-cb6beb1acde9'::uuid
  AND (NOT EXISTS (SELECT FROM tcg_games g WHERE g.path = lower(trim(p.category_key)))
    OR p.name ~* '\m(panini|cromos?|stickers?|topps|funko|army painter)\M');
CREATE TEMP TABLE tcg_excluded_discoveries ON COMMIT DROP AS
SELECT d.id FROM public.catalog_supplier_discovery d
JOIN public.catalog_suppliers s ON s.id = d.supplier_id AND s.code = 'tcgfactory'
WHERE d.active AND (NOT EXISTS (SELECT FROM tcg_games g WHERE g.path = lower(trim(d.category_key)))
  OR d.product_name ~* '\m(panini|cromos?|stickers?|topps|funko|army painter)\M');

INSERT INTO bison_ops.owner_cleanup_audit(batch_key, table_name, record_id, before_row)
SELECT 'owner-tcg-shop:2026-11-17', 'catalog_suppliers', id::text,
  jsonb_build_object('sections', config->'sections', 'updated_at', updated_at) FROM public.catalog_suppliers WHERE code = 'tcgfactory'
UNION ALL
SELECT 'owner-tcg-shop:2026-11-17', 'catalog_products', id::text,
  jsonb_build_object('review_decision', review_decision, 'review_note', review_note, 'updated_at', updated_at)
FROM public.catalog_products WHERE id IN (SELECT id FROM tcg_excluded_products)
UNION ALL
SELECT 'owner-tcg-shop:2026-11-17', 'catalog_variants', id::text,
  jsonb_build_object('requires_review', requires_review, 'fulfillment_mode', fulfillment_mode, 'updated_at', updated_at)
FROM public.catalog_variants WHERE product_id IN (SELECT id FROM tcg_excluded_products)
UNION ALL
SELECT 'owner-tcg-shop:2026-11-17', 'catalog_supplier_offers', id::text,
  jsonb_build_object('active', active, 'updated_at', updated_at)
FROM public.catalog_supplier_offers
WHERE active AND variant_id IN (SELECT id FROM public.catalog_variants WHERE product_id IN (SELECT id FROM tcg_excluded_products))
UNION ALL
SELECT 'owner-tcg-shop:2026-11-17', 'catalog_supplier_discovery', id::text,
  jsonb_build_object('active', active, 'updated_at', updated_at)
FROM public.catalog_supplier_discovery WHERE id IN (SELECT id FROM tcg_excluded_discoveries);

UPDATE public.catalog_products SET review_decision = 'rejected',
  review_note = 'owner-unpublished-cleanup:2026-11-17: TCG-only catalog',
  updated_at = now()
WHERE id IN (SELECT id FROM tcg_excluded_products)
  AND NOT (review_decision IS NOT DISTINCT FROM 'rejected'
    AND coalesce(review_note, '') LIKE 'owner-unpublished-cleanup:%');
UPDATE public.catalog_variants SET requires_review = true, fulfillment_mode = 'disabled', updated_at = now()
WHERE product_id IN (SELECT id FROM tcg_excluded_products)
  AND (requires_review IS DISTINCT FROM true OR fulfillment_mode IS DISTINCT FROM 'disabled');
UPDATE public.catalog_supplier_offers SET active = false, updated_at = now()
WHERE active AND variant_id IN (SELECT id FROM public.catalog_variants WHERE product_id IN (SELECT id FROM tcg_excluded_products));
UPDATE public.catalog_supplier_discovery SET active = false, updated_at = now()
WHERE id IN (SELECT id FROM tcg_excluded_discoveries);
UPDATE public.catalog_suppliers SET config = jsonb_set(config, '{sections}', '["tcg"]'::jsonb), updated_at = now()
WHERE code = 'tcgfactory';
COMMIT;
