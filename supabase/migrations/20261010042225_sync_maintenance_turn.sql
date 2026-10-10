-- Persist global maintenance rotation independently of any supplier adapter.
-- Supabase CLI migration-new unavailable in this runner (SIGABRT on --help).
ALTER TABLE public.devir_sync_config
  ADD COLUMN IF NOT EXISTS maintenance_turn integer NOT NULL DEFAULT 0
  CHECK (maintenance_turn >= 0);
COMMENT ON COLUMN public.devir_sync_config.maintenance_turn IS
  'Durable next global maintenance lane; worker advances modulo four before work.';

-- Supplier completion and Spree reconciliation span separate services. Persist
-- work before closing the run; acknowledge only after its Spree writes succeed.
ALTER TABLE public.catalog_suppliers
  ADD COLUMN IF NOT EXISTS pending_reconciliation_variant_ids uuid[]
  NOT NULL DEFAULT '{}'::uuid[];

CREATE OR REPLACE FUNCTION public.catalog_complete_supplier_run(p_supplier_id uuid, p_run_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_last_completed_run_id text;
  v_sync_interval_hours integer;
  v_pending uuid[];
  v_missing integer := 0;
  v_deactivated integer := 0;
  v_variant_ids uuid[];
  v_now timestamptz := now();
BEGIN
  IF p_supplier_id IS NULL OR p_run_id IS NULL OR p_run_id !~ '^[A-Za-z0-9:_-]{1,120}$' THEN
    RAISE EXCEPTION 'invalid supplier run';
  END IF;
  SELECT last_completed_run_id, sync_interval_hours, pending_reconciliation_variant_ids
    INTO v_last_completed_run_id, v_sync_interval_hours, v_pending
    FROM public.catalog_suppliers WHERE id = p_supplier_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'supplier not found'; END IF;
  IF v_last_completed_run_id = p_run_id THEN
    RETURN jsonb_build_object('missing', 0, 'deactivated', 0,
      'alreadyCompleted', true, 'variantIds', to_jsonb(v_pending));
  END IF;
  IF cardinality(v_pending) > 0 THEN
    RAISE EXCEPTION 'previous supplier reconciliation incomplete';
  END IF;
  WITH updated AS (
    UPDATE public.catalog_supplier_offers
      SET missing_runs = missing_runs + 1,
          active = CASE WHEN missing_runs + 1 >= 2 THEN false ELSE active END,
          availability = CASE WHEN missing_runs + 1 >= 2 THEN 'unavailable' ELSE availability END,
          updated_at = v_now
      WHERE supplier_id = p_supplier_id
        AND last_seen_run_id IS DISTINCT FROM p_run_id
        AND (active OR missing_runs < 2)
      RETURNING variant_id, missing_runs
  )
  SELECT count(*)::integer, count(*) FILTER (WHERE missing_runs = 2)::integer,
         coalesce(array_agg(DISTINCT variant_id) FILTER (WHERE missing_runs = 2), '{}'::uuid[])
    INTO v_missing, v_deactivated, v_variant_ids FROM updated;
  UPDATE public.catalog_suppliers
    SET last_success_at = v_now, last_completed_run_id = p_run_id, last_error = NULL,
        next_sync_at = v_now + make_interval(hours => v_sync_interval_hours),
        pending_reconciliation_variant_ids = v_variant_ids, updated_at = v_now
    WHERE id = p_supplier_id;
  RETURN jsonb_build_object('missing', v_missing, 'deactivated', v_deactivated,
    'alreadyCompleted', false, 'variantIds', to_jsonb(v_variant_ids));
END;
$$;

CREATE OR REPLACE FUNCTION public.catalog_ack_supplier_run_reconciliation(
  p_supplier_id uuid, p_run_id text, p_variant_id uuid
)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  UPDATE public.catalog_suppliers
    SET pending_reconciliation_variant_ids = array_remove(pending_reconciliation_variant_ids, p_variant_id)
    WHERE id = p_supplier_id AND last_completed_run_id = p_run_id;
  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.catalog_complete_supplier_run(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.catalog_complete_supplier_run(uuid, text) TO service_role;
REVOKE ALL ON FUNCTION public.catalog_ack_supplier_run_reconciliation(uuid, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.catalog_ack_supplier_run_reconciliation(uuid, text, uuid) TO service_role;
