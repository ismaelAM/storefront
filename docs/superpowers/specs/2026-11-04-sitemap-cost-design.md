# Sitemap cost correction

The owner asks to retry optimization toward total Vercel infrastructure of
USD0.50/day. The first full post-release period (Nov3 08Z–Nov4 08Z) costs
USD2.598935, excluding Pro. That target is not achieved or promised by this fix.

The Nov4 production Runtime Cache panel shows sitemap page keys with 616–668 KB
entries, ten-minute revalidation, and roughly one read per write. The storefront
costs about USD1.28 in the corresponding project Usage selection, including
USD0.88 Runtime Cache writes; the backend about USD1.32. Production logs also
show sitemap page failures across six locales. These observations establish
avoidable sitemap work, not an exact allocation of all backend CPU.

Keep the existing Spree API, remote cache, pagination, Market isolation and
canonical translation detection. Apply the existing verified content-locale
declaration to sitemap resource reads, preserving all enabled locale home URLs.
Use it only if the actual Store default is present; otherwise retain discovery.
Compute translation hashes before caching compact URL/image/date projections.
Refresh these SEO-only data at most hourly under the `hours` cache profile.

The first preview confirmed a pre-existing Rails error: EMAXCONNSESSION,
max session clients reached (pool_size15). Sitemap reads used eight concurrent
API calls. Cap count batches at one Market/locale and pagination at one page per
resource lane, hence at most two concurrent reads within one sitemap. This is
load reduction, not a global connection guarantee across unrelated traffic.
Preview must use the same non-secret `es` content declaration as Production.

Alternatives considered: increasing commercial catalogue TTL would compromise
freshness without addressing oversized sitemap payloads; changing hosting or
adding another cache would introduce infrastructure before fixing known waste.
The owner's prior delegation to decide and current request to retry authorize
the bounded existing-architecture correction selected here.

Do not change guest commercial 120s/300s, customer/wholesale 30s, carts, checkout,
stock, offers, Instagram, supplier freshness/cadence, workers or backend keepalive.
Publish one validated frontend release from an isolated branch, without merging
main. Verify bounded real traffic, then measure a full subsequent billing day.
Only observed billing can establish whether USD0.50/day has been reached.
