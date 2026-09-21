begin;

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.catalog_suppliers (
  id uuid primary key default extensions.gen_random_uuid(),
  code text not null unique,
  name text not null,
  adapter_key text not null,
  enabled boolean not null default true,
  priority integer not null default 100,
  default_currency text not null default 'EUR',
  stale_after_hours integer not null default 18,
  sync_interval_hours integer not null default 6,
  next_sync_at timestamptz,
  last_success_at timestamptz,
  last_completed_run_id text,
  last_error text,
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint catalog_suppliers_code_format
    check (code ~ '^[a-z0-9][a-z0-9_]{0,47}$'),
  constraint catalog_suppliers_currency_format
    check (default_currency ~ '^[A-Z]{3}$'),
  constraint catalog_suppliers_stale_after_positive
    check (stale_after_hours > 0),
  constraint catalog_suppliers_interval_positive
    check (sync_interval_hours > 0),
  constraint catalog_suppliers_config_object
    check (jsonb_typeof(config) = 'object')
);

comment on column public.catalog_suppliers.config is
  'Non-secret adapter settings only. Store supplier credentials in Supabase Vault or Edge Function secrets.';

create table if not exists public.catalog_products (
  id uuid primary key default extensions.gen_random_uuid(),
  canonical_key text not null unique,
  name text not null,
  category_key text,
  brand text,
  match_strategy text not null,
  match_confidence text not null default 'medium',
  requires_review boolean not null default false,
  spree_product_id text unique,
  sync_lock_token uuid,
  sync_lock_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint catalog_products_match_confidence
    check (match_confidence in ('high', 'medium', 'low'))
);

create table if not exists public.catalog_variants (
  id uuid primary key default extensions.gen_random_uuid(),
  product_id uuid not null references public.catalog_products(id) on delete cascade,
  canonical_key text not null unique,
  canonical_sku text not null unique,
  name text,
  option_values jsonb not null default '{}'::jsonb,
  option_signature text not null default '',
  match_strategy text not null,
  match_confidence text not null default 'medium',
  requires_review boolean not null default false,
  spree_variant_id text unique,
  selected_offer_id uuid,
  selected_at timestamptz,
  last_auto_price numeric(12, 2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint catalog_variants_match_confidence
    check (match_confidence in ('high', 'medium', 'low')),
  constraint catalog_variants_options_object
    check (jsonb_typeof(option_values) = 'object'),
  constraint catalog_variants_last_auto_price_positive
    check (last_auto_price is null or last_auto_price > 0)
);

create index if not exists catalog_variants_product_idx
  on public.catalog_variants(product_id);

create table if not exists public.catalog_variant_identifiers (
  id uuid primary key default extensions.gen_random_uuid(),
  variant_id uuid not null references public.catalog_variants(id) on delete cascade,
  namespace text not null,
  value text not null,
  created_at timestamptz not null default now(),
  unique (namespace, value)
);

create index if not exists catalog_variant_identifiers_variant_idx
  on public.catalog_variant_identifiers(variant_id);

create table if not exists public.catalog_supplier_offers (
  id uuid primary key default extensions.gen_random_uuid(),
  supplier_id uuid not null references public.catalog_suppliers(id) on delete restrict,
  variant_id uuid not null references public.catalog_variants(id) on delete cascade,
  external_product_id text,
  external_variant_id text not null,
  supplier_sku text not null,
  purchase_price numeric(14, 4) not null,
  shipping_cost numeric(14, 4) not null default 0,
  normalized_cost numeric(14, 4) not null,
  currency text not null default 'EUR',
  tax_included boolean not null default false,
  tax_rate numeric(7, 6),
  reference_price_net numeric(14, 4),
  availability text not null default 'unknown',
  stock_quantity integer,
  release_date date,
  source_url text,
  raw_payload jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  last_seen_run_id text,
  missing_runs integer not null default 0,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (supplier_id, external_variant_id),
  constraint catalog_supplier_offers_purchase_price_positive
    check (purchase_price > 0),
  constraint catalog_supplier_offers_shipping_cost_nonnegative
    check (shipping_cost >= 0),
  constraint catalog_supplier_offers_normalized_cost_positive
    check (normalized_cost > 0),
  constraint catalog_supplier_offers_currency_format
    check (currency ~ '^[A-Z]{3}$'),
  constraint catalog_supplier_offers_tax_rate_range
    check (tax_rate is null or (tax_rate >= 0 and tax_rate < 1)),
  constraint catalog_supplier_offers_reference_price_positive
    check (reference_price_net is null or reference_price_net > 0),
  constraint catalog_supplier_offers_availability
    check (availability in ('available', 'preorder', 'unavailable', 'unknown')),
  constraint catalog_supplier_offers_stock_nonnegative
    check (stock_quantity is null or stock_quantity >= 0),
  constraint catalog_supplier_offers_missing_runs_nonnegative
    check (missing_runs >= 0),
  constraint catalog_supplier_offers_payload_object
    check (jsonb_typeof(raw_payload) = 'object')
);

create index if not exists catalog_supplier_offers_variant_idx
  on public.catalog_supplier_offers(variant_id);
create index if not exists catalog_supplier_offers_supplier_sku_idx
  on public.catalog_supplier_offers(supplier_id, supplier_sku);
create index if not exists catalog_supplier_offers_selection_idx
  on public.catalog_supplier_offers(variant_id, normalized_cost, supplier_id)
  where active and availability in ('available', 'preorder');
create index if not exists catalog_supplier_offers_last_seen_idx
  on public.catalog_supplier_offers(supplier_id, last_seen_at);

create or replace function public.catalog_reject_closed_run_write()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_is_seen_write boolean;
begin
  if tg_op = 'INSERT' then
    v_is_seen_write := true;
  else
    v_is_seen_write :=
      new.last_seen_run_id is distinct from old.last_seen_run_id
      or new.last_seen_at is distinct from old.last_seen_at;
  end if;

  if new.last_seen_run_id is not null
    and v_is_seen_write
    and exists (
      select 1
      from public.catalog_suppliers s
      where s.id = new.supplier_id
        and s.last_completed_run_id = new.last_seen_run_id
    ) then
    raise exception 'supplier run % is already closed', new.last_seen_run_id;
  end if;
  return new;
end;
$$;

drop trigger if exists catalog_supplier_offers_closed_run_guard
  on public.catalog_supplier_offers;

do $$
begin
  alter table public.catalog_variants
    add constraint catalog_variants_selected_offer_fk
    foreign key (selected_offer_id)
    references public.catalog_supplier_offers(id)
    on delete set null;
exception
  when duplicate_object then null;
end
$$;

create index if not exists catalog_variants_selected_offer_idx
  on public.catalog_variants(selected_offer_id)
  where selected_offer_id is not null;

create table if not exists public.catalog_offer_selection_history (
  id bigint generated always as identity primary key,
  variant_id uuid not null references public.catalog_variants(id) on delete cascade,
  previous_offer_id uuid references public.catalog_supplier_offers(id) on delete set null,
  selected_offer_id uuid references public.catalog_supplier_offers(id) on delete set null,
  reason text not null default 'lowest_eligible_normalized_cost',
  selected_at timestamptz not null default now()
);

create index if not exists catalog_offer_selection_history_variant_idx
  on public.catalog_offer_selection_history(variant_id, selected_at desc);
create index if not exists catalog_offer_selection_history_previous_offer_idx
  on public.catalog_offer_selection_history(previous_offer_id)
  where previous_offer_id is not null;
create index if not exists catalog_offer_selection_history_selected_offer_idx
  on public.catalog_offer_selection_history(selected_offer_id)
  where selected_offer_id is not null;

create or replace function public.catalog_claim_product_sync(
  p_product_id uuid,
  p_token uuid,
  p_seconds integer default 90
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  claimed boolean;
begin
  if p_product_id is null or p_token is null then
    return false;
  end if;

  update public.catalog_products
  set
    sync_lock_token = p_token,
    sync_lock_until = now() + make_interval(
      secs => least(greatest(coalesce(p_seconds, 90), 10), 300)
    ),
    updated_at = now()
  where id = p_product_id
    and (
      sync_lock_until is null
      or sync_lock_until < now()
      or sync_lock_token = p_token
    )
  returning true into claimed;
  return coalesce(claimed, false);
end;
$$;

create or replace function public.catalog_release_product_sync(
  p_product_id uuid,
  p_token uuid
)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.catalog_products
  set
    sync_lock_token = null,
    sync_lock_until = null,
    updated_at = now()
  where id = p_product_id
    and sync_lock_token = p_token;
$$;

create or replace function public.catalog_complete_supplier_run(
  p_supplier_id uuid,
  p_run_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_last_completed_run_id text;
  v_sync_interval_hours integer;
  v_missing integer := 0;
  v_deactivated integer := 0;
  v_variant_ids jsonb := '[]'::jsonb;
  v_now timestamptz := now();
begin
  if p_supplier_id is null or p_run_id is null or
    p_run_id !~ '^[A-Za-z0-9:_-]{1,120}$' then
    raise exception 'invalid supplier run';
  end if;

  select last_completed_run_id, sync_interval_hours
  into v_last_completed_run_id, v_sync_interval_hours
  from public.catalog_suppliers
  where id = p_supplier_id
  for update;

  if not found then
    raise exception 'supplier not found';
  end if;

  if v_last_completed_run_id = p_run_id then
    return jsonb_build_object(
      'missing', 0,
      'deactivated', 0,
      'alreadyCompleted', true,
      'variantIds', '[]'::jsonb
    );
  end if;

  with updated as (
    update public.catalog_supplier_offers
    set
      missing_runs = missing_runs + 1,
      active = case when missing_runs + 1 >= 2 then false else active end,
      availability = case
        when missing_runs + 1 >= 2 then 'unavailable'
        else availability
      end,
      updated_at = v_now
    where supplier_id = p_supplier_id
      and last_seen_run_id is distinct from p_run_id
      and (active or missing_runs < 2)
    returning variant_id, missing_runs
  )
  select
    count(*)::integer,
    count(*) filter (where missing_runs = 2)::integer,
    coalesce(
      jsonb_agg(distinct variant_id) filter (where missing_runs = 2),
      '[]'::jsonb
    )
  into v_missing, v_deactivated, v_variant_ids
  from updated;

  update public.catalog_suppliers
  set
    last_success_at = v_now,
    last_completed_run_id = p_run_id,
    last_error = null,
    next_sync_at = v_now + make_interval(hours => v_sync_interval_hours),
    updated_at = v_now
  where id = p_supplier_id;

  return jsonb_build_object(
    'missing', v_missing,
    'deactivated', v_deactivated,
    'alreadyCompleted', false,
    'variantIds', v_variant_ids
  );
end;
$$;

revoke all on function public.catalog_claim_product_sync(uuid, uuid, integer)
  from public, anon, authenticated;
revoke all on function public.catalog_release_product_sync(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.catalog_complete_supplier_run(uuid, text)
  from public, anon, authenticated;
revoke all on function public.catalog_reject_closed_run_write()
  from public, anon, authenticated, service_role;
grant execute on function public.catalog_claim_product_sync(uuid, uuid, integer)
  to service_role;
grant execute on function public.catalog_release_product_sync(uuid, uuid)
  to service_role;
grant execute on function public.catalog_complete_supplier_run(uuid, text)
  to service_role;

-- Internal operator view: one row per variant with the supplier that must fulfil it.
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
  v.selected_at
from public.catalog_variants v
join public.catalog_products p on p.id = v.product_id
left join public.catalog_supplier_offers o on o.id = v.selected_offer_id
left join public.catalog_suppliers s on s.id = o.supplier_id;

alter table public.catalog_suppliers enable row level security;
alter table public.catalog_products enable row level security;
alter table public.catalog_variants enable row level security;
alter table public.catalog_variant_identifiers enable row level security;
alter table public.catalog_supplier_offers enable row level security;
alter table public.catalog_offer_selection_history enable row level security;

revoke all on table public.catalog_suppliers from anon, authenticated;
revoke all on table public.catalog_products from anon, authenticated;
revoke all on table public.catalog_variants from anon, authenticated;
revoke all on table public.catalog_variant_identifiers from anon, authenticated;
revoke all on table public.catalog_supplier_offers from anon, authenticated;
revoke all on table public.catalog_offer_selection_history from anon, authenticated;
revoke all on table public.catalog_selected_supply from anon, authenticated;

grant all on table public.catalog_suppliers to service_role;
grant all on table public.catalog_products to service_role;
grant all on table public.catalog_variants to service_role;
grant all on table public.catalog_variant_identifiers to service_role;
grant all on table public.catalog_supplier_offers to service_role;
grant all on table public.catalog_offer_selection_history to service_role;
grant select on table public.catalog_selected_supply to service_role;
grant usage, select on sequence public.catalog_offer_selection_history_id_seq to service_role;

insert into public.catalog_suppliers (
  code,
  name,
  adapter_key,
  enabled,
  priority,
  default_currency,
  stale_after_hours,
  sync_interval_hours
)
values ('devir', 'Devir', 'devir_b2b', true, 100, 'EUR', 18, 6)
on conflict (code) do update
set
  name = excluded.name,
  adapter_key = excluded.adapter_key,
  updated_at = now();

-- Preserve all existing Spree identities. Supplier SKUs remain identifiers of
-- Devir offers; they are no longer treated as globally unique catalog IDs.
with legacy as (
  select
    d.*,
    case
      when d.spree_product_id is not null then 'spree:' || d.spree_product_id
      when d.group_key is not null then 'legacy-group:devir:' || d.group_key
      else 'legacy-item:devir:' || d.supplier_sku
    end as canonical_key
  from public.devir_sync_catalog d
)
insert into public.catalog_products (
  canonical_key,
  name,
  match_strategy,
  match_confidence,
  requires_review,
  spree_product_id
)
select distinct on (canonical_key)
  canonical_key,
  coalesce(nullif(group_name, ''), name),
  'legacy_spree_mapping',
  'high',
  false,
  spree_product_id
from legacy
order by canonical_key, updated_at desc
on conflict do nothing;

with legacy as (
  select
    d.*,
    case
      when d.spree_product_id is not null then 'spree:' || d.spree_product_id
      when d.group_key is not null then 'legacy-group:devir:' || d.group_key
      else 'legacy-item:devir:' || d.supplier_sku
    end as product_key,
    case
      when d.spree_variant_id is not null then 'spree:' || d.spree_variant_id
      else 'legacy-offer:devir:' || d.supplier_sku
    end as variant_key
  from public.devir_sync_catalog d
)
insert into public.catalog_variants (
  product_id,
  canonical_key,
  canonical_sku,
  name,
  option_values,
  option_signature,
  match_strategy,
  match_confidence,
  requires_review,
  spree_variant_id,
  last_auto_price
)
select
  p.id,
  l.variant_key,
  l.supplier_sku,
  l.variant_label,
  jsonb_strip_nulls(jsonb_build_object(
    'tomo', case
      when l.variant_position is not null
        then lpad(l.variant_position::text, 2, '0')
      else null
    end,
    'edicion', case
      when position(' · ' in coalesce(l.variant_label, '')) > 0
        then btrim(substring(
          l.variant_label
          from position(' · ' in l.variant_label) + 3
        ))
      else null
    end,
    'idioma', l.language_label
  )),
  concat_ws(
    '&',
    case
      when l.variant_position is not null
        then 'tomo=' || lpad(l.variant_position::text, 2, '0')
      else null
    end,
    case
      when position(' · ' in coalesce(l.variant_label, '')) > 0
        then 'edicion=' || lower(btrim(substring(
          l.variant_label
          from position(' · ' in l.variant_label) + 3
        )))
      else null
    end,
    case
      when l.language_label is not null
        then 'idioma=' || lower(l.language_label)
      else null
    end
  ),
  'legacy_spree_mapping',
  'high',
  false,
  l.spree_variant_id,
  l.last_auto_price
from legacy l
join public.catalog_products p on p.canonical_key = l.product_key
on conflict do nothing;

insert into public.catalog_variant_identifiers (variant_id, namespace, value)
select
  v.id,
  'supplier:devir',
  lower(regexp_replace(d.supplier_sku, '[^a-zA-Z0-9]+', '-', 'g'))
from public.devir_sync_catalog d
join public.catalog_variants v
  on v.canonical_key = case
    when d.spree_variant_id is not null then 'spree:' || d.spree_variant_id
    else 'legacy-offer:devir:' || d.supplier_sku
  end
on conflict do nothing;

-- A supplier SKU becomes a global identifier only when it is a checksum-valid
-- GTIN/EAN or ISBN-10. Length alone is not safe enough for deduplication.
with candidates as (
  select
    v.id as variant_id,
    upper(regexp_replace(d.supplier_sku, '[^0-9X]+', '', 'g')) as compact
  from public.devir_sync_catalog d
  join public.catalog_variants v
    on v.canonical_key = case
      when d.spree_variant_id is not null then 'spree:' || d.spree_variant_id
      else 'legacy-offer:devir:' || d.supplier_sku
    end
), validated as (
  select
    c.*,
    case
      when length(c.compact) = 10
        and c.compact ~ '^[0-9]{9}[0-9X]$'
        and mod((
          select sum(
            case
              when substring(c.compact from i for 1) = 'X' then 10
              else substring(c.compact from i for 1)::integer
            end * (11 - i)
          )
          from generate_series(1, 10) as i
        ), 11) = 0
        then 'isbn'
      when length(c.compact) in (8, 12, 13, 14)
        and c.compact ~ '^[0-9]+$'
        and substring(
          c.compact from length(c.compact) for 1
        )::integer = mod(10 - mod((
          select sum(
            substring(c.compact from i for 1)::integer *
            case when mod(length(c.compact) - i, 2) = 1 then 3 else 1 end
          )
          from generate_series(1, length(c.compact) - 1) as i
        ), 10), 10)
        then 'gtin'
      else null
    end as namespace
  from candidates c
)
insert into public.catalog_variant_identifiers (variant_id, namespace, value)
select variant_id, namespace, compact
from validated
where namespace is not null
on conflict do nothing;

with legacy_offer as (
  select
    d.*,
    case
      when d.spree_variant_id is not null then 'spree:' || d.spree_variant_id
      else 'legacy-offer:devir:' || d.supplier_sku
    end as variant_key,
    case
      when d.snapshot->>'purchasePrice' ~ '^[0-9]+([.][0-9]+)?$'
        then (d.snapshot->>'purchasePrice')::numeric
      else null
    end as cost
  from public.devir_sync_catalog d
)
insert into public.catalog_supplier_offers (
  supplier_id,
  variant_id,
  external_product_id,
  external_variant_id,
  supplier_sku,
  purchase_price,
  normalized_cost,
  currency,
  tax_included,
  reference_price_net,
  availability,
  release_date,
  source_url,
  raw_payload,
  active,
  last_seen_run_id,
  missing_runs,
  first_seen_at,
  last_seen_at,
  updated_at
)
select
  s.id,
  v.id,
  l.source_url,
  l.supplier_sku,
  l.supplier_sku,
  l.cost,
  l.cost,
  'EUR',
  false,
  case
    when l.snapshot->>'referencePriceNet' ~ '^[0-9]+([.][0-9]+)?$'
      then (l.snapshot->>'referencePriceNet')::numeric
    else null
  end,
  case
    when l.supplier_status in ('available', 'preorder', 'unavailable', 'unknown')
      then l.supplier_status
    else 'unknown'
  end,
  case
    when pg_input_is_valid(l.snapshot->>'releaseDate', 'date')
      then (l.snapshot->>'releaseDate')::date
    else null
  end,
  l.source_url,
  coalesce(l.snapshot, '{}'::jsonb) || jsonb_build_object(
    'supplierCode', 'devir',
    'supplierName', 'Devir',
    'adapterKey', 'devir_b2b',
    'externalProductId', l.source_url,
    'externalVariantId', l.supplier_sku,
    'supplierSku', l.supplier_sku,
    'productName', l.name,
    'purchasePrice', l.cost,
    'normalizedCost', l.cost,
    'currency', 'EUR',
    'taxIncluded', false,
    'availability', case
      when l.supplier_status in ('available', 'preorder', 'unavailable', 'unknown')
        then l.supplier_status
      else 'unknown'
    end,
    'sourceUrl', l.source_url,
    'imageUrls', coalesce(to_jsonb(l.image_urls), '[]'::jsonb)
  ),
  l.supplier_status in ('available', 'preorder') and l.missing_cycles < 2,
  l.last_seen_cycle_id::text,
  l.missing_cycles,
  coalesce(l.last_seen_at, l.updated_at, now()),
  coalesce(l.last_seen_at, l.updated_at, now()),
  coalesce(l.updated_at, now())
from legacy_offer l
join public.catalog_suppliers s on s.code = 'devir'
join public.catalog_variants v on v.canonical_key = l.variant_key
where l.cost > 0
on conflict (supplier_id, external_variant_id) do nothing;

with ranked as (
  select
    o.id as offer_id,
    o.variant_id,
    row_number() over (
      partition by o.variant_id
      order by
        o.normalized_cost,
        case o.availability when 'available' then 0 else 1 end,
        s.priority,
        s.code,
        o.supplier_sku,
        o.id
    ) as position
  from public.catalog_supplier_offers o
  join public.catalog_suppliers s on s.id = o.supplier_id
  where o.active
    and s.enabled
    and o.availability in ('available', 'preorder')
    and o.currency = 'EUR'
    and o.last_seen_at >= now() - make_interval(hours => s.stale_after_hours)
)
update public.catalog_variants v
set
  selected_offer_id = ranked.offer_id,
  selected_at = now(),
  updated_at = now()
from ranked
where ranked.variant_id = v.id
  and ranked.position = 1
  and v.selected_offer_id is null;

create trigger catalog_supplier_offers_closed_run_guard
before insert or update on public.catalog_supplier_offers
for each row execute function public.catalog_reject_closed_run_write();

commit;
