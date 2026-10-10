# Madrid delivery and store logo Implementation Plan

> **For agentic workers:** Use native execution in this session; user explicitly asks to continue without questions. Review the final branch independently before integration.

**Goal:** Local Madrid delivery €4.99, approved BISON3 accounts free only for that method, and the merchant's uploaded logo on storefront and checkout.

**Architecture:** Spree owns shipping charges and eligibility. A shared server logo reads native branding with a configured public-image fallback; the checkout client shell receives the rendered logo.

**Tech Stack:** Spree Admin/Store APIs, Next.js, Vitest.

**Spec:** Owner's request in this session; shipping constraints recorded in SHIPPING.md.

## Global Constraints

- Free delivery only for local Madrid and approved BISON3 accounts.
- Preserve Correos rates and pricing approval/revocation.
- No purchases, external messages, or broader credentials.
- Never represent a frontend-only discount as a Spree charge.

## Review Focus

- Global FreeShipping would also discount Correos: leave it inactive without a native scope.
- Branding API unavailable: keep the merchant's configured image.
- No valid image: show store name, never the Spree demo logo.
- No Admin response/key in the client bundle.
- Preserve checkout context, payment and cart behavior.

## Tasks

- [x] Save/read back local Madrid FlatRate4.99 in Spree.
- [x] Inspect installed promotion rules/actions. No scoped native shipping action found.
- [ ] Implement/prove scoped BISON3 backend eligibility before activation; currently blocked by installed capabilities. Keep prepared promotion inactive.
- [x] Write failing branding regressions; implement cachedGetStoreLogo in src/lib/data/store-logo.ts and shared StoreLogo in src/components/layout/StoreLogo.tsx.
- [x] Reuse StoreLogo in Header and pass it to CheckoutLayoutClient; configure public fallback.
- [x] Run full628-test suite, TypeScript and locale parity.
- [ ] Review, publish, check CI/deployment, and visually verify home/checkout and Madrid4.99.
