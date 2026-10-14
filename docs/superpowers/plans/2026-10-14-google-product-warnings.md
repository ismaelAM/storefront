# Google product warnings correction plan

**Goal:** Address the Search Console merchant-listing warnings reported on 14 October using verified data.

**Architecture:** Preserve Spree pricing, availability and initial variant selection. Read only the explicit `gtin` identifier linked to that exact Spree product/variant from Supabase; never expose purchasing data. Link offers to the existing organization-level return policy with the same JSON-LD ID.

**Files:** `src/lib/seo.ts`, its tests, `src/lib/catalog/seo-identifiers.ts` and its tests, and the existing product page.

- [x] Reproduce missing identifiers and policy references with regression tests.
- [x] Implement `getCatalogGtin(productId, variantId): Promise<string | undefined>` with an exact product/variant lookup and safe failure fallback.
- [x] Validate catalog GTIN checksum in the existing serializer; prefer the displayed variant's catalog identity over a group-level field.
- [x] Use `returnPolicyUrl + '#policy'` in the organization definition and the offer reference; preserve locale/country routing.
- [ ] Run focused tests, the full suite, TypeScript and targeted formatting; review and open a PR without merging to main.

## Boundaries

Do not invent brands, reviews, ratings, shipping prices or preparation times. Catalog samples have an unreliable manufacturer value `s`; only use their validated GTIN identity. The identifier registry contains 4,929 GTIN entries; legacy variants such as Catan Duelo must be resolved through `catalog_variant_identifiers`, not their legacy canonical keys.

Shipping costs depend on destination, shipment weight and method. Google currently supports subnational shipping regions only for US/AU/JP and postal regions only for AU/CA/US. Declaring one Spanish price would contradict checkout. Leave this warning documented pending accurate Merchant Center shipping settings or a verified supported representation.

## Review focus

Ensure the selected variant identity matches the displayed offer; reject invalid GTIN checksums and supplier SKUs; keep the product available when Supabase fails; preserve existing localized policy URLs; do not expose private catalog fields. Missing reviews remain expected until real customer reviews exist.
