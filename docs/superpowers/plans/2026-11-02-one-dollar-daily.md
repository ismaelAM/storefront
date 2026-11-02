# One-dollar daily consumption implementation plan

> Execute inline using executing-plans; one independent review before release.

**Goal:** Attempt to reduce total Vercel infrastructure consumption from about
$2.05/day toward $1/day, without claiming an unmeasured dollar saving.

**Architecture:** Keep Spree authoritative. Remove redundant alternate-locale
lookups using an explicit server-side content-locale configuration, and reuse
public guest catalogue responses for two minutes. Customer/wholesale caches,
cart mutations, supplier observations and Instagram scheduling stay unchanged.

**Tech stack:** Existing Next.js 16 remote cache, Spree SDK and TypeScript.

## Evidence and design

Native store 4 has exactly zero product and taxon translation rows. Its only
Market defaults to es but exposes six UI locales (es,en,fr,pt,de,pl). Metadata
currently resolves every locale even when all payloads are Spanish fallbacks.
SPREE_CATALOG_CONTENT_LOCALES=es will describe verified catalogue content;
unset/invalid configuration retains the existing full translation detection.
If translations are added, update/remove this setting in the same release.

Options considered: more cache duration alone still pays six cold lookups per
new product; reducing UI languages changes the site; a backend migration changes
hosting. Choose bounded caching plus known content locales within this stack.
This is the implementer's choice under the owner's standing authority to decide.

## Constraints and review focus

- Country/Market/surface/customer-token cache segmentation must remain intact.
- Invalid locale tokens or a list missing the Store default must retain normal detection. A valid list must be updated when actual translations are added.
- Fallback locale pages retain the Spanish canonical and translated UI.
- Real configured translations and other Markets remain independently resolved.
- Guest catalogue revalidation 120s, expiry 300s, client stale 30s; authenticated
  and wholesale reads retain the existing 30s profile. Cart verifies commerce live.
- No supplier slowdown, stock invention, price changes, global worker, keepalive,
  main merge or duplicate preview build. Target is measured after release.

## Task 1: Remove redundant content-language reads

- [ ] Add failing alternates tests: default locale needs zero extra calls;
  fallback locale needs only default read; configured translated locale resolves;
  omitted/incomplete configuration retains old behavior; Markets stay isolated.
- [ ] Add optional contentLocales to buildLocalizedAlternates and central env
  parser in src/lib/store.ts. Pass configuration only from product/category SEO.
- [ ] Run targeted alternates, metadata and not-found tests; expect green.

## Task 2: Bound public catalogue refresh work

- [ ] Add failing policy tests covering DTC guest, customer token and wholesale.
- [ ] Add catalogGuestProducts cache profile (30/120/300) and select only for
  anonymous DTC product lists/details/filters and category product lists.
- [ ] Run targeted tests, full vitest, pnpm exec tsc --noEmit and Biome checks.
- [ ] Independent review; fix significant findings before release.
- [ ] Disable automatic branch deployment, commit/publish branch and stacked PR.
- [ ] Set production content-locale Config after final native readback; perform
  one production build. Verify Spanish/fallback metadata, physical prices/stock,
  account/cart cache isolation and existing 12-offer state without posting.
- [ ] Record production evidence and arrange one read-only cost comparison after
  a complete post-release day; do not claim $1/day achieved before measurement.

## Validation ledger

- Native exact readback: 0 product/taxon translation rows, one ES Market, six UI locales.
- Task 1: regression tests failed on 2 unnecessary calls and wrong French alternate, then passed.
- Task 2: anonymous detail policy test failed on the old short profile, then passed.
- Full suite: 115 files / 1177 tests passed. TypeScript and targeted Biome checks passed.
- Independent review: no critical/important findings. Policy tests exercise detail selection/token forwarding; other call sites and unchanged cache-key isolation were inspected, not claimed as live remote-cache tests.
- A valid content-locale setting is an operational declaration, not automatic discovery; update/remove it in the same release as adding translations.
- Physical stock/base prices read back unchanged: boxes 6 each at 139.99, precons 3 each at 39.99/109.99/59.99/59.99. Nov 2 daily offers: 12, error null.
- Dollar savings and the $1/day target remain unmeasured pending production observation.

- Release validation caught Next-generated cacheLife overloads rejecting a literal union (four TS2769 failures). Local tsc without generated Next types had missed it; next typegen cannot run in this executor because of its SWC/stacker assertion. Reproduced all four failures using Next's own writeCacheLifeTypes utility with the actual profile values, then used separate literal cacheLife calls per branch. Generated-type tsc passed before rerunning the full suite. This changes no runtime cache policy.
