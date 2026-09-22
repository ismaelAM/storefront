create table if not exists public.catalog_daily_offer_state (
  id text primary key,
  day_key date,
  spree_price_list_id text,
  special boolean not null default false,
  active_products jsonb not null default '[]'::jsonb,
  last_rotated_at timestamptz,
  last_error text,
  updated_at timestamptz not null default now(),
  constraint catalog_daily_offer_state_singleton check (id = 'primary'),
  constraint catalog_daily_offer_state_active_products_array
    check (jsonb_typeof(active_products) = 'array')
);

alter table public.catalog_daily_offer_state enable row level security;

revoke all on table public.catalog_daily_offer_state from anon, authenticated;

insert into public.catalog_daily_offer_state (id)
values ('primary')
on conflict (id) do nothing;
