alter table public.catalog_daily_offer_state add column if not exists pending_rotation jsonb;
comment on column public.catalog_daily_offer_state.pending_rotation is 'Madrid-day-scoped native eligibility rejections used to find replacement offer candidates; not active prices or publication state.';
