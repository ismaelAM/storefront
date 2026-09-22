alter table public.catalog_products
  add column if not exists review_decision text not null default 'pending',
  add column if not exists approved_review_fingerprint text,
  add column if not exists review_decided_at timestamptz,
  add column if not exists review_note text;

do $$
begin
  alter table public.catalog_products
    add constraint catalog_products_review_decision
    check (review_decision in ('pending', 'approved', 'rejected'));
exception
  when duplicate_object then null;
end
$$;

alter table public.catalog_variants
  add column if not exists fulfillment_mode text not null default 'supplier_or_physical';

do $$
begin
  alter table public.catalog_variants
    add constraint catalog_variants_fulfillment_mode
    check (fulfillment_mode in ('supplier_or_physical', 'physical_only', 'disabled'));
exception
  when duplicate_object then null;
end
$$;

create or replace view public.catalog_selected_supply
with (security_invoker = true)
as
select
  v.id as variant_id,
  v.canonical_sku,
  v.spree_variant_id,
  p.id as product_id,
  p.name as product_name,
  p.spree_product_id,
  s.code as supplier_code,
  s.name as supplier_name,
  s.enabled as supplier_enabled,
  s.stale_after_hours as supplier_stale_after_hours,
  o.supplier_sku,
  o.external_variant_id,
  o.purchase_price,
  o.shipping_cost,
  o.normalized_cost,
  o.currency,
  o.reference_price_net,
  o.tax_included,
  o.tax_rate,
  o.availability,
  o.stock_quantity,
  o.source_url,
  o.last_seen_at,
  v.selected_at,
  v.fulfillment_mode
from public.catalog_variants v
join public.catalog_products p on p.id = v.product_id
left join public.catalog_supplier_offers o on o.id = v.selected_offer_id
left join public.catalog_suppliers s on s.id = o.supplier_id;

update public.catalog_variants v
set
  fulfillment_mode = 'physical_only',
  updated_at = now()
from public.catalog_products p
where p.id = v.product_id
  and exists (
    select 1
    from public.devir_sync_catalog d
    where d.spree_product_id = p.spree_product_id
      and d.catalog_state = 'review'
      and coalesce(d.last_error, '') like '%pack_requires_operator_split%'
  );

revoke all on table public.catalog_selected_supply from anon, authenticated;
grant select on table public.catalog_selected_supply to service_role;
