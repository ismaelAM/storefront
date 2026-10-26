-- Explicit activation only AFTER SQL setup, backend deployment, frontend
-- signing probe and owned endpoint activation. Does not start a Vercel daemon.
-- Verify the stable backend hostname before applying. pg_cron and pg_net must
-- already be installed in this owned project. Vault plaintext is never emitted.
SELECT cron.schedule('bison-transactional-mail-tick', '* * * * *', $cron$
  SELECT net.http_post(
    url := 'https://project-7ck7q.vercel.app/internal/bison-email/drain',
    headers := jsonb_build_object('Content-Type','application/json','Authorization',
      'Bearer ' || (SELECT encode(extensions.hmac('bison-email-http-v1', decrypted_secret, 'sha256'), 'hex')
        FROM vault.decrypted_secrets WHERE name='spree_storefront_webhook_secret_20261026')),
    body := '{}'::jsonb,
    timeout_milliseconds := 95000
  ) WHERE spree.bison_email_work_pending();
$cron$);
