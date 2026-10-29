-- Owned dtrospakebdiqihhcrub ONLY. Explicit migration, never a startup action.
-- Private attempt accounting prevents native HTTP error retries from becoming
-- unbounded even if old Solid Queue job rows are cleaned up.
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net;
CREATE TABLE IF NOT EXISTS spree.bison_email_delivery_attempts (
  delivery_id bigint PRIMARY KEY REFERENCES spree.spree_webhook_deliveries(id) ON DELETE CASCADE,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 3),
  last_attempt_at timestamptz,
  next_attempt_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE spree.bison_email_delivery_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON spree.bison_email_delivery_attempts FROM PUBLIC, anon, authenticated;
CREATE INDEX IF NOT EXISTS bison_email_events_pending_idx ON spree.solid_queue_jobs
  ((arguments::jsonb->'arguments'->1->>'name'), created_at)
  WHERE finished_at IS NULL AND class_name='Spree::Events::SubscriberJob'
    AND queue_name='spree_events'
    AND arguments::jsonb->'arguments'->>0='Spree::WebhookEventSubscriber';
CREATE INDEX IF NOT EXISTS bison_email_webhooks_pending_idx ON spree.solid_queue_jobs
  ((arguments::jsonb->'arguments'->>0))
  WHERE finished_at IS NULL AND class_name='Spree::WebhookDeliveryJob'
    AND queue_name='spree_webhooks';
CREATE INDEX IF NOT EXISTS bison_payment_webhooks_pending_idx ON spree.solid_queue_jobs
  ((arguments::jsonb->'arguments'->0->>'payment_method_id'))
  WHERE finished_at IS NULL AND class_name='Spree::Payments::HandleWebhookJob';

CREATE OR REPLACE FUNCTION spree.bison_email_work_pending()
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = spree, pg_catalog
AS $function$
  WITH endpoint AS (
    SELECT e.id,e.store_id,e.created_at
    FROM spree_webhook_endpoints e JOIN spree_stores s ON s.id=e.store_id
    WHERE s.code='bisontcg' AND s.deleted_at IS NULL AND e.deleted_at IS NULL
      AND e.name='BisonTCG storefront transactional email'
      AND e.url='https://www.bisontcg.com/api/webhooks/spree'
      AND e.active AND e.disabled_at IS NULL
      AND e.subscriptions @> '["order.completed","order.canceled","order.shipped","customer.password_reset_requested"]'::jsonb
      AND jsonb_array_length(e.subscriptions)=4
  ), eligible_jobs AS (
    -- Keep each job class in an independent branch so PostgreSQL can use the
    -- partial indexes above. A correlated OR scans every unfinished job,
    -- including unrelated catalog/media work, on every minute of the cron.
    SELECT j.id FROM solid_queue_jobs j
    JOIN endpoint e ON
        j.arguments::jsonb->'arguments'->1->>'store_id'=e.store_id::text
        AND j.created_at>=e.created_at
    WHERE j.finished_at IS NULL
        AND j.queue_name='spree_events' AND j.class_name='Spree::Events::SubscriberJob'
        AND j.arguments::jsonb->'arguments'->>0='Spree::WebhookEventSubscriber'
        AND j.arguments::jsonb->'arguments'->1->>'name' IN
          ('order.completed','order.canceled','order.shipped','customer.password_reset_requested')

    UNION ALL
    SELECT j.id FROM solid_queue_jobs j
    WHERE j.finished_at IS NULL
        AND j.queue_name='spree_webhooks' AND j.class_name='Spree::WebhookDeliveryJob'
        AND EXISTS (SELECT 1 FROM endpoint e
          JOIN spree_webhook_deliveries d ON d.webhook_endpoint_id=e.id
          WHERE d.created_at>=e.created_at
            AND d.event_name IN ('order.completed','order.canceled','order.shipped','customer.password_reset_requested')
            AND j.arguments::jsonb->'arguments'->>0=d.id::text)

    UNION ALL
    SELECT j.id FROM solid_queue_jobs j
    WHERE j.finished_at IS NULL
        AND j.class_name='Spree::Payments::HandleWebhookJob'
        AND j.arguments::jsonb->'arguments'->0->>'action' IN ('captured','authorized','failed')
        AND EXISTS (SELECT 1 FROM spree_payment_sessions ps
          JOIN spree_payment_methods pm ON pm.id=ps.payment_method_id
          WHERE pm.store_id IN (SELECT id FROM spree_stores WHERE code='bisontcg' AND deleted_at IS NULL)
            AND pm.type='SpreeStripe::Gateway' AND pm.name='Stripe BisonTCG'
            AND pm.active AND pm.deleted_at IS NULL
            AND ps.id::text=j.arguments::jsonb->'arguments'->0->>'payment_session_id'
            AND pm.id::text=j.arguments::jsonb->'arguments'->0->>'payment_method_id'
            AND j.created_at>=pm.created_at)
  )
  SELECT EXISTS (SELECT 1 FROM solid_queue_ready_executions r JOIN eligible_jobs j ON j.id=r.job_id)
    OR EXISTS (SELECT 1 FROM solid_queue_scheduled_executions s JOIN eligible_jobs j ON j.id=s.job_id WHERE s.scheduled_at<=CURRENT_TIMESTAMP)
    OR EXISTS (SELECT 1 FROM solid_queue_processes p WHERE p.kind='Worker'
      AND p.name LIKE 'bisontcg-email-http-%' AND p.last_heartbeat_at<CURRENT_TIMESTAMP-INTERVAL '10 minutes')
    OR EXISTS (SELECT 1 FROM spree_webhook_deliveries d
      JOIN endpoint e ON e.id=d.webhook_endpoint_id
      JOIN bison_email_delivery_attempts a ON a.delivery_id=d.id
      WHERE d.success=false AND d.created_at>=e.created_at
        AND d.event_name IN ('order.completed','order.canceled','order.shipped')
        AND a.attempts<3 AND a.next_attempt_at<=CURRENT_TIMESTAMP
        AND d.delivered_at>=a.last_attempt_at
        AND NOT EXISTS (SELECT 1 FROM solid_queue_jobs j WHERE j.finished_at IS NULL
          AND j.class_name='Spree::WebhookDeliveryJob' AND j.queue_name='spree_webhooks'
          AND j.arguments::jsonb->'arguments'->>0=d.id::text));
$function$;
REVOKE ALL ON FUNCTION spree.bison_email_work_pending() FROM PUBLIC, anon, authenticated;
