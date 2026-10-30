# Owned stock and offer limits implementation plan

> **For agentic workers:** Use superpowers:executing-plans for inline execution.

**Goal:** Keep six Spanish Tarkir boxes at a manual base price of EUR139.99 and prioritize owned stock in the twelve daily offers, with precon discounts at most3% and booster-box discounts at mostEUR10.

**Architecture:** Extend the existing Spree price-list rotation, retaining native inventory and base prices. Merge canonical variants with actual positive Spree stock into the candidate pool even when there is no supplier offer; allow manual physical-only MTG prices within the owner's explicit limits. Preserve supplier cost floors and existing publication locks.

**Tech stack:** TypeScript, Vitest, Supabase Edge Functions, Spree5.6.1.

**Spec:** Owner request in this conversation on30/10/2026. Existing decision authority permits routine implementation choices without a new design approval.

## Constraints and review focus

- Spree remains the inventory and price authority; never replay six units as an addition.
- Keep three offers per category, twelve total; no extra Instagram post or paid order.
- Precons never exceed3%; booster and collector boxes never exceedEUR10, including Saturdays and rounding.
- Manual prices stay protected from supplier repricing. Discounting manual owned stock requires positive live stock and physical_only fulfillment; no supplier backorder fallback.
- Unknown costs may only use the owner's explicitly bounded physical-stock path. Known costs retain the payment-aware floor.
- Preserve review/book/preorder/disabled guards and avoid new schedulers or backend warming.
- Isolate changes on fix/owned-stock-offer-limits, based on verified current production source; no main merge.

## Tasks

- [x] Establish baseline tests and compare live Edge Function with repository source.
- [x] Add failing regressions for precon/box caps, cent rounding, stock-first ordering, manual physical-only stock without supplier, zero/unknown live stock, review rejection and manual price preservation.
- [x] Extend existing shared pricing policy and rotation loader/guards minimally; verify focused tests.
- [x] Verify existing social snapshot guards: exact date, native price-list identity and selected/live price equality. The producer enforces the new caps, so no extra frontend release is needed.
- [x] Update Spanish Tarkir identity, base price and physical-only policy without changing quantity; prevent an older higher overlay from overriding139.99.
- [x] Inspect public home, category, product, search and cart; record verified issues and operational limitations in ops/spree-backend/storefront-audit-20261030-evening.md.
- [ ] Run full suite, TypeScript and changed-file checks. Review diff, commit/push task branch and deploy one grouped Edge Function update.
- [ ] Verify deployed source and run a read-only preview of selection against live data; no forced publication. Confirm Tarkir publicly and remove temporary credentials.

## Execution record

- Baseline:1084 tests/109 files passed. Live devir-sync v158 matches all ten repository files exactly.
- Eight new pricing/rotation cases were observed failing before implementation; focused pricing/rotation tests pass after it. Tests cover both Saturdays and ordinary days.
- Ruling: enforce caps in the existing offer producer; retain the already tested exact-price publication guards instead of adding a duplicate frontend filter. This avoids an unnecessary Vercel build and release. Future producers must continue to use this policy.
- Tarkir SKU5010996290557 already had six units. Native base price changed153.95→139.99; two obsolete higher overlays were soft-deleted through Spree API. Exact canonical mapping retained, physical_only and no backorders/preorders. No quantities changed.
- Ruling: keep today's published offer snapshot as historical evidence; do not force a new Instagram post after the owner's lower manual price. Tomorrow's normal rotation uses the new caps.
- Full suite:1093 tests/109 files passed, TypeScript passed, changed-file Biome and diff checks passed. Final independent review approved without Critical/Important findings; focused46 tests passed in the reviewer context.
- Final minor (deferred): add dedicated negative fixtures for reserved available_stock versus total stock, changed owner-price authorization and canonical review decisions. The production guards are present and independently reviewed; the current suite covers zero/unknown live stock, native review tags, manual-base exclusion and bounded owner authorization.
- Ruling on review scope: keep existing native price-list replay/leases and supplier synchronization intact. No pending rotation existed during migration. The live source family classification and stock/price snapshots are separately verified; no claim is made that a paid checkout or tomorrow's provider availability was exercised.
- Final: fixed foreign native-cost currency handling — normalized-EUR-supply-cost regression RED→GREEN, final suite1094/1094; TypeScript, Biome and live-data local simulation pass.
- Ruling: disable only unpriced, zero-stock retail flags after exact-ID/freshness audit, rather than inventing PVP from old supplier costs.772 variants verified;770 backorders and613 preorders disabled, prior values retained for771 changed variants. Physical quantities and priced products preserved. A later verified source refresh can restore sellability.
- Final review scope rulings: no paid transaction/IG delivery was exercised; existing replay/leases and supplier transport remain unchanged; classification is confined to explicitly bounded profiles. These limits preserve current production behavior and avoid extra posts, charges or builds.
