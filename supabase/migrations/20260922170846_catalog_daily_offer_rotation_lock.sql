alter table public.catalog_daily_offer_state
  add column if not exists rotation_lock_until timestamptz,
  add column if not exists rotation_token uuid;
