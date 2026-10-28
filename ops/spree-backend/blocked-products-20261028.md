# Supplier purchase blocks — 28 October 2026

Authenticated TCGFactory listings exposed purchase controls labelled `Bloqueado`,
while the same products' technical sheets could still say `Disponible` or
`Preventa`. Detail samples confirmed `Venta bloqueada`; OP-17 instead displayed
`Solo tiendas TCG+`. Those purchase restrictions override the technical status.

The authenticated audit covered every listed page in all five configured sections:
accessories 32, TCG 14, board games 7, merchandising 133, paints 24 (210 pages).
It identified 217 distinct restricted URLs, matching 150 supplier offers / canonical
variants across 149 products in this installation. None had another eligible
supplier or physical stock. Before repair, 125 offers reported sellable supply;
41 native variants had preorder, backorder, or inventory-tracking flags requiring
repair.

All 150 offers now report unavailable. Their 150 native variants track inventory,
have preorder disabled, no preorder date, and backorder limit zero. All 39 existing
stock items have backorder disabled; quantities were preserved. The 149 product
pages were drafted after checking that no other sellable variants would be hidden.
Private database metadata records the observation and previous flags/status.
Post-repair audit: zero active affected products and zero unsafe inventory flags.
The six Spanish Tarkir booster boxes retain physical stock six and weight 1 kg.

OP-17 has an additional persistent operator rejection and disabled fulfillment.
Its Store API product lookup returns 404. Direct addition to a cart returns 422;
reading a cart containing the old OP-17 line removes it with `line_item_removed`.
No completed OP-17 order was found. A second formerly preorderable blocked
product was checked separately through the Store API.

The parser now reads primary-product controls and ignores recommendations and
the global language menu. Canonical operator review changes reconcile actual
variants immediately, including products without a legacy Devir row. Rejected or
disabled products are drafted even when no eligible offer remains. Negative
supplier observations retain physical quantities and enforce inventory tracking.
Existing bounded supplier refreshes apply these rules; no additional cron or
Vercel deployment was introduced. Temporary inspection actions were removed
from the final worker bundle.
