# Daily offers repair implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement task-by-task.

**Goal:** Restore twelve current sellable daily offers and four matching social images.
**Architecture:** Existing Supabase supplier worker and native Spree remain authoritative; keep the 4×3 generator.
**Tech Stack:** TypeScript, Vitest, Supabase Edge Functions/Postgres, Spree 5.6.1, Next.js/sharp.
**Spec:** ../specs/2026-10-29-daily-offers-repair-design.md

## Global constraints

- Preserve manual/zero prices, physical quantities, reviews, margin floors and authenticated B2B validation.
- No new cron, no Devir reactivation, no posts or email. No automatic main merge.
- Work on fix/daily-offers based on the deployed retirement fixes; suppress Git previews in both Vercel configs.

## Review focus

- Null serializer amount must not become a manual free price; an explicit zero must stay zero.
- Missing cohort candidates must not freeze the day or overwrite valid discounts with an incomplete selection.
- A refresh error must advance safely without claiming availability and must not starve the crawl.
- Archived, stale, reviewed and manually priced products must not enter an image.
- Signed image redirects after migration must work without loosening the renderer's host/address checks.

### Task 1: Managed missing prices

Files: `_shared/catalog-publish-policy.ts`, `devir-sync/index.ts`, pricing/native-sync tests.
- [x] Add failing tests for null native price, explicit zero and manual override.
- [x] Repair null conversion and initialize only absent managed base prices. Checkpoint automatic price promptly.
- [x] Run focused tests and verify genuine existing manual prices remain protected.

### Task 2: Balanced authenticated freshness

Files: `_shared/daily-offer-selection.ts`, worker TCG refresh path and stock-flow tests.
- [x] Add failing tests for balanced priority, freshness/cost checks and bounded progress.
- [x] Select a bounded daily cohort using existing supplier offers and reuse authenticated ingestion.
- [x] Preserve general refresh/discovery cursor and allow partial daily state to retry.

### Task 3: Complete current rotations

Files: worker daily-offer functions, daily-offer/runtime tests.
- [x] Reproduce incomplete-day freeze and wasted native work for missing categories.
- [x] Preflight source candidates, inspect all native guards and activate only a complete automatic rotation.
- [x] Verify the twelve-pair contract, current date and expiry in tests; preserve pending activation replay.

### Task 4: Live verification and images

- [x] Run complete application tests, TypeScript and diff checks.
- [x] Back up source/native affected pricing and daily state privately; deploy the minimal worker with existing authentication.
- [ ] Refresh a bounded cohort, regenerate twelve, verify current native/public prices and inventory.
- [ ] Render and inspect four JPEGs; repair a proven image transport issue if necessary, using one grouped deployment.
- [ ] Record exact evidence, publish a reviewable PR and report Instagram connection separately.

## Live progress

- Source checkpoint is private in `supplier_retirement_20261028`; the native
  checkpoint contains 2,695 prices, 1,911 stock items and 5,054 products.
- Separate incident recovery is in PR #95. The native minute mail query was
  rewritten to use its indexes, its cron restored with a 5-second SQL timeout,
  and public Home/Magic pages verified with products. No Vercel rebuild.
- Worker v155 deployed with the reviewed repair; v156 adds one live regression:
  prefer recently observed supplier products over month-old dead URLs. The new
  test failed before the change and passes after it. Cooldown/fairness remain.
- Bounded authenticated refresh calls revealed several old supplier URLs now
  return 404. These attempts do not advance `last_seen_at` or invent availability.
- Normal rotation returns `waiting_supply` until all groups contain three valid
  products. A partial nine-product list is not treated as a completed rotation.
- Initial deployment verification: all ten deployed files matched the payload;
  v156 changes only the refresh planner's candidate order.
- Initial stock/price checkpoint comparison: zero physical quantity differences
  and zero existing base-price amount changes. Later authenticated refreshes
  updated managed automatic prices where current B2B costs require it; physical
  quantities still have zero differences.
- Native image probe returned a real WebP via the existing Rails proxy, HTTP 200;
  there is no evidence requiring a social-image allowlist change.
- Instagram credentials remain unconfigured; no publication or manual mail
  drain has been invoked.
- Final suite: 1,010/1,010 tests pass with two workers; TypeScript and diff checks
  pass. An earlier unrestricted run hit four 5-second timeouts in the existing
  shipping panel, mobile menu and two JPEG tests; all pass at bounded concurrency.
- The revised priority refreshed all three current accessory candidates in one
  call (3 processed, zero skipped/errors), replacing the repeated old-URL misses.
- Native readback found imported products without the managed tag: their first
  pass could record an automatic baseline without writing a price. Worker v157
  adopts canonical variants only for an absent price or a positive price equal
  to their known automatic baseline; unknown/changed manual prices and explicit
  zero stay protected. The regression failed then passed with these cases.
- Supplier packs requiring physical splitting no longer count toward a ready
  supplier cohort when an old canonical review flag is false. The real loader
  regression failed then passed. Native review/fulfillment guards are unchanged.
- Full final suite after these live findings: 1,016/1,016 pass; TypeScript clean.
- Existing authorized reconciliation repaired the remaining absent Funko price.
  A scoped native POST also created the absent Reality Fracture base price and
  native SQL verified the exact amount, currency and variant.
- Normal rotation validation is still pending complete public/native readback;
  do not describe today's twelve offers or the four JPEGs as verified yet.
