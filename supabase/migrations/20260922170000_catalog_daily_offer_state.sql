create table if not exists public.catalog_daily_offer_state (
  id text primary key,
  day_key text,
  spree_price_list_id text,
  special boolean not null default false,
  active_products jsonb not null default '[]'::jsonb,
  last_rotated_at timestamptz,
  last_error text,
  updated_at timestamptz not null default now()
);

alter table public.catalog_daily_offer_state enable row level security;

comment on table public.catalog_daily_offer_state is
  'Private worker state for the current rotating merchandising offer set.';
comment on column public.catalog_daily_offer_state.active_products is
  'JSON array used to restore pre-existing sale/featured tags on the next rotation.';

insert into public.catalog_daily_offer_state (
  id,
  day_key,
  spree_price_list_id,
  special,
  active_products,
  last_rotated_at,
  last_error,
  updated_at
)
values (
  'primary',
  null,
  null,
  false,
  '[]'::jsonb,
  null,
  null,
  now()
)
on conflict (id) do nothing;
