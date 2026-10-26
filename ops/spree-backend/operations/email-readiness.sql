-- Read only. Run against the owned backend database, never the source database.
-- No customer payloads, recipients, tokens, endpoint secrets or job arguments
-- are returned. Job JSON is used only to group the event name/subscriber class.
SELECT jsonb_build_object(
  'stores', (
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'id', id, 'code', code,
      'native_consumer_email_disabled',
        preferences LIKE '%:send_consumer_transactional_emails: false%'
    )), '[]'::jsonb)
    FROM spree.spree_stores WHERE deleted_at IS NULL
  ),
  'endpoints', (
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'id', id, 'store_id', store_id, 'url', url, 'active', active,
      'subscriptions', subscriptions, 'disabled_at', disabled_at,
      'has_secret', secret_key IS NOT NULL AND length(secret_key) > 0
    )), '[]'::jsonb)
    FROM spree.spree_webhook_endpoints WHERE deleted_at IS NULL
  ),
  'deliveries', (
    SELECT coalesce(jsonb_agg(grouped), '[]'::jsonb)
    FROM (
      SELECT event_name, success, count(*) AS count,
        min(created_at) AS oldest_at, max(created_at) AS newest_at
      FROM spree.spree_webhook_deliveries GROUP BY event_name, success
    ) grouped
  ),
  'unfinished_jobs', (
    SELECT coalesce(jsonb_agg(grouped), '[]'::jsonb)
    FROM (
      SELECT queue_name, class_name, count(*) AS count,
        min(created_at) AS oldest_at, max(created_at) AS newest_at
      FROM spree.solid_queue_jobs WHERE finished_at IS NULL
      GROUP BY queue_name, class_name
    ) grouped
  ),
  'unfinished_subscriber_events', (
    SELECT coalesce(jsonb_agg(grouped), '[]'::jsonb)
    FROM (
      SELECT arguments::jsonb->'arguments'->>0 AS subscriber_class,
        arguments::jsonb->'arguments'->1->>'name' AS event_name,
        count(*) AS count, min(created_at) AS oldest_at,
        max(created_at) AS newest_at
      FROM spree.solid_queue_jobs
      WHERE finished_at IS NULL AND class_name = 'Spree::Events::SubscriberJob'
      GROUP BY 1, 2
    ) grouped
  )
) AS email_readiness;
