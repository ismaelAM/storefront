begin;

-- A separate maintenance cursor preserves the full-crawl position and prevents
-- permanently failing supplier URLs from starving all later offer refreshes.
alter table public.catalog_supplier_crawl_state
  add column if not exists refresh_after_id uuid,
  add column if not exists refresh_turn integer not null default 0
    check (refresh_turn between 0 and 2);

-- Turns survive ticks skipped by the worker lock and hard request timeouts.
alter table public.devir_sync_config
  add column if not exists last_supplier_tick text;

create index if not exists catalog_supplier_offers_refresh_cursor_idx
  on public.catalog_supplier_offers (supplier_id, id)
  where active and availability in ('available', 'preorder')
    and source_url is not null;

commit;
