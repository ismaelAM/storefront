# Instagram recovery — 31 October 2026

The daily rotation remained on 30 October. The hourly worker repeatedly returned waiting_catalog with quotas 3/2/3/3. There was no publication record for 31 October. Villains was refreshed and counted toward the ready supplier cohort, but its live regular price was EUR15.50 while last_auto_price remained EUR12.50. Native selection correctly respected that manual override and rejected it; refresh planning incorrectly stopped looking for a third board game.

Persist definitive native eligibility rejections in the existing private daily state JSON, scoped to the Madrid commercial day. Ignore these products when planning replacement supplier refreshes. Preserve existing active offers, price-list identity and rotation locks. Clear planning on successful rotation. Persist learned rejections before yielding on a later budget timeout; failed native reads do not become definitive rejections. A successful sibling variant removes any earlier product-level rejection.

An idempotent migration records the already existing pending_rotation column for reproducible fresh installations. The live migration version is 20261031195239.

The Instagram cron now attempts at 04:15, 08:15, 12:15, 16:15 and 20:15 UTC after hourly supplier maintenance. Existing publication claims/checkpoints retain one-publication-per-day protection. No limits on stock, manual prices, precons, boxes or language exclusions were relaxed.

Validation: regression failed before implementation; 1,157 tests / 113 files pass, TypeScript passes. Independent review identified migration coverage and checkpoint-before-deferral gaps; both were fixed with regression coverage. Production rotation and publication must be verified separately after deployment.
