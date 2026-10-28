# Pricing and local delivery verification — 28 October 2026

The requests interrupted by the supplier-block incident are implemented in main
commits `2a72976` and `e3f5fc9`. The backend production deployment
`dpl_FcaT5cX4hmGhJJmMWLwPmYBwV96o` was confirmed Ready, current Production,
using source `e3f5fc9`; its build took 1m 8s. The earlier failed build was fixed
by using portable Ruby setter syntax in the transport fixture. No further
frontend or backend deployment was created to resume this work.

- Spanish Tarkir EAN `5010996290557`, native variant 5930: physical stock 6,
  weight 1.00 kg, product active. The supplier worker preserves this exact weight.
- Automatic pricing reserves €2 net per unit after VAT and standard EEA card
  fees. Reference-price pricing, offers and private-price floors include it.
  It is internal pricing, with no customer-facing surcharge line. Manual prices
  and fixed-price book rules remain protected. Existing bounded synchronization
  applies repricing; no full-catalog rewrite was forced.
- The native Madrid calculator applies zero only to the restored local method,
  store 4, destination ES/M and the authenticated order owner with a current
  BISON3 approval matching customer ID and email. Guests and unconfirmed accounts
  retain €4.99 local delivery. Correos retains its own tariff.
- Read-only private eligibility probes verified approved=true, unapproved=false
  and missing operator credential=401. The native backend's existing Vault
  credential successfully reached this worker. Native FlatRate regressions
  exercise approval, revocation, guests, destinations, provider failure and
  preservation of completed shipment costs. These checks are distinct from a
  real approved-customer checkout.
- The native guest quote for one 1 kg Tarkir display offered Madrid local €4.99
  and Correos €13.65; Barcelona offered only Correos €13.65. The diagnostic cart
  was subsequently deleted through Store API (204), without a purchase, payment
  or email. Physical stock remained six.

The current supplier worker is v153 after the separate blocked-product repair;
all ten files were verified on readback and retain the pricing and shipping
eligibility implementation. The final combined suite passed 978 tests in 101
files and TypeScript passed. Independent code review found no blocker.

## Remaining migration limits

The native database has no customer accounts and no completed orders. The two
historical BISON3 approvals remain in the source database, with no automatic
identity transfer. Its historical private-price-list reference has not been
restored into the native database, whose current lists are daily offers. Full
legacy BISON3 account pricing and an approved-customer checkout therefore remain
pending customer recovery or a new verified account approval. The Madrid
shipping calculator is deployed independently of that old price-list reference.

The three original accounts still require an original export or backup; earlier
targeted recovery did not find them in the connected databases or Stripe. No
replacement identities, passwords or approvals were invented.

Catalog synchronization is progressing: the active Devir cycle currently has
844 jobs done, 457 pending and 20 held errors. TCGFactory is processing the
merchandising section (page 91 at the last scheduled run), with no crawl error.
The hourly supplier cron's last three runs succeeded. Its deliberate economy
cadence remains hourly; no additional poller or recovery daemon was enabled.

Automatic Correos labels/collection still require the documented contract/token
and controlled provider validation. A real paid purchase and real fulfillment
cycle have not been certified. This note does not mark the entire migration as
complete.
