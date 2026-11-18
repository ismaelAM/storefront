-- Source project ikglqbjlbkbaronbiryl only. Schedule one supplier tick every
-- four hours, anchored at 05:00 Madrid in both standard and summer time.
-- Preserve the vault-backed command, crawl checkpoints and active flag.
DO $economy$
DECLARE
  supplier_job record;
  target_schedule constant text := '0 0,3,4,7,8,11,12,15,16,19,20,23 * * *';
  madrid_gate constant text := 'WHERE extract(hour FROM now() AT TIME ZONE ''Europe/Madrid'')::int % 4 = 1';
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.devir_sync_config
    WHERE id='primary' AND spree_api_url='https://project-7ck7q.vercel.app'
  ) THEN
    RAISE EXCEPTION 'Unexpected supplier/backend configuration';
  END IF;

  SELECT * INTO STRICT supplier_job FROM cron.job
    WHERE jobname='devir-cloud-sync-tick';

  IF supplier_job.schedule = target_schedule
     AND position(madrid_gate IN supplier_job.command) > 0 THEN
    RETURN;
  END IF;

  IF supplier_job.schedule NOT IN ('*/30 * * * *', '0 * * * *')
     OR supplier_job.command !~* '^\s*select\s+net\.http_post\('
     OR supplier_job.command !~ '\);\s*$'
     OR length(supplier_job.command) - length(replace(supplier_job.command, ';', '')) <> 1
     OR position('devir_sync_worker_token' IN supplier_job.command) = 0
     OR position('Europe/Madrid' IN supplier_job.command) > 0 THEN
    RAISE EXCEPTION 'Unexpected supplier cron; inspect before changing it';
  END IF;

  PERFORM cron.alter_job(
    job_id := supplier_job.jobid,
    schedule := target_schedule,
    command := regexp_replace(supplier_job.command, ';\s*$', chr(10) || madrid_gate || ';' || chr(10))
  );
END
$economy$;
