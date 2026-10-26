# Reduce idle maintenance cost

The owner requested minimum Vercel consumption while retaining the working
storefront, payments and transactional email. Changes go directly to main;
automatic Git deployments stay disabled.

Observed production evidence:

- About 63,000 backend invocations versus 357 storefront invocations over the
  last 12 hours. Backend logs are dominated by Admin stock-item requests.
- The owned database recorded 23,934 stock-item count/list calls. An actual
  filtered request for the six Spanish Tarkir boxes returned one row; an empty
  filtered lookup returned `data:[]`, `count:0`, `pages:1`, `next:null`.
- The reader treated confirmed absence as a failed predicate and tried an
  unsupported alternate predicate, then the complete stock listing. The latter
  currently has 1,309 rows / 14 pages. This multiplies both Rails work and native
  API-key bookkeeping jobs without learning anything new.

Implementation:

1. Accept a complete, explicitly confirmed empty first page only on the owned
   stable backend where prefixed-ID filtering was verified. Preserve existing
   identity checks, pagination and compatibility for ignored filters. Never
   replay or overwrite physical quantities.
2. Change the existing Supabase supplier/maintenance cron from every five
   minutes to every thirty minutes (288 to 48 scheduled invocations per day).
   Preserve the six-hour supplier-cycle setting and all checkpoints. Full
   catalogue completion is still pending; this slows background progress.
3. Keep both Vercel daemons at zero. Keep payment/email conditional processing
   at every minute: idle checks issue no Vercel request.

An entire backend migration, deleting deployments or disabling operational
error visibility would add risk and is unnecessary for this correction. No
frontend or backend Vercel build is required: only deploy the Supabase worker.

Verified:

- Regression failed before the fix (three requests instead of one). All 929
  tests and TypeScript pass after the fix; independent review found no blocker.
- Supabase `devir-sync` version 140 is active. All nine shared dependencies
  exactly match the previous deployed version; only the inventory reader changed.
- Cron `devir-cloud-sync-tick` is active at `*/30 * * * *`; the six-hour cycle
  configuration and saved work remain intact. The existing Devir cycle is in
  error, with recovery still pending; reducing cadence does not resolve that.
- An authenticated, bounded physical-only reconciliation returned HTTP 200:
  one product reconciled, zero failed. The full-store stock-query counter stayed
  at 24,175 throughout this production verification: no broad inventory scan.
- Physical inventory remains exactly six units in one nonzero stock row.
- Payment/email cron remains every minute, pending work is false, and recent
  idle runs succeeded with `0 rows`, without invoking Vercel.
- No Vercel rebuild or frontend code change was needed.

Billing is delayed up to an hour; measure savings after the changed workload
settles. The 83% reduction applies to scheduled maintenance activations, not
to an already measured percentage of total spend. Existing Pro fees remain.
