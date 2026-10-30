# Storefront stability and Spree consumption implementation plan

> **For agentic workers:** Use systematic-debugging and test-driven-development for each confirmed defect; independent domains are assigned through dispatching-parallel-agents.

**Goal:** Correct verified storefront defects and explain current Spree resource consumption using measured data.

**Architecture:** Preserve native Spree commerce, current supplier economy cadence and existing publication leases. Separate frontend error/identity handling from backend API-key usage bookkeeping; deployment and billing evidence must identify their project and time window.

**Tech stack:** Next.js 16, Spree 5.6.1, Postgres/Supabase, Vercel, Vitest and Ruby contract tests.

**Spec:** User request in this conversation: review the listed stability, retired-link, purchase/shipping, Instagram, Google and repository pending items, fix verified issues and analyse Spree consumption.

## Global constraints

- No automatic main merge; work in `fix/storefront-stability-consumption`.
- No keepalive, additional worker, duplicate scheduler or blind queue cleanup.
- No charge, real purchase, label, collection, outbound email or extra Instagram post during verification.
- Never print, commit or retrieve unrelated secrets. Saved Instagram credentials remain production-only.
- Reuse reviewed existing implementations; group checks and deployments per affected project.
- Distinguish recent measurements, historic accumulators, estimates, team costs and project costs.

## Review focus

- An upstream 500/401/403/network error must never be disguised as a missing product/category.
- A valid token for another Instagram account must be rejected before image creation or publication.
- Last-used timestamp bookkeeping must preserve authentication, store isolation, hourly cadence and monotonic timestamps under concurrency.
- An ambiguous Instagram publish attempt must retain its durable block and must not be retried automatically.
- Missing operational credentials or paid tests remain explicit verification gaps, not invented success claims.

## Task 1: Public catalog error handling

Files: public category page, wholesale product page, `src/lib/metadata/category.ts`, `src/app/[country]/[locale]/catalog-not-found.test.tsx`.

- [x] Compare production product-page source and reproduce catch-all failures in tests.
- [x] Preserve existing DTC 404/legacy handling; restrict category/wholesale missing responses to numeric upstream status404.
- [x] Verify normalized404 and rethrow500/401/403/network regressions; focused42 tests and TypeScript pass.
- [x] Review combined diff, suite and production response semantics.

## Task 2: Reuse Instagram connection guard from PR92

Files: `src/lib/social/connection.ts`, `instagram.ts`, `publication.ts`, `offers.ts`, existing private offers connection route/panel and corresponding tests.

- [x] Confirm production lacks the prepared identity check and no first real post is certified.
- [x] Demonstrate wrong-account publication and absent connection control in failing tests.
- [x] Apply the existing readonly identity check before publication, retain lease/checkpoint semantics and reuse shared caption hashtags.
- [x] Test missing config, account mismatch, API error sanitization, authenticated GET and no publishing side effects.

## Task 3: Bound native API-key usage bookkeeping

Files: proposed `ops/spree-backend/operations/api-key-usage.rb`, initializer and Ruby contract test, both native backend Dockerfiles.

- [x] Measure queues and compare pinned official Spree controller/job source.
- [x] Confirm existing one-hour guard depends on a timestamp only updated by the intentionally stopped general worker.
- [x] Review exact native hook and atomic timestamp-only update before implementation.
- [x] Regress repeated authentication, hourly boundaries, missing/deleted keys, store isolation and non-regressing timestamps.
- [ ] Preserve queued jobs and all business events; verify loaded initializer after a single grouped backend release if warranted.

## Task 4: Readonly operational and consumption verification

- [x] Establish clean baseline: 1,017 tests in104 files pass.
- [x] Measure native database/queue/mail cron and origin supplier cadence without pings or activation.
- [ ] Obtain supported Vercel per-project requests, CPU/memory and billing period; report unavailable precision explicitly.
- [x] Check current Google property/auth state and existing checkout/shipping evidence; do not repeat completed historic setup.
- [x] Update stale pending documentation and preserve a concrete reviewable result for any user-dependent step.
- [ ] Run combined tests, TypeScript, diff checks and independent review; persist changes in Git and verify only necessary deployments.

## Final evidence and limits

- Combined frontend suite 1084/109 passes; TypeScript exit0; Ruby contracts local and container layouts pass; independent review reports no open findings.
- First automatic Instagram post confirmed by private publication record at 2026-10-30 04:01UTC; no extra post.
- Search Console already configured, sitemap Correcto, 325 indexed (report dated 23/10). Stale setup documentation corrected.
- Vercel per-project metrics 403; current connector lists only frontend and returns 404 for known backend project/deployment. Backend release and real Rails verification remain blocked on access. Team billing is explicitly not attributed to Spree.

## Post-deployment cache finding

The first grouped frontend deployment `dpl_GeLiHb47HqZw7LZM931vgKQidsL9` (source9d55d86) is READY; homepage renders29 product links and private Instagram GET returns401 with private/no-store. A retired category check exposed thrown Spree404 losing status through remote RSC serialization (digest1590436008). Earlier mocked page tests did not model that boundary.

- [x] Reproduce3 cache-boundary failures (category, DTC product, wholesale product).
- [x] Return null only for native SDK404 inside cached detail fetchers; reconstruct404 in request wrappers and skip absent alternate translations.
- [x] Preserve cache tags, market/surface/JWT/expand/version arguments and DTC legacy redirects; independent review no findings.
- [x] Full suite1084/109, TypeScript and focused83 tests pass.
- [ ] Verify real retired category and product responses after the corrective release. Backend access remains separately blocked.
