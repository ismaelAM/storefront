-- Run only in source project ikglqbjlbkbaronbiryl. Keep the existing private
-- command, credentials and checkpoints; reduce scheduled supplier work 48→24/day.
DO $economy$
DECLARE
  supplier_job record;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.devir_sync_config
    WHERE id='primary' AND spree_api_url='https://project-7ck7q.vercel.app'
  ) THEN
    RAISE EXCEPTION 'Unexpected supplier/backend configuration';
  END IF;
  SELECT * INTO STRICT supplier_job FROM cron.job
    WHERE jobname='devir-cloud-sync-tick';
  IF NOT supplier_job.active
    OR supplier_job.schedule NOT IN ('*/30 * * * *', '0 * * * *')
    OR position('net.http_post' IN supplier_job.command)=0
  THEN
    RAISE EXCEPTION 'Unexpected supplier cron; inspect before changing it';
  END IF;
  PERFORM cron.alter_job(job_id:=supplier_job.jobid, schedule:='0 * * * *');
END
$economy$;
