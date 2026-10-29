# Web recovery — 29 October 2026

The public storefront was returning Spree HTTP 500 errors, including Home and
the Magic category. The daily-offer repair had not been deployed: its source
worker was still v154 and its implementation remained in a separate worktree.

The native database's minute cron `bison-transactional-mail-tick` evaluated a
correlated OR over approximately 139,000 unfinished/background jobs. Its
eligible-jobs plan cost was 1,282,595; a direct function call exceeded an
8-second statement timeout. The partial indexes already existed but the
correlated OR prevented selective lookup. Repeated slow cron work coincided
with database connection timeouts and the backend failures. Backend runtime
logs were not available through the connector's existing project scope, so no
claim is made that this explains every backend startup failure.

## Applied recovery

- At 15:43 Madrid time, paused the mail cron, preserving all queued work.
- Split eligible jobs into independent event, delivery and payment branches.
  All store, endpoint, subscription, creation-time and retry restrictions remain.
  No additional index, stock change, price change or Vercel rebuild was needed.
- Applied native migration `index_transactional_mail_pending_query_20261029` to
  project `dtrospakebdiqihhcrub`, after verifying the original function digest and
  that the cron was paused. Lock timeout was 2 seconds, statement timeout 5 seconds.
- Reactivated the same cron and minute schedule, prefixing its command with a
  5-second SQL timeout. The HTTP request retains its separate 95-second timeout.
- Preserved the original function in the base commit and an exact local snapshot.
  The source project's private plan records the pause and original schedule.

## Verification

- Original function: cancelled at the 8-second timeout (before implementation).
- Rewritten query on real data: EXPLAIN ANALYZE execution 8.943 ms, plan cost 45.23.
- Installed function: 124.832 ms including function planning.
- First resumed scheduled run, 15:54 Madrid: success, 38 ms, zero outbound requests
  because no eligible mail was pending. Subsequent work is handled by the normal
  schedule; no manual mail-drain request was made.
- Public Magic category: HTTP 200, 12 product links, no error digest.
- Public Home after recovery: HTTP 200, 18 product links, no error digest.
- Frontend runtime error log lookup from 15:44 through 15:53: no errors returned.
- 24 PostgreSQL fixtures pass for orders, scheduling, isolation, deliveries,
  payments, stale workers and bounded retries. The fixture generator executes the
  actual query body with CTE data and never changes business tables or sends mail.
- Existing suite: 980/980 tests pass; TypeScript passes; diff check passes.
- Independent review approved equivalence and timeout behavior.

The branch suppresses automatic frontend/backend Vercel deployments. The native
database fix is already applied; merging source is for reproducibility. Do not
merge main automatically. The separate 12-offer repair still needs its own live
rollout and public image verification.

## Recheck / rollback

Generate fixtures with:

```sh
python ops/spree-backend/operations/email-http-pending-fixtures.py \
  | psql -v ON_ERROR_STOP=1 "$TEST_DATABASE_URL"
```

The generator returns a pass count and raises division-by-zero if any expected
result differs. It reads the production query from `email-http-setup.sql`.

For a suspected regression, pause only the named mail cron first, keeping queued
jobs intact. The original function is in commit `d68df9a` at
`ops/spree-backend/operations/email-http-setup.sql`; restore only its function
definition if required, without recreating tables or replaying the whole setup.
The previous cron command is in the same commit's `email-http-cron.sql`. Restoring
the slow query also restores the incident risk; leave its cron paused until an
alternative fix has been verified. Do not alter the separate supplier cron.
