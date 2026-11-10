# Transfer budget implementation plan

**Goal:** reduce repeated image transfers and catalog work while preserving native checkout, stock, prices, twelve daily offers and Madrid's 05:00 offer date.

**Architecture:** retain the existing Next Image cache and supplier sync. Extend image reuse; filter ineligible supplier rows before pagination. Do not add paid services or bypass Supabase's quota restrictions.

**Scope:** existing task branch; no merge to main. Group changes and verify locally before one worker release. The frontend build is blocked by Supabase HTTP402; do not repeat an unchanged failed build.

## Tasks

- [x] Cache optimized web images for seven days instead of Next's four-hour default. Use quality75 consistently for product gallery and zoom. Image replacement must use a new URL.
- [x] Share a bounded, request-scoped photo reader across the four social slides, preserving DNS pinning, origin checks, redirect checks, byte and pixel limits. Reuse repeated photos and logos, but never share data between preparations. Add RED/GREEN tests for repeated URLs, failures and separate preparations. Reduce JPEG quality from90 to82, keeping1080x1350 and4:4:4; version the immutable artwork path.
- [x] Filter supplier refresh rows with disabled fulfillment or rejected products before pagination. Avoid redundant status writes while retaining fresh aggregate preorder flags, transitions and channel repair. Verify with actual call/query contracts.
- [x] Recover from an explicit HTTP402 inside the Puck cache boundary using the four actual published page documents captured from the source database. Successful live reads remain authoritative; other transient errors still reject. Unknown pages use their normal fallback. Check hourly instead of every10minutes; editor publication still invalidates its page tag immediately.
- [x] Review the combined diff, run full Vitest and TypeScript, commit to the existing review branch, release the worker once and compare retrieved code to the tested files.

## Verification and limits

No manual cron, Instagram post, purchase, backend warming or paid upgrade. Use metadata to verify releases. Request-count savings can be proven by tests; financial savings require a later complete billing period. The six hourly pg_net responses inspected before this release were HTTP402; the published-content recovery addresses that frontend build blocker while leaving the provider restriction intact. Published Puck pages total about5.5KB and are not a demonstrated bulk-image cause.

Execution notes: image requests were deduplicated with a request-local sixteen-entry cap; no historical signature is used as proof that Spree still has an image. Product status no-ops use a fresh GET instead of PATCH because variant writes may change aggregate preorder flags. Puck recovery was added to remove the demonstrated frontend build blocker, not as a claim that these small documents caused the bulk of egress.

Validation: 123 files / 1297 tests pass; TypeScript and diff check pass. Independent static review found no P1/P2. Release verified: frontend fd761dc53f08924e912c8b49d2d773cc29eb3f8e / dpl_FeT9rz7nuBEZ3PpftpAi3WABp7EG READY, both public domains assigned; worker164 ACTIVE and retrieved code matches. Initial scoped frontend error/fatal query returned no logs; no synthetic traffic was generated.
