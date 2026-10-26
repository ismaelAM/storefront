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


## Live catalog continuation — 26 October

This supersedes the paused/access-blocked state above.

- Replacement scoped integration key was issued by the official model, privately
  handed off through Vault, and authenticated. All 4,894 safe category memberships
  now exist; all 2,315 initially active products are categorized. The 105 unclassified
  products and held ambiguous family remain excluded from guessed classification.
- Vercel catalog_recovery and worker daemons are scaled to zero. Spend Management
  is $1 on-demand with Pause On, after included credit. Auto Git deployment remains
  disabled for main. No Vercel deployment exists for 27a49f2. Requests still incur usage.
- Old daily offer state was cleared under paused/checkpoint guards and rebuilt through
  the native API. Missing category margins were populated through existing setup rules.
- devir-sync v136 is ACTIVE, main commit 27a49f28f6898289ed450c1df66798725b70065d.
  Native aggregate preorder status now maintains the legacy home membership for any
  supplier, preserving mixed variants and unrelated tags, removing ineligible membership.
  912 tests /93 files and TypeScript passed. No frontend build was needed.
- Source enabled=true; existing devir-cloud-sync-tick active every five minutes.
  Both supplier lanes have successful live ticks. 72 old inventory-pagination error
  jobs were requeued in the same active cycle; 8 unrecognizable SKU jobs remain errors.
- Bounded preorder batch: 21 requests succeeded, four Supabase BOOT_ERROR responses.
  Avoid 25 concurrent function cold starts again. Two later requests succeeded;
  offset-based repair is unstable while selection changes. Prefer durable variant IDs
  for future targeted repair; normal ingestion already locks canonical identity.
- Last source snapshot: 14 fresh Devir available, 4 TcgFactory available, 43 TcgFactory
  preorders. These are supplier states, not a claim every one is public or reviewed.
  Last destination snapshot: 38 active preorder variants, 37 home memberships, eight
  primary images, 59 backorderable stock items. Physical stock remains zero.
- Native daily rotation request49695 activated pl_VqXmZF31wY with five real offers.
  Browser confirms five offer cards and four valid upcoming cards. Shanks detail
  explicitly shows Disponible, Preparación: 2–3 días laborables, Agregar al carrito.
- Remaining: full supplier freshness recovery, images for newly published preorders,
  complete offer quotas as qualifying stock becomes fresh, inventory/runtime efficiency.
  Current crawl has historic TcgFactory failures; do not close it as complete.
  Markets, shipping, payments and checkout are still unfinished.


## Availability recovery throughput

User correctly reports that most category cards still show sold out. The previous
public checks established selected products, not full inventory recovery. Supplier
snapshots remain largely stale; do not claim stock recovery from a few successful
items or change UI labels for unpurchasable variants.

The private metadata writer performed an HTTP request per changed field before
inventory reconciliation, consuming the 95-second budget. Owned Spree natively
supports partial inline custom_fields updates validated by definition, preserving
unmentioned fields. The owned-host path now groups these values in one PATCH;
the legacy endpoint path remains for other hosts. Regression exhausted a two-write
budget before the fix, then 915 tests/94 files and TypeScript passed.


Bounded Devir concurrency now matches TcgFactory's maximum of three. Each job
retains its durable acknowledgement and canonical product lock. Groups use
allSettled: a rejected claim/checkpoint waits for siblings before propagating to
the worker lock owner. An independent review caught this early-release issue;
the new claim-failure regression failed before the fix, then passed.

The first General page was checked through the Store API: 11 of 12 cards were
unpurchasable, confirming the user's report. Fauna's old source said unavailable;
Robin Hood and Sound Box were old done jobs, while others remained pending.
466 completed jobs with stale Devir offers were backed up privately in
migration_checkpoint_20261015.requeued_devir_jobs_20261026 and requeued in the
same active cycle. No supplier dates or stock were invented. Batch size is20,
with the unchanged95s external-work budget. The first metadata-only optimized
Devir tick processed7 (previously2–4); measure concurrency version separately.
