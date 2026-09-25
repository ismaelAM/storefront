alter table public.devir_sync_config
  add column if not exists lock_token uuid;

create or replace function public.devir_sync_acquire_lock(p_seconds integer default 55)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_acquired boolean := false;
begin
  update public.devir_sync_config
  set lock_until = now() + make_interval(secs => greatest(10, least(p_seconds, 240))),
      lock_token = null,
      last_attempt_at = now(),
      updated_at = now()
  where id = 'primary'
    and (lock_until is null or lock_until < now())
  returning true into v_acquired;

  return coalesce(v_acquired, false);
end;
$function$;

create or replace function public.devir_sync_release_lock()
returns void
language sql
security definer
set search_path = ''
as $function$
  update public.devir_sync_config
  set lock_until = null, lock_token = null, updated_at = now()
  where id = 'primary'
    and lock_token is null;
$function$;

create or replace function public.devir_sync_acquire_lock(
  p_token uuid,
  p_seconds integer default 55
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_acquired boolean := false;
begin
  if p_token is null then
    return false;
  end if;

  update public.devir_sync_config
  set lock_until = now() + make_interval(secs => greatest(10, least(p_seconds, 240))),
      lock_token = p_token,
      last_attempt_at = now(),
      updated_at = now()
  where id = 'primary'
    and (
      lock_until is null
      or lock_until < now()
      or lock_token = p_token
    )
  returning true into v_acquired;

  return coalesce(v_acquired, false);
end;
$function$;

create or replace function public.devir_sync_release_lock(p_token uuid)
returns void
language sql
security definer
set search_path = ''
as $function$
  update public.devir_sync_config
  set lock_until = null, lock_token = null, updated_at = now()
  where id = 'primary'
    and lock_token = p_token;
$function$;

revoke all on function public.devir_sync_acquire_lock(integer) from public, anon, authenticated;
revoke all on function public.devir_sync_release_lock() from public, anon, authenticated;
revoke all on function public.devir_sync_acquire_lock(uuid, integer) from public, anon, authenticated;
revoke all on function public.devir_sync_release_lock(uuid) from public, anon, authenticated;

grant execute on function public.devir_sync_acquire_lock(integer) to service_role;
grant execute on function public.devir_sync_release_lock() to service_role;
grant execute on function public.devir_sync_acquire_lock(uuid, integer) to service_role;
grant execute on function public.devir_sync_release_lock(uuid) to service_role;
