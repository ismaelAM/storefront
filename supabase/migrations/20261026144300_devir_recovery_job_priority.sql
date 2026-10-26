-- Internal recovery ordering only; supplier identity, stock and prices are unchanged.
alter table public.devir_sync_jobs
  add column if not exists recovery_priority integer not null default 0
  check (recovery_priority >= 0);

create index if not exists devir_sync_jobs_pending_recovery_priority_idx
  on public.devir_sync_jobs (cycle_id, recovery_priority desc, id)
  where kind = 'product' and status = 'pending';
