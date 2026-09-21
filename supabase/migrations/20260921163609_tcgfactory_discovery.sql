begin;

create table if not exists public.catalog_supplier_discovery (
  id uuid primary key default extensions.gen_random_uuid(),
  supplier_id uuid not null references public.catalog_suppliers(id) on delete cascade,
  external_product_id text,
  external_variant_id text not null,
  supplier_sku text,
  gtin text,
  product_name text not null,
  source_url text not null,
  category_key text,
  manufacturer text,
  manufacturer_sku text,
  options jsonb not null default '{}'::jsonb,
  reference_price_net numeric(14, 4),
  availability text not null default 'unknown',
  release_date date,
  image_urls jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  last_seen_run_id text,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (supplier_id, external_variant_id),
  constraint catalog_supplier_discovery_reference_price_positive
    check (reference_price_net is null or reference_price_net > 0),
  constraint catalog_supplier_discovery_availability
    check (availability in ('available','preorder','unavailable','unknown')),
  constraint catalog_supplier_discovery_options_object
    check (jsonb_typeof(options) = 'object'),
  constraint catalog_supplier_discovery_images_array
    check (jsonb_typeof(image_urls) = 'array'),
  constraint catalog_supplier_discovery_metadata_object
    check (jsonb_typeof(metadata) = 'object')
);

create index if not exists catalog_supplier_discovery_supplier_idx
  on public.catalog_supplier_discovery(supplier_id, active, last_seen_at desc);
create index if not exists catalog_supplier_discovery_category_idx
  on public.catalog_supplier_discovery(category_key)
  where active;
create index if not exists catalog_supplier_discovery_gtin_idx
  on public.catalog_supplier_discovery(gtin)
  where gtin is not null;

create table if not exists public.catalog_supplier_crawl_state (
  supplier_id uuid primary key references public.catalog_suppliers(id) on delete cascade,
  run_id text,
  section text not null default 'accessories',
  page integer not null default 1,
  item_offset integer not null default 0,
  total_pages integer,
  discovered_items integer not null default 0,
  processed_items integer not null default 0,
  failed_items integer not null default 0,
  status text not null default 'idle',
  last_error text,
  started_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint catalog_supplier_crawl_state_page_positive check (page > 0),
  constraint catalog_supplier_crawl_state_offset_nonnegative check (item_offset >= 0),
  constraint catalog_supplier_crawl_state_counts_nonnegative check (
    discovered_items >= 0 and processed_items >= 0 and failed_items >= 0
  ),
  constraint catalog_supplier_crawl_state_status check (status in ('idle','running','error'))
);

alter table public.catalog_supplier_discovery enable row level security;
alter table public.catalog_supplier_crawl_state enable row level security;

revoke all on table public.catalog_supplier_discovery from anon, authenticated;
revoke all on table public.catalog_supplier_crawl_state from anon, authenticated;
grant all on table public.catalog_supplier_discovery to service_role;
grant all on table public.catalog_supplier_crawl_state to service_role;

insert into public.catalog_suppliers (
  code,name,adapter_key,enabled,priority,default_currency,
  stale_after_hours,sync_interval_hours,last_error,config
)
values (
  'tcgfactory','TcgFactory','tcgfactory_b2b_bridge_v1',true,100,'EUR',
  18,6,'credentials_not_checked',
  '{"feedContract":"tcgfactory_b2b_bridge_v1","transport":"authenticated_prestashop_web_v1","documentation":"TCGFACTORY_SYNC.md","sections":["accessories"],"secretNames":{"email":"TCGFACTORY_B2B_EMAIL","password":"TCGFACTORY_B2B_PASSWORD"}}'::jsonb
)
on conflict (code) do update set
  name=excluded.name,
  adapter_key=excluded.adapter_key,
  enabled=true,
  config=excluded.config,
  last_error=case
    when public.catalog_suppliers.last_error like 'disabled:%'
      then 'credentials_not_checked'
    else public.catalog_suppliers.last_error
  end,
  updated_at=now();

commit;
