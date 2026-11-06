-- Same 05:00 Europe/Madrid offer date as the worker and storefront.
-- Preserve the shared rotation lock, lease and ambiguous-send protections.
create or replace function public.claim_social_offer_publication(p_day date, p_account text, p_token uuid)
returns setof public.social_offer_publications
language plpgsql security invoker set search_path = '' as $$
declare
  local_now timestamp := now() at time zone 'Europe/Madrid';
  offer_day date := local_now::date - case when local_now::time < time '05:00' then 1 else 0 end;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('catalog_daily_offer_publication'));
  if p_day <> offer_day or exists (
    select 1 from public.catalog_daily_offer_state s
    where s.id = 'primary' and (s.rotation_lock_until > now() or s.pending_rotation is not null)
  ) then return; end if;
  return query
    insert into public.social_offer_publications(day_key,account_id,lease_token,lease_until)
    values(p_day,p_account,p_token,now()+interval '10 minutes')
    on conflict(day_key,account_id) do update
      set status='working',lease_token=p_token,lease_until=now()+interval '10 minutes',updated_at=now()
      where social_offer_publications.status in ('working','failed')
        and (social_offer_publications.lease_until is null or social_offer_publications.lease_until < now())
        and not coalesce((social_offer_publications.checkpoint->>'publishAttempted')::boolean,false)
    returning *;
end;
$$;

-- Both claim paths must share the advisory lock and the same offer date.
create or replace function public.acquire_daily_offer_rotation(p_token uuid)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  claimed uuid;
  local_now timestamp := now() at time zone 'Europe/Madrid';
  offer_day date := local_now::date - case when local_now::time < time '05:00' then 1 else 0 end;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('catalog_daily_offer_publication'));
  if exists (
    select 1 from public.social_offer_publications p where p.day_key = offer_day and (
      p.status in ('publishing', 'published', 'uncertain')
      or coalesce((p.checkpoint->>'publishAttempted')::boolean, false)
      or (p.status = 'working' and p.lease_until > now())
    )
  ) then return null; end if;
  update public.catalog_daily_offer_state
    set rotation_token = p_token, rotation_lock_until = now() + interval '120 seconds', updated_at = now()
    where id = 'primary' and (rotation_lock_until is null or rotation_lock_until < now())
    returning rotation_token into claimed;
  return claimed;
end;
$$;
