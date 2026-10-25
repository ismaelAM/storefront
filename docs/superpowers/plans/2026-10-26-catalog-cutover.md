# Catalog recovery implementation plan

> Execute inline, continuing the approved Spree reconstruction. User explicitly
> authorizes the necessary activations and publication directly from main.

Goal: reconnect the existing supplier pipeline to owned Spree and recover the
missing public categories, images and daily offers without inventing stock.

Architecture: keep canonical supplier identity and the existing category,
pricing, image and daily-offer routines. Use one bounded recovery daemon for a
scoped Spree integration key and existing supplier image staging. Transfer the
key through private Supabase Vault, never logs or Git. Keep cron stopped until
IDs, credential and API contracts are reconciled.

Constraints: preserve manual prices, physical stock and all 26 physical_only
policies; retain unknown-language variants for review; no checkout/payment
configuration inferred from catalog recovery. One grouped main publication;
no previews or health polling.

1. Add regression coverage for published recovery media ownership, resumable
   progress, preserving existing images and secure/idempotent key handoff.
   Implement the bounded operation and validate locally before publication.
2. Verify destination mappings and the original checkpoint. Commit the grouped
   change to main. Start recovery once, authenticate the new scoped key, apply
   an independently guarded identity cutover including clearing the two unsafe
   old references, and invoke existing category/refresh/offer actions in bounded
   batches. Stop recovery after completion. Verify SQL and a bounded public flow.

Review focus: wrong store/channel, supplier 404 or interrupted object readback,
already recovered assets, duplicate integration keys on retry, old IDs colliding
with unrelated new records. Fail closed and retain private staging for retries.

## Execution record

- SQL confirms: 2,315 active products; 51 active products with primary image;
  zero categories; no secret integration key; both supplier feeds last seen
  15 October, zero fresh active offers. Cron and worker remain stopped.
- The 120 ready queue items are API-key usage tracking, not pending image import.
  Historical failures: 5 analyze, 16 transform, 1 recurring housekeeping.
- Main is still f937c3b, an ancestor of the migration branch. The user now
  explicitly authorizes integrating that branch into main after validation.
- The separate cutover DO statement ran successfully inside BEGIN/ROLLBACK on
  the actual source. After rollback the old URL and source hashes were intact;
  the fixture Vault entry was absent. This is not a live cutover.
- Independent review found that clearing references alone did not enforce a
  quarantine, and adding associations could hide manual legacy galleries. Both
  are fixed with behavioral Ruby regressions: the backend rejects writes to the
  held family, and media recovery preserves direct/manual galleries and removed
  associations while retrying explicitly pending uploads.
- The private hold marker uses update_columns after ownership/draft/availability
  guards because Spree Product validates its master; ordinary update! would
  reject installation of the hold itself. No commercial field is bypassed.
- The source contains zero product-only legacy references. Cutover now rejects
  that state rather than carrying an old parent ID across the backend switch.
- 904 frontend tests and TypeScript pass in this session. New Ruby ownership,
  credential retry, manual image preservation and identity-hold tests pass.
- Existing RAILS_HOST is configured in Production. Revealing it requested MFA;
  no verification code was requested or read, and its value was not accessed.
