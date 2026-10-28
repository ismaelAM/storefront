# Retire Devir without disrupting shared commerce

Owner request: remove Devir and its products, taking care of shared infrastructure.
Execute inline using the existing supported controls; avoid application deployments.

- [x] Verify the live v153 scheduler supports Devir disabled while preserving TCGFactory and daily/common maintenance. Add a behavioral regression for that configuration and run it against the actual entrypoint.
- [x] Build and review an exact supplier/variant/product manifest. Preserve any product with another supplier and every physical stock quantity, including six Spanish Tarkir units. Preserve unmapped identities for review. Use native API operations for catalog visibility and availability.
- [x] Back up affected source state in a private schema, verify idle locks, disable only Devir's lane and offers, and retain the existing hourly shared cron, worker authentication and TCGFactory cursor. No real orders, email, new credentials or hard deletion.
- [x] Archive exclusively Devir products without physical stock through native bulk status update. Disable supplier-only availability on exclusive variants, including variants inside mixed products, without changing quantities or prices. Reconcile shared selections through the existing worker. Check all candidates and stock after writing.
- [x] Verify the source guard and unchanged shared configuration, a bounded shared tick, native visibility and representative public output. Record exact outcomes and remaining limits in project documentation. Run TypeScript, application tests and diff checks; request an independent final review.

Implementation ruling: “remove” means reversible withdrawal from sale, retaining identities/history and backups. Existing supported runtime controls avoid a paid Vercel rebuild. A shared product is preserved even if the other supplier is temporarily stale; no equivalence is inferred from product titles or from the legacy `devir-*` tags used by both suppliers.

Final evidence and the old-URL UI limitation: `ops/spree-backend/devir-retirement-20261028.md`.
