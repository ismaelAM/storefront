# Sitemap cost correction implementation plan

> **For agentic workers:** Use superpowers:executing-plans for inline implementation and a final independent code review.

**Goal:** Remove measured sitemap cache amplification toward USD0.50/day total infrastructure, without claiming an unmeasured saving.

**Architecture:** Reuse the current content-locale declaration, Spree SDK and remote cache. Keep sitemap fingerprints and output semantics while compacting cached data.

**Tech Stack:** Next16.2.11, TypeScript, Spree SDK1.2.1, Vitest, Vercel.

**Spec:** `docs/superpowers/specs/2026-11-04-sitemap-cost-design.md`

## Global constraints

- No main merge, duplicate deployment, backend warmup, stock/price/offer/cron changes.
- Guest commercial120s/300s and authenticated/wholesale30s unchanged.
- Content declaration is valid only with the actual Store default included.
- Preserve country/Market isolation and translated stable-ID comparisons.

## Review focus

- Unset/invalid declaration must retain translation discovery.
- Known untranslated locales keep home URLs but issue no resource reads.
- Real translations, images and dates survive the projection.
- Oversized descriptions/commercial data must not reach remote sitemap entries.
- API errors and pagination bounds must retain current failure behavior.

### Task 1: Bound sitemap reads and cache payloads

**Files:** `src/app/sitemap.ts`, `src/app/sitemap.test.ts`,
`src/lib/data/sitemap.ts`, `src/lib/data/sitemap-fingerprint.ts`,
`src/lib/data/__tests__/sitemap.test.ts`, `vercel.json`.

**Interfaces:** Existing sitemap page/count/index functions retain arguments;
page results carry id, path, update date, image URLs and a SHA256 fingerprint.
`hashSitemapResource` accepts source content or that compact projection.

- [ ] Add failing tests: six locale declaration loads only default resources,
  missing-default declaration retains discovery, translated locales remain;
  compact product/category output excludes long descriptions/prices/custom data
  but retains images/date and the exact translation hash.
- [ ] Run targeted tests and confirm new behavioral assertions fail.
- [ ] Apply validated locale gating before counts, project source data before
  remote serialization, select relevant SDK fields, use `hours` for SEO data.
- [ ] Disable automatic preview for this new branch before push.
- [ ] Run targeted tests, all tests, generated Next types/TypeScript, Biome,
  locale parity and a production build against local API fixtures if possible.
- [ ] Review the full diff independently; commit/push one branch, open stacked
  PR on `perf/one-dollar-daily`, publish one frontend production build, verify
  source/READY/domain plus bounded sitemap/product/cart behavior.
- [ ] Record real verification and unmeasured financial goal in the PR.
