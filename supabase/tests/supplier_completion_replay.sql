-- Transaction-only regression: no fixtures or commercial changes are committed.
BEGIN;
DO $$
DECLARE
  supplier uuid;
  product uuid;
  variant uuid;
  offer uuid;
  fixture text := 'replay_' || replace(extensions.gen_random_uuid()::text, '-', '');
  result jsonb;
  blocked boolean := false;
BEGIN
  INSERT INTO public.catalog_suppliers(code, name, adapter_key, enabled)
    VALUES (fixture, 'Transient replay fixture', 'fixture', false) RETURNING id INTO supplier;
  INSERT INTO public.catalog_products(canonical_key, name, match_strategy)
    VALUES (fixture, 'Transient replay fixture', 'exact_title_and_options') RETURNING id INTO product;
  INSERT INTO public.catalog_variants(product_id, canonical_key, canonical_sku, match_strategy)
    VALUES (product, fixture, fixture, 'exact_title_and_options') RETURNING id INTO variant;
  INSERT INTO public.catalog_supplier_offers(supplier_id, variant_id, external_variant_id,
      supplier_sku, purchase_price, normalized_cost, availability, missing_runs)
    VALUES (supplier, variant, fixture, fixture, 1, 1, 'available', 1) RETURNING id INTO offer;

  result := public.catalog_complete_supplier_run(supplier, 'fixture-run');
  IF result->>'deactivated' <> '1' OR result->'variantIds' <> jsonb_build_array(variant) THEN
    RAISE EXCEPTION 'first close did not persist reconciliation';
  END IF;
  result := public.catalog_complete_supplier_run(supplier, 'fixture-run');
  IF result->>'alreadyCompleted' <> 'true' OR result->'variantIds' <> jsonb_build_array(variant)
      OR (SELECT missing_runs FROM public.catalog_supplier_offers WHERE id = offer) <> 2 THEN
    RAISE EXCEPTION 'replay lost work or counted an absence twice';
  END IF;
  BEGIN
    PERFORM public.catalog_complete_supplier_run(supplier, 'fixture-next');
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'previous supplier reconciliation incomplete' THEN blocked := true; ELSE RAISE; END IF;
  END;
  IF NOT blocked THEN RAISE EXCEPTION 'new run bypassed pending reconciliation'; END IF;
  IF public.catalog_ack_supplier_run_reconciliation(supplier, 'wrong-run', variant) THEN
    RAISE EXCEPTION 'wrong run acknowledged work';
  END IF;
  IF NOT public.catalog_ack_supplier_run_reconciliation(supplier, 'fixture-run', variant) THEN
    RAISE EXCEPTION 'successful reconciliation could not acknowledge';
  END IF;
  result := public.catalog_complete_supplier_run(supplier, 'fixture-run');
  IF result->'variantIds' <> '[]'::jsonb THEN RAISE EXCEPTION 'acknowledged work was replayed'; END IF;
  PERFORM public.catalog_complete_supplier_run(supplier, 'fixture-next');
  IF (SELECT missing_runs FROM public.catalog_supplier_offers WHERE id = offer) <> 2 THEN
    RAISE EXCEPTION 'inactive offer counted repeatedly';
  END IF;
  IF has_function_privilege('anon', 'public.catalog_ack_supplier_run_reconciliation(uuid,text,uuid)', 'EXECUTE')
      OR has_function_privilege('authenticated', 'public.catalog_complete_supplier_run(uuid,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'private reconciliation RPC exposed';
  END IF;
END;
$$;
ROLLBACK;
