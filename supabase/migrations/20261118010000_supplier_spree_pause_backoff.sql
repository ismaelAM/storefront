-- A provider pause persists across Edge Function instances. Keep this separate
-- from Devir's disabled flag, sync checkpoints and the daily offer state.
ALTER TABLE public.devir_sync_config
  ADD COLUMN IF NOT EXISTS spree_pause_until timestamptz;
