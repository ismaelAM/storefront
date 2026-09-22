alter table public.devir_sync_catalog
  add column if not exists review_marker_version text;

create index if not exists devir_sync_catalog_review_marker_idx
  on public.devir_sync_catalog (catalog_state, review_marker_version)
  where spree_product_id is not null;
