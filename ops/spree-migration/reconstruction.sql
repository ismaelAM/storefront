-- New destination only. This is staging, not a restored Spree database.
BEGIN;
DO $$
BEGIN
  IF current_database() <> 'postgres'
     OR EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'catalog_products') THEN
    RAISE EXCEPTION 'Refusing an unexpected destination or the live catalog database';
  END IF;
END $$;

CREATE SCHEMA spree;
CREATE SCHEMA spree_recovery;
REVOKE ALL ON SCHEMA spree, spree_recovery FROM PUBLIC, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA spree
  REVOKE ALL ON TABLES FROM anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA spree_recovery
  REVOKE ALL ON TABLES FROM anon, authenticated, service_role;

CREATE TABLE spree_recovery.source_records (
  source_table text NOT NULL CHECK (source_table IN ('catalog_products', 'catalog_variants', 'catalog_supplier_offers')),
  source_id uuid NOT NULL,
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object' AND payload->>'id' = source_id::text),
  captured_at timestamptz NOT NULL,
  PRIMARY KEY (source_table, source_id)
);
CREATE TABLE spree_recovery.destination_mappings (
  source_table text NOT NULL CHECK (source_table IN ('catalog_products', 'catalog_variants')),
  source_id uuid NOT NULL,
  destination_id text NOT NULL,
  verified_at timestamptz,
  PRIMARY KEY (source_table, source_id),
  UNIQUE (source_table, destination_id),
  FOREIGN KEY (source_table, source_id) REFERENCES spree_recovery.source_records
);
ALTER TABLE spree_recovery.source_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE spree_recovery.destination_mappings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA spree_recovery FROM PUBLIC, anon, authenticated, service_role;
COMMIT;
