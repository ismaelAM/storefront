# Transactional email activation

Implementation and activation runbook, 2026-10-26. Observations below describe
the investigation before activation; verify live runtime status after deployment.
The owned SQL setup and private signing-secret preparation were subsequently
applied. Actual delivery is enabled only after the coordinated deployment.

## Existing delivery owner

`src/app/api/webhooks/spree/route.ts` already handles these exact events:

- `order.completed`
- `order.canceled`
- `order.shipped`
- `customer.password_reset_requested`

The handlers render the existing React templates and call
`src/lib/emails/send.ts`. Gmail OAuth and Resend HTTPS transports already exist.
The signed endpoint waits for the handler before responding; failed transport
calls result in HTTP 500. Gmail OAuth should be reused, not authorized again.

Keep `action_mailer.perform_deliveries = false` and the store's
`preferred_send_consumer_transactional_emails = false`. They disable native
Rails consumer mail, not outbound webhooks or the frontend transport. Enabling
native mail as well would introduce a second delivery owner. Native admin
password-reset/invitation mail is a separate task and is not provided by this
frontend event list.

## Observed blockers

The owned database (`dtrospakebdiqihhcrub`, schema `spree`) has store ID 4,
code `bisontcg`, with native consumer mail disabled. It has **no outbound
webhook endpoints and no webhook deliveries**. Endpoint registration is the
missing connection to the existing frontend handler.

Production storefront environment metadata contains `EMAIL_PROVIDER`,
`GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, and `GMAIL_REFRESH_TOKEN`.
`EMAIL_FROM`, `SPREE_WEBHOOK_SECRET`, and `NEXT_PUBLIC_SITE_URL` are present for
Production and Preview; `RESEND_API_KEY` is also present for both. These are
metadata checks only: they do not verify secret values, OAuth refresh validity,
sender identity, or deployment-time configuration. The shared
`SPREE_WEBHOOK_SECRET` environment ID is `p3Kyr8MWtTjcee16`.

Backend Vercel environment access returns 404 through the available connector.
No browser/login fallback was used. Runtime `Spree::Api::Config.webhooks_enabled`
therefore remains unverified; its upstream default is true.

At approximately 15:03 UTC, all 2,298 unfinished event subscriber jobs were for
`Spree::WebhookEventSubscriber` and product/variant/price/stock-item
created/updated events. No historical order/password-reset event, mailer job, or
webhook delivery job was present in that snapshot. Other queues contain a large
media/catalog backlog. Re-run `operations/email-readiness.sql` immediately before
activation; these counts change while supplier synchronization runs.

## Minimal activation sequence

Prepared operation: `operations/email-activate.sh` runs the guarded Rails runner
`email-activate.rb`, which loads `target.rb`, silences SQL logging, reads exactly
one secret named `spree_storefront_webhook_secret_20261026` from private Vault,
requires the sole store to be `bisontcg`, and verifies native Rails mail and
native consumer mail remain disabled. It refuses a first enable when historical
transactional event jobs are pending. It makes the signed `webhook.test` probe
before creating/enabling its single named endpoint and leaves other endpoints
unchanged. Duplicate ownership/destination is rejected. This is a prepared
operation; it has not been run remotely.

Before running it, privately create the shared Vault secret, apply the same
value to the frontend's `SPREE_WEBHOOK_SECRET`, and complete the coordinated
frontend deployment. The existing Gmail OAuth credentials are unchanged. The
script never prints the Vault secret and never creates a customer email event.

1. Confirm the Production frontend is using its configured Gmail transport and
   the sender is the already-authorized Gmail account. No alias is required.
2. Register exactly one endpoint for store 4 at
   `https://www.bisontcg.com/api/webhooks/spree` with only the four exact event
   names above. Never subscribe this consumer to `*` or `order.*`.
3. Keep endpoint and frontend signing secrets identical. The native Admin API
   generates and returns a secret only on creation; it does not accept an
   existing secret in create/update parameters. Either privately transfer the
   newly generated secret to the frontend environment, or use a reviewed Rails
   model operation that supplies the existing frontend secret. Rails may encrypt
   `secret_key` at rest: do not insert plaintext with SQL or read ciphertext as
   though it were the usable signing secret.
4. Provide processing for **both** `spree_events` (subscriber creates delivery)
   and `spree_webhooks` (HTTP delivery). Worker count zero means emails remain
   queued even after endpoint registration. The ordinary worker includes a
   catch-all and would also drain the media/catalog backlog. Do not reactivate
   it solely to enable mail. Review a restricted worker configuration or a
   bounded, authenticated, scheduled processor using native Solid Queue
   claiming/execution. A durable DB queue does not execute itself; a scheduled
   processor requires new wiring and latency/retry validation. Do not use
   in-Puma worker activation or arbitrary `ActiveJob.execute` on database rows.
   Verified Solid Queue 1.5.0 CLI offers `start` and `check`, with a separate
   config file and `skip_recurring` option, but no built-in run-once/bounded
   drain command. A restricted `start` remains a daemon until stopped.
5. Re-run the readiness query before queue processing and reject unexpected
   historical email events. Do not delete/drain existing queues as part of mail
   activation. Exact endpoint subscriptions ignore the observed catalog events.
6. Verify a `webhook.test` delivery reaches the signed endpoint and reports HTTP
   200; it is intentionally unhandled by email handlers and sends no message.
   This verifies transport/signing only. Any actual customer-email test requires
   a separately authorized recipient and should not be confused with this ping.

No new backend build is needed merely to create an endpoint through an already
authorized native Admin API. Backend queue execution changes do require a
reviewed runtime/deployment change; group them with the next planned backend
build. A newly generated frontend signing-secret environment value applies to
the next deployment, so coordinate endpoint activation with that deployment.

`config/queue-mail.yml` and `operations/email-worker.sh` prepare a separate
worker that consumes **only** `spree_events` and `spree_webhooks`, one job at a
time, using native Solid Queue `--mode async --skip-recurring --config-file`.
No daemon instance or deployment configuration is enabled by these files.
The dispatcher still dispatches scheduled jobs, but this worker never executes
media, native mailers, payments, or a catch-all queue. Restricting queues does not
remove the current catalog subscriber backlog from `spree_events`; its exact
endpoint subscriptions prevent those events from generating customer mail.

Do not assume this daemon is free while idle: Vercel daemon memory options
start at **1 GiB**, and a continuously running service incurs memory cost.
The observed historical 1 GiB cost was about $0.34 for 12 hours (about $20/month
at that rate, an estimate rather than a current price guarantee). Keep the
daemon at zero until its cost and delivery latency have been explicitly chosen.
The prepared conditional HTTP processor below avoids starting this additional
daemon. Keep the daemon at zero when using HTTP processing; an ordinary worker
would bypass this processor's explicit delivery-attempt accounting.

## Conditional HTTP processing

`email-http-drain.rb` and `email-http-initializer.rb` add two fixed POST routes:

- `/internal/bison-email/activate` runs the guarded activation operation and
  signing-only probe; it accepts no caller configuration.
- `/internal/bison-email/drain` processes at most **one native job** per request.
  A subscriber job creates the durable delivery; a later tick sends it. Expect
  approximately two cron intervals for a new email, plus cold-start/network time.

Both require exactly `{}` and a Bearer derived as
`HMAC-SHA256(secret, "bison-email-http-v1")`, checked with constant-time digest
comparison. The signing secret remains in private Vault; it is not transmitted
as the HTTP credential. The routes validate `target.rb` and the exact owned
project, suppress private SQL/ActiveJob logs using thread-local logger silence,
and return no customer, token, payload or job details.

The drain selects only the exact four transactional event names for this store
and jobs created since this endpoint's activation. It also selects native
delivery jobs only for this exact owned endpoint and those events. It uses
Solid Queue's atomic `ReadyExecution.claim`, `ClaimedExecution#perform`, and
native finalization. It never invokes arbitrary jobs supplied by a caller.
A session advisory lock prevents concurrent drains. Due native scheduled retries
are dispatched only for eligible jobs. Its own `Worker` process record is
deregistered after each request; after ten minutes, only stale process records
with this processor's unique name prefix are deregistered to release native
claims. Other workers/processes/catalog/media jobs are untouched.

`email-http-setup.sql` enables the required `pg_cron`/`pg_net` extensions, creates
the private `bison_email_delivery_attempts` ledger and partial indexes, and
defines `spree.bison_email_work_pending()`. The predicate detects eligible ready
jobs, due scheduled jobs, stale owned leases, or due order-email retries.
`email-http-cron.sql` schedules one check per minute and makes **no HTTP request
when that predicate is false**. It uses the current known stable backend URL;
verify that hostname before applying. Apply these files only to the owned
project. They have not been executed by this implementation task.

The HTTP processor counts attempts durably before executing delivery jobs and
caps them at three. Ordinary failed order deliveries are requeued using the same
native delivery ID after 2/4 minutes; no new event or recipient is constructed.
A lost process can consume an attempt without sending, which favors a strict
cap over unlimited replay. The original reset job may retry while it retains
its native credential argument; failed persisted reset records are not rebuilt
or retried without their redacted credentials. The customer requests a fresh
reset instead.

The processor refuses to start a job after spending 25 seconds on setup; native
HTTP uses its existing 30-second open/read timeouts. This bounds jobs per request
and targets an approximately 90-second request budget, not a hard Ruby process
deadline. The cron HTTP timeout is 95 seconds. Native receiver-side duplicate
protection remains memory-only, so an ambiguous send/response failure may still
duplicate an email within the attempt cap.

The same bounded processor also executes only native
`Spree::Payments::HandleWebhookJob` records for the active, exactly named owned
Stripe gateway and its own payment-session IDs, with native captured/authorized/
failed actions. It dispatches due native scheduled retries and prioritizes the
payment webhook queue. Other payment jobs remain outside its scope. The SQL
pending predicate includes these exact jobs, so they cannot be acknowledged by
Stripe and left unprocessed merely because all permanent workers remain off.

Local verification: the Node shell-boundary test passes and both shell scripts
pass `sh -n`. `email-activation.test.rb` supplies eight dependency-free behavior
scenarios with fake HTTP/model boundaries; this environment has no Ruby runtime,
so its execution and Ruby syntax checks must run in the pinned backend build.
Neither fake-boundary tests nor the signing-only probe verifies Gmail delivery.
`email-http-drain.test.rb` covers one-job execution, retry refusal, native error
cleanup, busy/time-budget stops, derived authentication, and activation dispatch
without contacting live boundaries. The SQL pending predicate was executed
read-only against the actual owned native schemas with an empty ledger CTE and
returned false; the migration, Ruby runtime, real claim/ack, and pg_net/cron
integration still require deployment verification.

## Native Admin API and least privilege

The verified Spree v5.6.1 route is `/api/v3/admin/webhook_endpoints` (CRUD), with
`POST /:id/send_test`, `PATCH /:id/enable`, and `PATCH /:id/disable` actions.
Request bodies use top-level `name`, `url`, `active`, `subscriptions` fields.
Read operations require `read_webhooks`; writes require `write_webhooks`
(`write_webhooks` includes reads). Existing supplier integration scopes
`write_products`, `write_stock`, `write_categories`, `write_settings` do **not**
permit endpoint CRUD. API-key scopes are immutable in the native model. Use an
existing authorized admin session or a separately issued narrowly scoped key;
do not broaden the supplier key in SQL.

Delivery inspection is nested under `/api/v3/admin/webhook_endpoints/:id/deliveries`.
`POST /:delivery_id/redeliver` queues a new delivery; it does not execute it.

## Retry and duplicate-delivery limitations

Spree deduplicates delivery creation by event ID + endpoint ID. Frontend handler
idempotency currently uses only an in-memory `Set`, so it does not protect
against concurrent functions or cold-start retries. A delivery accepted by Gmail
followed by an interrupted HTTP response can therefore send twice on replay.
A durable recipient-side record/claim is needed before promising reliable
automatic deduplication; Gmail's transport has no supplied idempotency key here.

In verified v5.6.1 source, `DeliverWebhook` catches timeouts/connection errors and
records unsuccessful HTTP responses without raising. Consequently the job's
`retry_on StandardError` does **not** automatically retry ordinary HTTP 500 or
network failures. The prepared HTTP processor supplies explicit bounded retry
handling for order deliveries. Do not describe native job retries as proof that failed
email transport is retried. Password-reset credentials are redacted from
delivery records; manual redelivery cannot recreate a lost reset token, so the
customer must request a fresh reset after a lost credential-bearing job.

## Verified upstream references

- [WebhookEndpoint](https://github.com/spree/spree/blob/v5.6.1/spree/core/app/models/spree/webhook_endpoint.rb)
- [WebhookEventSubscriber](https://github.com/spree/spree/blob/v5.6.1/spree/api/app/subscribers/spree/webhook_event_subscriber.rb)
- [WebhookDeliveryJob](https://github.com/spree/spree/blob/v5.6.1/spree/api/app/jobs/spree/webhook_delivery_job.rb)
- [DeliverWebhook](https://github.com/spree/spree/blob/v5.6.1/spree/api/app/services/spree/webhooks/deliver_webhook.rb)
- [WebhookDelivery](https://github.com/spree/spree/blob/v5.6.1/spree/core/app/models/spree/webhook_delivery.rb)
- [Admin endpoint controller](https://github.com/spree/spree/blob/v5.6.1/spree/api/app/controllers/spree/api/v3/admin/webhook_endpoints_controller.rb)
- [Scoped authorization](https://github.com/spree/spree/blob/v5.6.1/spree/api/app/controllers/concerns/spree/api/v3/scoped_authorization.rb)
- [ApiKey scopes](https://github.com/spree/spree/blob/v5.6.1/spree/core/app/models/spree/api_key.rb)
- [Solid Queue 1.5.0 CLI](https://github.com/rails/solid_queue/blob/v1.5.0/lib/solid_queue/cli.rb)
- [Solid Queue ReadyExecution](https://github.com/rails/solid_queue/blob/v1.5.0/app/models/solid_queue/ready_execution.rb)
- [Solid Queue ClaimedExecution](https://github.com/rails/solid_queue/blob/v1.5.0/app/models/solid_queue/claimed_execution.rb)
- [Solid Queue process executor cleanup](https://github.com/rails/solid_queue/blob/v1.5.0/app/models/solid_queue/process/executor.rb)
- [Supabase pg_net](https://supabase.com/docs/guides/database/extensions/pg_net)

The pinned backend image identifies Spree 5.6.1. Upstream tag source was read
to establish the contracts above; the unavailable backend connector prevented
an independent runtime-code comparison. Recheck the deployed route/model before
using a live administrative write.
