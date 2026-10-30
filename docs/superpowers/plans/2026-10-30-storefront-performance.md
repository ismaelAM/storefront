# Storefront performance implementation plan

> Execute inline, then request one independent whole-branch review.

Goal: reduce storefront waits while preserving the published Puck layout, Spree pricing, stock and customer cache isolation.

Evidence: home sends 100 products including variants for twelve visible catalog cards; Puck images bypass Next image resizing; frontend executes in iad1 while the backend is in dub1. Product and category Puck templates make uncached database reads. Product SEO and body use different expansion keys.

- [x] Test and implement a Puck-aware home catalog request budget. Unfiltered grids request their maximum visible count; filters preserve the previous 100-item pool and variant-dependent selections keep variants. Traverse slots/zones. Load Puck concurrently with merchandising.
- [x] Use the existing tagged page cache for product/category templates, preserving editor invalidation and fallback behavior. Share product SEO/body expansion references, including primary media.
- [x] Enable normal Next image optimization on Puck product pictures, retain scoped image hosts; place frontend functions in dub1. No worker activation or inventory caching changes.
- [ ] Run the full unit suite, TypeScript and production build; review, commit and open a task-specific PR. Deploy once and verify home/category/product images, prices, links and response payloads.

Review focus: editor filters selecting later products; nested blocks; customer-specific pricing; image host rejection; transient database errors must not cache fallback data. User has delegated implementation and deployment decisions; continue without another design confirmation. Keep main untouched.

Validation before release: 1152 tests / 112 files passed; pnpm exec tsc --noEmit passed. Local Next compilation is blocked by an SWC Rust stacker assertion while transpiling the unchanged next.config.ts, before application compilation; remote Vercel build remains the release gate. Independent review found no critical/important defects. Minor deferred: page-cache.test.ts tests tag/fallback behavior but does not exercise Next remote cache transport; verify published behavior after deployment. Existing VM supplier tests now inject the real isExcludedCatalogLanguage helper (23 missing-global failures from the preceding language-exclusion change resolved without changing runtime supplier behavior).
