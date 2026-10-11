-- CLI unavailable in this workspace; reviewed migration applied through MCP.
create table public.social_offer_publications (
  day_key date not null,
  account_id text not null,
  status text not null default 'working'
    check (status in ('working','publishing','prepared','published','failed','uncertain')),
  checkpoint jsonb,
  media_id text,
  lease_token uuid not null,
  lease_until timestamptz,
  updated_at timestamptz not null default now(),
  primary key (day_key, account_id)
);
alter table public.social_offer_publications enable row level security;
revoke all on public.social_offer_publications from public, anon, authenticated;
grant all on public.social_offer_publications to service_role;

create function public.claim_social_offer_publication(p_day date, p_account text, p_token uuid)
returns setof public.social_offer_publications
language sql security invoker set search_path = '' as $$
  insert into public.social_offer_publications(day_key,account_id,lease_token,lease_until)
  values(p_day,p_account,p_token,now()+interval '10 minutes')
  on conflict(day_key,account_id) do update
    set status='working',lease_token=p_token,lease_until=now()+interval '10 minutes',updated_at=now()
    where social_offer_publications.status in ('working','failed')
      and (social_offer_publications.lease_until is null or social_offer_publications.lease_until < now())
      and not coalesce((social_offer_publications.checkpoint->>'publishAttempted')::boolean,false)
  returning *;
$$;
revoke all on function public.claim_social_offer_publication(date,text,uuid) from public,anon,authenticated;
grant execute on function public.claim_social_offer_publication(date,text,uuid) to service_role;

-- These JPEGs contain only products and public prices, intended for Instagram.
-- No anonymous upload/update policy; all writes use the existing server role.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('daily-offers','daily-offers',true,8388608,array['image/jpeg']);
