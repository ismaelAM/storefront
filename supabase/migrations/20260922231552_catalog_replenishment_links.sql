create table if not exists public.catalog_replenishment_links (
  id uuid primary key default extensions.gen_random_uuid(),
  source_offer_id uuid not null references public.catalog_supplier_offers(id) on delete cascade,
  target_variant_id uuid not null references public.catalog_variants(id) on delete cascade,
  units_per_source integer not null default 1,
  active boolean not null default true,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_offer_id, target_variant_id),
  constraint catalog_replenishment_links_units_positive
    check (units_per_source > 0)
);

create index if not exists catalog_replenishment_links_source_idx
  on public.catalog_replenishment_links(source_offer_id)
  where active;

create index if not exists catalog_replenishment_links_target_idx
  on public.catalog_replenishment_links(target_variant_id)
  where active;

create or replace view public.catalog_replenishment_links_view
with (security_invoker = true)
as
select
  l.id,
  l.active,
  l.units_per_source,
  l.note,
  l.created_at,
  l.updated_at,
  s.code as source_supplier_code,
  s.name as source_supplier_name,
  o.id as source_offer_id,
  o.supplier_sku as source_supplier_sku,
  o.availability as source_availability,
  o.stock_quantity as source_stock_quantity,
  o.normalized_cost as source_normalized_cost,
  o.currency as source_currency,
  p.id as target_product_id,
  p.name as target_product_name,
  p.spree_product_id as target_spree_product_id,
  v.id as target_variant_id,
  v.canonical_sku as target_canonical_sku,
  v.name as target_variant_name,
  v.spree_variant_id as target_spree_variant_id,
  v.fulfillment_mode as target_fulfillment_mode
from public.catalog_replenishment_links l
join public.catalog_supplier_offers o on o.id = l.source_offer_id
join public.catalog_suppliers s on s.id = o.supplier_id
join public.catalog_variants v on v.id = l.target_variant_id
join public.catalog_products p on p.id = v.product_id;

alter table public.catalog_replenishment_links enable row level security;
revoke all on table public.catalog_replenishment_links from anon, authenticated;
revoke all on table public.catalog_replenishment_links_view from anon, authenticated;
grant all on table public.catalog_replenishment_links to service_role;
grant select on table public.catalog_replenishment_links_view to service_role;
