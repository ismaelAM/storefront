begin;

create or replace function public.tcgfactory_sync_get_credentials()
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'email',
    (select decrypted_secret from vault.decrypted_secrets where name = 'tcgfactory_b2b_email' limit 1),
    'password',
    (select decrypted_secret from vault.decrypted_secrets where name = 'tcgfactory_b2b_password' limit 1)
  );
$$;

create or replace function public.tcgfactory_sync_set_credentials(
  p_email text,
  p_password text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email_id uuid;
  v_password_id uuid;
begin
  if nullif(trim(p_email), '') is null or nullif(p_password, '') is null then
    raise exception 'TcgFactory email/password cannot be empty';
  end if;

  select id into v_email_id
  from vault.decrypted_secrets
  where name = 'tcgfactory_b2b_email'
  limit 1;

  if v_email_id is null then
    perform vault.create_secret(
      trim(p_email),
      'tcgfactory_b2b_email',
      'TcgFactory B2B email for automatic supplier synchronization',
      null
    );
  else
    perform vault.update_secret(
      v_email_id,
      trim(p_email),
      'tcgfactory_b2b_email',
      'TcgFactory B2B email for automatic supplier synchronization',
      null
    );
  end if;

  select id into v_password_id
  from vault.decrypted_secrets
  where name = 'tcgfactory_b2b_password'
  limit 1;

  if v_password_id is null then
    perform vault.create_secret(
      p_password,
      'tcgfactory_b2b_password',
      'TcgFactory B2B password for automatic supplier synchronization',
      null
    );
  else
    perform vault.update_secret(
      v_password_id,
      p_password,
      'tcgfactory_b2b_password',
      'TcgFactory B2B password for automatic supplier synchronization',
      null
    );
  end if;
end;
$$;

revoke all on function public.tcgfactory_sync_get_credentials() from public, anon, authenticated;
revoke all on function public.tcgfactory_sync_set_credentials(text,text) from public, anon, authenticated;
grant execute on function public.tcgfactory_sync_get_credentials() to service_role;
grant execute on function public.tcgfactory_sync_set_credentials(text,text) to service_role;

commit;
