# Private pricing and local delivery

Owner authorizes direct main publication and minimal builds. Implement inline.

- [x] Set the exact physical Spanish Tarkir variant to 1 kg through native Admin API; read back 1.00, preserve six units.
- [x] Add a private €2 contribution to automatic pricing after VAT/card fees, including offer and special-price floors. Preserve manual prices and fixed-price books. Test actual calculator bodies, including reference-price pricing and offers.
- [x] Add authenticated, read-only eligibility to the existing Supabase worker: active BISON3, approved request, exact current customer ID and email. No guest/email-only entitlement, no public coupon, no legacy-ID remapping.
- [x] Decorate only the restored native Madrid FlatRate calculator: current authenticated order user, ES/M address and exact local method. Query the existing private worker with the existing Vault bot credential, bounded timeout, no positive caching. Failure preserves ordinary tariff. Correos unchanged. Test guests, pending, approved, revoked, disabled, other methods/destinations and provider failure with native FlatRate source.
- [x] Run TypeScript, relevant tests/full suite, Ruby WASM locally and native Ruby during one backend build. Review diff; commit directly to main. Deploy worker and backend, no frontend build. Verify live guest quotes, private eligibility responses, stock and uncompleted-order safety.
- [ ] Verify a free native Madrid checkout quote using a recovered or newly approved real customer account. The three old customer accounts remain unavailable; do not create a replacement identity or transfer approval merely to complete this check.

Ruling: €2 means net contribution per unit after VAT and standard card fees; no public surcharge line. Fixed-price books retain their existing ceiling. Catalogue repricing uses the existing bounded sync, avoiding a costly full-store rewrite.
Ruling: approvals remain in the source database and are checked live, avoiding a stale membership mirror. Previously approved accounts require recovered identity; no entitlement is transferred to a new account merely because numeric IDs or email resemble old data.

Published and verified: see `ops/spree-backend/activation-20261028.md`.
