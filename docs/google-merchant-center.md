# Google Merchant Center: Spain product feed

The storefront prepares a public RSS XML feed at:

**https://www.bisontcg.com/merchant-feed.xml**

This URL becomes available after the branch containing the route is deployed to
production. Code and tests alone do not register a Merchant Center account or
activate listings.

## Current activation blocker

The ES market returned `tax_inclusive: false` in the Vercel Preview checked on
2026-10-14. The feed therefore returns **503**, with the safe diagnostic code
`market_tax_inclusive`, before reading or publishing product offers. The guides
and product-summary improvements can be deployed independently of activation.

Before registering the feed, reconcile the Spanish market's tax setting with
the actual catalogue prices and checkout totals in Spree. Confirm whether the
stored prices already include VAT and verify the applicable product tax rates;
do not simply toggle the flag or add a blanket percentage to the feed. Once the
backend accurately declares VAT-inclusive consumer prices, repeat the complete
live feed validation below. No successful live catalogue export has yet been
verified for this branch.

## Account setup

1. In Merchant Center, complete the real business details and verify/claim
   `https://www.bisontcg.com`. Confirm the public contact, shipping, returns and
   checkout information are accurate.
2. Add products **from a file**, enter the feed URL above, select **Spain**, the
   **Spanish** content language and **EUR**, and schedule a **daily fetch**.
3. Configure the actual delivery regions, shipping costs, handling time and
   transit time in Merchant Center. Spain requires shipping costs for Shopping
   ads and free listings. Match the storefront checkout; do not assume free
   shipping or copy an unconfirmed rate into the account.
4. Fetch the file, review the data source's **Latest update**, and check
   **Products → Needs attention**. File processing success does not imply every
   item is approved or displayed. Enable free listings only after account and
   product requirements are satisfied.

The feed deliberately does not create an account, configure shipping, publish
ads, submit invented reviews, or claim that products have been approved.

## Data and offer scope

- Spree is authoritative for public guest product prices and availability. The
  request fixes the market to `country: es`, `locale: es`, `currency: EUR`; the
  ES market must enable Spanish and use **VAT-inclusive EUR pricing**.
- Only the offer initially selected by the existing product page is exported.
  Its Spree variant ID is the stable offer ID. Additional variants are omitted
  until product URLs can explicitly preselect them. When the initial offer is
  part of a variant group, exact public option values describe it; missing
  initial-variant metadata makes that product ineligible.
- Descriptions use the same public description helper as the product page.
  Authored descriptions remain preferred; fallback text uses only known facts.
- Full-size product images must exist in the public product gallery and be
  associated with the initial variant or shared by the product. Thumbnails,
  videos and placeholders are not substitutes. Image URLs must be fetchable by
  Google. Image dimensions and image-policy compliance still require checking.
- The existing storefront represents its catalogue as **new** merchandise.
  Used/refurbished inventory needs an authoritative condition field and a feed
  change before inclusion.
- Only public GTIN values are batch-read from `catalog_variant_identifiers` in
  the `gtin` namespace, matched to both the displayed Spree variant and product.
  Manufacturer brand/MPN and identifiers explicitly present in Spree public
  custom fields use the shared SEO validation. Supplier SKU, sourcing details,
  costs, credentials and other custom fields are not exported.
- Missing identifiers are omitted. `identifier_exists=no` is not inferred from
  missing application data: branded manufactured products may still require
  their actual brand/GTIN/MPN to be added before Google approves them. The shop
  name is not substituted for a manufacturer's brand.

## Availability and intentional omissions

Purchasability alone does not mean `in_stock`. The feed uses the selected offer's
explicit stock flags. Unpurchasable offers are `out_of_stock`; they retain a
visible positive price. Google expects the feed, product page, structured data
and checkout to agree.

Preorders require a usable `preorder_ships_at` date, no more than a year ahead,
which the existing product page displays. Missing, invalid, past or excessively
distant dates make a preorder ineligible. `available_on` is not a shipping date.

Backorders are omitted while the product page lacks an authoritative, visible
expected backorder shipping date. They are never relabelled as in stock. Offers
with missing full-size images, invalid/nonpositive prices, a non-EUR currency,
invalid URLs or unusable variant metadata are also omitted.

The response exposes `X-Merchant-Item-Count` and `X-Merchant-Skipped-Count` for
basic completeness checks. Skipped products require catalogue review; the
headers are not a per-product diagnosis or proof of Merchant Center eligibility.

## Fetch safeguards and verification

Every fetch collects all public products in pages of 100, at most four requests
at once, before generating any successful response. The route caps the catalogue
at 5,000 products / 50 pages and the XML at 25 MB, verifies stable pagination
metadata and unique identities, and allows up to 300 seconds on Vercel.

The complete locally prepared XML is streamed to avoid Vercel's ordinary
4.5 MB function response-body limit. The feed does not put the full catalogue or
XML into one remote cache entry. All responses use `Cache-Control: no-store` and
`X-Robots-Tag: noindex, nofollow`; a Merchant product data source is separate from
an SEO sitemap.

A backend or identifier-query error, catalogue overflow, inconsistent
pagination, ambiguous identifiers, byte-limit violation, missing configuration
or zero eligible offers returns **503** before streaming begins. It never
returns a successful partial/empty document after a failed fetch. This does not
guarantee existing Google listings persist indefinitely after repeated failures.

RSS is a complete replacement for the products owned by that source: previously
submitted products intentionally omitted on a later successful fetch may be
removed. Compare exported/skipped counts before registering or updating the
source, and monitor Merchant Center diagnostics after every catalogue change.

Pagination checks catch changing counts, missing rows and duplicate IDs, but a
live catalogue with equal-count replacements is not a database snapshot. Retry
after large imports settle. If the catalogue exceeds these limits, use a stable
snapshot or separately registered feed shards; Google does not follow a
sitemap-style feed index or a `next` page link.

After deployment, inspect status/headers and XML without logging the entire
catalogue. For example, save a public response locally and inspect its XML with
an XML parser, count its items, check one normal offer and one preorder, and
compare their price, image and availability with `/es/es/products/{slug}`.
Confirm the public feed is accessible without cookies/authentication and that
the final production URL does not return Vercel's preview sign-in page.

## Official references

- [Product data specification](https://support.google.com/merchants/answer/7052112?hl=en)
- [RSS 2.0 format and full-replacement semantics](https://support.google.com/merchants/answer/14987622?hl=en)
- [Add products from a file](https://support.google.com/merchants/answer/12158380?hl=en)
- [Availability](https://support.google.com/merchants/answer/6324448?hl=en)
- [Availability date](https://support.google.com/merchants/answer/6324470?hl=en)
- [Shipping settings](https://support.google.com/merchants/answer/6324484?hl=en)
- [Identifier exists](https://support.google.com/merchants/answer/6324478?hl=en)
- [Variant grouping](https://support.google.com/merchants/answer/6324507?hl=en)
- [Variant option](https://support.google.com/merchants/answer/17085214?hl=en)
- [Vercel response limits and streaming](https://vercel.com/kb/guide/how-to-bypass-vercel-body-size-limit-serverless-functions)
