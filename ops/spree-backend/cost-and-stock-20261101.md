# Cost and availability audit — 2026-11-01

Read-only Vercel project Usage, current Oct 25–Nov 25 billing cycle:

| Project | Infrastructure subtotal |
| --- | ---: |
| bisontcg-spree | $9.22 |
| storefront | $1.49 |
| Combined snapshot | $10.71 |

Usage is cumulative and can lag by one hour. These are consumption figures,
not a final invoice. Backend CPU ($4.20) and provisioned memory ($3.35) are
approximately 82% of its subtotal. The full Oct 31 Madrid calendar day cost
$1.62 for the backend, with 11.73K function invocations. Image transformation
and image-cache writes together are approximately $0.10 on the storefront.
Removing product photographs would not address the main cost.

Product metadata used the 30-second `catalogProducts` refresh for every other
market/locale translation check. Runtime request logs show simultaneous
same-product requests with distinct Rails request IDs. Runtime stdout messages
can be repeated across overlapping container invocations; do not count every
log message as an HTTP request.

The optimization adds a dedicated public translation projection with the
existing `tenMinutes` remote cache, keyed by product ID, country and locale.
It preserves product tags and 404-as-data handling and returns no price, stock,
variant or customer fields. The commercial product cache, customer segmentation,
cart, offer rules and supplier schedule are unchanged. Cold translation reads
still call Spree. Savings must be measured after production traffic; no realized
dollar reduction is claimed from tests.

## Availability snapshot

Native store 4: 2,414 active products, 2,417 selectable variants. Classification
below uses selectable variants (non-master where present, otherwise master),
positive regular EUR base price and native fulfillment flags, in priority order.
It is a diagnostic classification, not a live Store API purchasability count.

| First matching condition | Variants |
| --- | ---: |
| No positive regular EUR base price | 746 |
| Positive physical stock | 6 |
| Native preorder flag | 411 |
| Native backorder/untracked flag | 331 |
| No selected enabled supplier | 258 |
| Supplier selected availability is preorder | 272 |
| Selected supplier observation older than its freshness window | 393 |

Only six references currently have physical inventory: Tarkir Spanish box (6),
Lorwyn English box (6), and the four Fallout precons (3 each). Their manual base
prices remain 139.99, 139.99, 39.99, 109.99, 59.99 and 59.99 EUR respectively.

TCGFactory is enabled and hourly crawl responses are successful, but the initial
catalogue crawl is still incomplete. Offers expire after eight hours while the
full crawl takes days. Consequently, an expired observation means availability
is unconfirmed; it is not proof the supplier sold out. Slowing this crawl further
would worsen that mismatch. Devir remains retired.

There is also a separate stock-safety backlog: many zero-stock variants still
carry preorder/backorder flags after their supplier observations expired. Those
flags must not be treated as fresh supplier confirmation. This audit does not
reactivate stale/unpriced products, invent physical stock, extend freshness
windows, or run global workers. A follow-up needs authenticated availability
refresh plus bounded reconciliation, avoiding a second full product import.

The source daily offers state has 12 products for Nov 1 with no last error.
No Instagram post was triggered for this audit.
