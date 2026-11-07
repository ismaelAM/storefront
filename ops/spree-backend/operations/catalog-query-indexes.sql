-- Native Spree project only (dtrospakebdiqihhcrub), not supplier-source DB.
-- Cover Store API catalogue counts without changing price or publication rules.
-- Bound lock acquisition; the tables currently contain fewer than 10k rows each.
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '15s';
CREATE INDEX IF NOT EXISTS bison_products_live_store_status_id
  ON spree.spree_products (store_id, status, id)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS bison_variants_live_product_id
  ON spree.spree_variants (product_id, id)
  WHERE deleted_at IS NULL;
-- Rollback, if unused: DROP INDEX spree.bison_products_live_store_status_id;
-- DROP INDEX spree.bison_variants_live_product_id;
-- The measured count chose the product index; the variant index is available
-- for product-scoped joins, but no separate performance benefit is claimed.
