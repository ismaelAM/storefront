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

## Continuation on 26 October

- Owner explicitly requests continuing directly on main and minimizing Vercel
  publications. Automatic Git deployments on main are disabled in both Vercel
  configs; release a reviewed, grouped deployment explicitly when needed.
- Authenticated owned Admin API returned HTTP 200 and 5,000 products. All
  10,013 destination mappings were loaded into a private, RLS-enabled table
  `migration_checkpoint_20261015.owned_backend_map_20261026`, with API roles
  denied access. The original checkpoints remain unchanged.
- The guarded cutover passed a rollback rehearsal, then committed. Source
  config now targets `https://project-7ck7q.vercel.app`; all 5,000 products and
  5,013 mapped variants reconcile, the two ambiguous variant references are
  cleared and backend identity holds remain, and all 26 physical-only policies
  are preserved. Cron was not enabled.
- Native bulk category API assigned 36 One Piece products and 12 accessory
  products. The remaining exact-category batches are prepared. The 105 products
  without canonical taxonomy remain unclassified rather than guessed.
- One authenticated TcgFactory batch refreshed 18 offers and recovered 18
  preorder variants. Physical on-hand quantities remain zero. Its historical
  crawl still contains 997 failures; no partial run was marked complete.
- A local transport diagnostic accidentally printed the scoped integration
  credential when truncated stdin caused a JSON parse failure. The credential
  was immediately revoked in owned Spree, its in-memory copy cleared, and the
  supplier pipeline paused. No active supplier secret key remains. The helper
  now reads batches from a private file, accepts only the short credential
  input and handles parse failures without printing input.
- Replacement requires access to Vercel project `bisontcg-spree`, currently
  denied by the connector (404 project; 403 logs). Team consent was requested.
  Before rerunning RecoveryAccess, remove only the revoked credential's named
  Vault handoff in the owned backend; then issue the replacement through the
  official model and transfer it privately to the source Vault/config.
- Daily rotation was reproduced exhausting its budget on expired supplier
  rows before reaching fresh candidates. It now discards known-ineligible
  supplier-only candidates before the inspection cap and remote API calls;
  owned physical stock and final live verification retain their behavior.
  The regression failed before the fix, then all 24 focused tests passed.
- Remaining: replacement key; remaining category memberships; clear/rebuild old
  daily-offer backend references under guard; refresh both suppliers; restore
  verified cron; publish actual offers and verify upcoming products. Markets,
  shipping, payments and checkout remain a separate unfinished commerce phase.
