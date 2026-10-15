-- Operational recovery checkpoint for the EXISTING catalog project only.
-- Not an application schema migration and not a backup of the missing Spree DB.
-- Run once. Do not overwrite a previous checkpoint. It stays in the same project;
-- an independent encrypted backup is still required before the real migration.
BEGIN ISOLATION LEVEL REPEATABLE READ;

CREATE SCHEMA migration_checkpoint_20261015;
REVOKE ALL ON SCHEMA migration_checkpoint_20261015
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TABLE migration_checkpoint_20261015.manifest (
  source_table text PRIMARY KEY,
  row_count bigint NOT NULL,
  content_md5 text NOT NULL,
  captured_at timestamptz NOT NULL DEFAULT transaction_timestamp()
);

DO $checkpoint$
DECLARE
  source_name text;
  copied_rows bigint;
  content_checksum text;
BEGIN
  FOREACH source_name IN ARRAY ARRAY[
    'pages', 'devir_sync_config', 'devir_sync_cycles', 'devir_sync_jobs',
    'devir_sync_catalog', 'special_pricing_programs', 'special_pricing_requests',
    'catalog_suppliers', 'catalog_products', 'catalog_variants',
    'catalog_variant_identifiers', 'catalog_supplier_offers',
    'catalog_offer_selection_history', 'catalog_supplier_discovery',
    'catalog_supplier_crawl_state', 'catalog_daily_offer_state',
    'catalog_replenishment_links', 'social_offer_publications'
  ] LOOP
    EXECUTE format(
      'CREATE TABLE migration_checkpoint_20261015.%I AS TABLE public.%I',
      source_name, source_name
    );
    EXECUTE format(
      'ALTER TABLE migration_checkpoint_20261015.%I ENABLE ROW LEVEL SECURITY',
      source_name
    );
    EXECUTE format(
      'SELECT count(*), md5(coalesce(string_agg(md5(to_jsonb(t)::text), '''' ORDER BY md5(to_jsonb(t)::text)), '''')) FROM migration_checkpoint_20261015.%I t',
      source_name
    ) INTO copied_rows, content_checksum;
    INSERT INTO migration_checkpoint_20261015.manifest
      (source_table, row_count, content_md5)
      VALUES (source_name, copied_rows, content_checksum);
  END LOOP;
END
$checkpoint$;

ALTER TABLE migration_checkpoint_20261015.manifest ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA migration_checkpoint_20261015
  FROM PUBLIC, anon, authenticated, service_role;

COMMIT;
