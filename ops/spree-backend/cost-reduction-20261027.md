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
supplier cadence remains every 30 minutes, so catalogue progress and availability
expiry are not delayed by this optimization.

Post-check: physical inventory remains one nonzero row with exactly six Tarkir
units; native payments remain zero. Conditional mail work is false and its cron
stays active. The catalogue is still progressing: 466 product jobs done, 559
pending and 20 held errors, with phase products and no config error or lock.
