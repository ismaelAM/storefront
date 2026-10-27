# Supabase worker traffic reduction — 27 October 2026

The owner requests further Vercel savings while keeping the shop operational,
preferring existing free Supabase capacity. Direct main commits and minimum
Vercel deployments remain authorized.

The supplier worker already executes on Supabase. The next bounded change
reduces its native Spree traffic: an existing product currently reads the same
private custom fields three times during one reconciliation, plus a possible
fourth read for review adoption. Its private sourcing document is also rewritten
solely because refresh/selection timestamps changed. Supabase already stores
every supplier observation and the selection history independently.

Use one product-scoped field snapshot per reconciliation and pass it to review,
pricing metadata and provenance. Skip the provenance write only when all
commercial values and all other variant entries are unchanged; ignore exactly
`selectedSupplier.selectedAt` and each offer's `lastSeenAt` for that comparison.
Fresh supplier observations remain in Supabase. Meaningful changes still go
through the native Admin API; stock, prices, review decisions, availability
expiry and payment/email processing retain their current checks.

Alternatives considered: lower the cron cadence further (would slow the pending
migration), or migrate the Rails backend itself (requires a separate rewrite;
Supabase Edge Functions do not run this Ruby container). The scoped worker change
needs only one Supabase function deployment and no Vercel build.

Plan:

- [x] Reproduce redundant reads and timestamp-only writes with production-code tests.
- [x] Reuse the scoped field snapshot and compare provenance without volatile dates.
- [x] Verify meaningful changes, other variants, manual fields, failure/retry and
      unchanged native stock/price safeguards; run the full test suite and TypeScript.
- [x] Review, commit directly to main, deploy only the Supabase worker with its
      existing dependency bundle/authentication, and verify a bounded real tick.

Do not describe request savings as measured invoice savings. Supabase Free has
limits; the owned database currently measures 233 MB. The fixed Vercel Pro
subscription is independent of reductions in usage.

Validation before publication: the new regressions failed in the expected three
ways before the change and all nine passed after it. The full suite passed:
938 tests in 98 files; TypeScript and diff whitespace checks passed. Independent
review found no blocker. The upload was checked against the active v140 bundle:
all nine shared dependencies are unchanged and the patched entrypoint matches
the tested local file. Authentication remains unchanged.

Published implementation: main commit `1912f0ee2a756d28b144523dd924f60e56161b40`.
Supabase `devir-sync` v141 is ACTIVE; readback matched all ten uploaded files
exactly, with existing authentication retained. No Vercel deployment was created.
One authenticated, bounded supplier reconciliation returned HTTP 200,
`reconciled: 1`, `failed: 0`, without a timeout. The sampled variant already had
a native mapping and a currently eligible supplier observation.

The 3-to-1 result applies to metadata reads within the tested existing-product
reconciliation. It is not a measured 67% reduction of total Vercel usage. The
supplier cadence remained every 30 minutes during this first pass, so catalogue
progress and availability expiry were not delayed by that optimization.

Post-check: physical inventory remains one nonzero row with exactly six Tarkir
units; native payments remain zero. Conditional mail work is false and its cron
stays active. The catalogue is still progressing: 466 product jobs done, 559
pending and 20 held errors, with phase products and no config error or lock.

## Further economy pass

The owner prioritizes a lower ongoing bill. The source supplier cron was changed
from every 30 minutes to hourly using `operations/supplier-economy-cadence.sql`.
Readback confirmed `0 * * * *`, active. This halves scheduled supplier activations
from 48 to 24 per day. It also slows catalogue discovery and supplier freshness;
supplier updates can take longer to reach the shop. Native checkout, physical
stock checks and the conditional minute-level payment/email processor retain
their own execution paths. No customer transaction waits for this crawl.

Avoid repeated native writes when a fresh authoritative response already contains
the desired values: existing product markers, variant costs/dimensions/flags,
base prices and the TcgFactory fulfillment confirmation. Numeric strings are
compared as finite decimal numbers; absent fields and malformed values force
the normal write. Review-to-draft confirmation remains mandatory. New zero-stock
initialization, changed prices, date changes, different variant identities and
native errors retain existing validation and retry behavior. Never cache or
replay physical stock quantities.

Implementation plan: reproduce redundant native writes in production-function
tests, add conservative comparisons, run tests/TypeScript, review and publish
only the Supabase worker. Verify one bounded native reconciliation plus stock,
cron and deployment readbacks. The hourly cadence is a deliberate cost/latency
tradeoff, not an invoice savings percentage. No Vercel rebuild is needed.

The no-op regressions first failed in four expected ways before implementation.
All 89 targeted checks passed after it, and TypeScript passed. The default full
suite initially passed 950/953 with five-second timeouts in MobileMenu,
PuckProductGrid and social/template; a low-concurrency attempt still timed out
in social/template and was interrupted. A complete resource-adjusted rerun
(`vitest run --maxWorkers=4 --testTimeout=20000`) passed all 953 tests in 99 files.
No repository timeout or unrelated application code was changed. Independent
review found no correctness blocker.
