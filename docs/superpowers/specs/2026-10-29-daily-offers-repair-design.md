# Repair daily offers for Instagram

The owner requests twelve real offers and permits 3×4 if that is materially
cheaper; retain the existing four JPEGs with three products because the template
and publication validator already support it. Use existing Supabase ingestion,
Spree pricing and the existing hourly scheduler. Do not add a cron or relax
freshness, manual prices, review, stock, book exclusions or contribution floors.

Investigated cause: native variant serializer emits a price object with a null
amount when no base price exists. `variantPrice` turns null into zero; the
managed-price policy then labels an absent price as an override. Reconciliation
never fills it and last_auto_price remains null. The hourly general refresh also
spreads capacity across thousands of items rather than maintaining three viable
candidates in each daily-offer category. An incomplete rotation is treated as
finished for the whole day; retired products remain in yesterday's selection.

Approach: repair missing managed prices while preserving explicit zero/manual
prices; prioritize a bounded balanced cohort through the same authenticated
TCGFactory parser/reconciliation; retry incomplete daily selection as supply
becomes ready. Keep existing images/publishing duplicate and current-price guards.
A source-level preflight avoids expensive native requests until each group has
three candidates. Preserve normal supplier crawl progress and disabled Devir.
Alternative 3×4 would change template/layout/contracts without fixing stale
supply or absent prices, so it is unnecessary.

Validate real twelve-offer readback, matching public variant prices and four
1080×1350 JPEGs. Instagram account connection remains a separate external step;
do not send a post or email during this repair. Minimize Vercel activations;
prefer native/source queries and local rendering, and deploy only required code.
