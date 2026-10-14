# BisonTCG search and shopping discovery

**Goal:** Make public product information more useful, prepare a Google Merchant Center feed, and publish three original Spanish buying guides.

**Constraints:** Spree remains authoritative for descriptions, variants, public prices and availability. No invented product attributes, brands, shipping costs, delivery dates, reviews or ratings. No customer mail or external account registration. Do not merge to main automatically.

## Tasks and interfaces

1. Root: improve `buildProductShortDescription` in `src/lib/seo.ts` using explicit public product specifications and selected-variant options only when authored text is absent. Add metadata expansions in `src/lib/data/cached.ts`; verify with regression tests.
2. Feed worker: create `src/lib/merchant/{feed,data}.ts`, their tests, `/merchant-feed.xml/route.ts`, route tests and `docs/google-merchant-center.md`. Use guest ES/es/EUR tax-inclusive Spree data, selected default offer, batched exact GTIN lookups, bounded complete pagination and a streamed XML response. Return 503 before any partial feed on upstream failure; omit records lacking truthful required facts.
3. Guide worker: create `src/lib/guides/content.ts`, lookup tests, and Spanish-only `/[country]/[locale]/guias` plus `/guias/[slug]` pages. Three guides: starting Pokémon TCG, selecting sleeves, selecting a two-player board game. Include official sources and Article metadata, without claims of shop experience or current inventory.
4. Root: link guides from Spanish footer and include them in sitemap accounting without changing non-Spanish URLs. Run focused tests, full suite, TypeScript, formatting, independent review and Vercel Preview. Prepare one reviewable PR.

## Review focus

- Authored product text must win; only whitelisted public specifications enter fallback prose.
- Selected variant's public options must not advertise another edition or language.
- Feed prices must be guest EUR including tax; supplier costs and customer discounts must never appear.
- Pagination or upstream errors must never return HTTP200 with a partial/empty feed.
- Backorder/preorder without a visible valid shipping date cannot be marked in stock.
- Guide URLs must remain localized, discoverable and Spanish; links, metadata and sitemap counts must agree.

## External work

Merchant Center account connection, domain verification, real shipping settings and scheduled fetch registration require the owner's account. Search Console/analytics can be connected later for measurements. Real reviews and third-party mentions require actual customers and communities; this change does not fabricate them.
