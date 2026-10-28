# Devir supplier retirement — 28 October 2026

The owner requests removing Devir and its products while preserving shared
infrastructure. This is a live configuration/catalog operation using the existing
v153 worker and native Spree APIs; no frontend, backend or Edge deployment.

## Scope and safeguards

The verified canonical manifest has 1,050 Devir-associated variants: 1,019 with
only Devir offers and 31 with another supplier. Their 930 native product families
comprise 899 withdrawal candidates, 30 shared families and one already-draft
ambiguous family. The latter's two unmapped variants remain under the existing
identity hold. Six physical Spanish Tarkir displays belong to a kept family.

The pure operational planner validates canonical/native ownership, SKU, parent,
live stock, sibling variants and duplicate mappings. It emits raw native IDs for
bulk API operations, avoiding an independently supplied prefixed endpoint ID.
The live SQL guards repeat ownership, parent, sibling and physical-stock checks
immediately before applying. Private checkpoints on both existing databases use
schema `supplier_retirement_20261028`, with RLS and no client/service-role access.
No credentials or supplier payloads are exported to Git.

## Applied operation

- `devir_sync_config.enabled=false` stops **Devir's crawler only**. The shared
  `devir-sync` function, its authentication, backend key, existing hourly cron
  `devir-cloud-sync-tick`, TCGFactory cursor and common maintenance remain.
- Devir's `catalog_suppliers.enabled=false`; its 1,051 offers become inactive.
  Supplier identities and history are retained for reversal/audit.
- The official native `POST /api/v3/admin/products/bulk_status_update` archives
  the 899 exclusively Devir families without physical stock. Request49978
  returned HTTP200/product_count899. Readback confirmed899 archived and zero
  status changes in kept or other product families.
- Only after native archive readback,558 exclusive Devir selections were cleared
  with selection-history entries. Legacy rows for archived families are marked
  `retired_supplier` and current review-marker version so legacy review work
  cannot republish them.
- Twelve remaining Devir selections in kept/mixed families use existing canonical
  reconciliation, always offset0 because successful rows leave the result set.
  This preserves other suppliers and native business rules. Individual native
  variant/stock PATCHes are used by that helper; inline `variants`/`stock_items`
  replacement setters must never be used for a partial family withdrawal.

Checkpoints are intentionally single-use. For a partial failure, inspect saved
native postconditions and resume the remaining work; do not rerun CREATE SCHEMA
bootstrap SQL or clear selections before the corresponding native withdrawal.
Do not delete/rename the shared worker or cron, remove `devir-*` merchandising
tags globally, erase shared secrets, close the incomplete crawl as successful,
or call `enable`/`run-now` to resume Devir without a new owner instruction.

## Validation

979 application tests pass, including the real scheduler with Devir disabled
and TCGFactory/common maintenance still called. Nine withdrawal-planner tests
pass, with RED→GREEN coverage of identity/stock/mixed-family guards. TypeScript
and diff checks pass. Existing unrelated lint error remains in
`blocked-supplier-safety.test.ts:77`.

Native archive API and final source/catalog readbacks, including stock and a
bounded shared tick, are the operational proof. Exact final outcomes are recorded
below when verification completes. Invoice savings require later usage evidence;
retiring a source does not establish a monetary saving percentage.

## Final live readback

- Reconciliation requests49979 and49980 returned HTTP200,3+9 successes and
  zero failures. Devir selections are now0. TCGFactory stayed enabled.
- Before the verification tick, the shared cron command/schedule and TCG cursor
  were byte-for-byte unchanged. The original hourly cron remains active.
- One normal authenticated shared tick (request49981) returned HTTP200:
  Devir skipped=disabled, TCGFactory running on merchandising page92,
  processed1/discovered24/failed0. Common stale maintenance was attempted and
  deferred on its existing request budget; this is not proof that lane completed.
- Final native readback retains899 archived targets and six physical Tarkir
  units. The withdrawal itself changed no stock rows, location associations,
  quantities or deletion markers. Its later TCG verification tick legitimately
  initialized one additional zero-stock item (1852/variant8280); existing physical
  quantities remain unchanged. Two exclusive variants inside mixed families have no supplier
  backorder/preorder entitlement; shared siblings were preserved.
- Public old Star Realms URL reached Spree404, confirmed in storefront runtime
  logs (digest2887412968). The current frontend renders its generic error page
  instead of a friendly404 for this case. That UI handling remains a separate
  follow-up; do not describe the old URL as a successfully rendered404 page.
- Branch-specific Git deployment suppression is included in both Vercel configs
  so publishing this operational record cannot create duplicate previews.

The public home rendered its current catalogue, offers and upcoming products
after withdrawal; removed Fauna/Star Realms cards were absent from the initial
catalogue grid. This does not certify every public route.


## Empty categories — 29 October 2026

The owner subsequently authorized deleting empty categories after investigating
TCGFactory content. No additional categories had become empty and no previously
active unrelated product had been archived since retirement. Native Dungeons &
Dragons retains 22 active products and eight drafts, backed by 30 canonical
TCGFactory products/offers. Other TCGFactory Warhammer matches are accessories or
merchandise; no role-playing product or discovery row requires the removed RPG
subcategories in the inspected source catalog. The supplier crawl is incomplete,
so this does not claim an exhaustive inventory of the supplier's external site.

Seven categories were removed: Manga y cómic, Rol / Pathfinder, Rol / Warhammer,
Rol / Otros juegos de rol, TCG / Topps, TCG / Icoins and TCG / Panini. All were
leaves without active/draft products or physical stock. Preserve Cyberpunk's
seven drafts and Infantil's unavailable TCGFactory discovery item, Make' N' Break
Junior. These two categories remain empty publicly but have supplier content.

Category bootstrap used to recreate all seven on a fresh supplier crawl. The
minimal worker change respects `catalog_suppliers.config.retiredCategoryKeys`
for TCGFactory during category creation and margin setup. Supabase `devir-sync`
v154 is active, with its prior custom authentication and identical dependencies;
source comparison confirmed the deployed files match the local change. No
Vercel application deployment was needed. To restore a retired category for a
new feed, remove its key from this setting before running category setup/import.

The existing private checkpoint payload on each database now includes an
`empty_categories_20261029` section. The native snapshot retains all 43 original
nodes, 137 target classifications, translations, metafields, product statuses
and stock identity/quantities. The source snapshot retains the supplier config,
shared cron and TCGFactory cursor. Category DELETEs used official Admin API
prefixed IDs matched by exact unique permalink, sequentially for tree callbacks.
Requests49984–49990 each returned HTTP204. Initial numeric-ID request49982
returned404 without changing anything; request49983 obtained authoritative IDs.

Final native readback: 36 categories, all seven targets absent, no retained node
parent/name/permalink changes, no dangling category parent, no product status or
deletion changes, no missing products, and no stock identity, location, quantity
or deletion changes. D&D, Rol, Infantil and Cyberpunk remain. Source readback
confirms Devir stays disabled with zero selections, TCGFactory stays enabled,
its other settings are unchanged, and shared cron/crawl cursor are unchanged.
The regression failed before the fix and passed afterward; all 980 application
tests, TypeScript and diff checks pass. Category listing has an existing remote
cache; this operation does not certify immediate expiration of every cached menu.
