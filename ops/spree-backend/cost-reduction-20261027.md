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
- [ ] Review, commit directly to main, deploy only the Supabase worker with its
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
