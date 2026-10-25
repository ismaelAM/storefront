# Reduce runtime cost without changing commerce

> **For agentic workers:** Use superpowers:executing-plans to implement and verify each task in this session.

**Goal:** Reduce avoidable Rails boots, job-worker memory/connections and repeated Puck reads while retaining Vercel + Supabase Free.

**Architecture:** Keep Next.js, Spree 5.6.1 and durable Solid Queue. Use the locked Solid Queue 1.5.0 async supervisor in the separate 1 GiB daemon, one job thread, slower idle polling, and a bounded shared pool. Cache published Puck data independently of customer-specific commerce and invalidate after successful publishing.

**Tech Stack:** Existing Ruby/Rails, Solid Queue 1.5.0, Next.js 16.2.11 and Supabase. No dependency upgrades.

**Spec:** The user's request to optimize the current migration; investigation and constraints below.

## Global constraints and evidence

- Work from `de141ac` in `perf/free-tier-runtime`; no automatic merge to main or paid subscription.
- Current startup runs two full Rails commands before starting Rails. Both validation checks must move into the same runtime boot, not disappear.
- The pinned starter has a 0.1-second worker poll and forks supervisor, worker, dispatcher and scheduler. JOB_THREADS=1 alone does not bound aggregate memory or connections.
- Supabase session pooler previously rejected clients at 15. New web pool 3, shared worker pool 8; overlapping/autoscaled web instances still require live validation.
- Puck readers query Supabase on each render. Commerce already has locale/customer/channel-aware caching; leave it unchanged.
- Source DB ~178 MB; destination ~75 MB; incomplete media ~27 MB. No evidence to remove upstream indexes or buy database compute.
- Vercel backend logs currently return 403. Do not claim measured CPU savings or successful production deployment from local checks.

## Review focus

- Wrong effective database or pending migrations must prevent web/jobs from serving.
- Initialization and one-shot recovery still need to run migrations intentionally.
- The worker must retain all queues and recurring checkout/cleanup jobs.
- Failed publication must not invalidate cached content; failed reads must not become cached fallback pages.
- Cache published composition only, without changing per-customer prices, physical stock or 2–3-day preparation rules.

## Tasks

- [x] Add executable startup/worker regression tests; watch unnecessary Rails invocations fail. Move effective-target and pending-migration guards into a role-gated initializer; start each runtime once.
- [x] Exercise rendered queue/database configuration. Set async supervisor, one job thread, worker polling 2s, dispatcher polling 5s, shared pool 8 and web pool 3. Keep recurring schedules and queue ordering/catch-all. Ship the updated runtime config in both containers.
- [x] Cache `getSitePageData` published data for ten minutes with per-page tags; share it with home. Invalidate immediately after successful server-action and API publishing. Test success, auth/error paths, missing data and read failure recovery.
- [x] Run all application/operational tests, TypeScript and production cache replay. Independently review the complete diff, fix the harness root-loop finding and record deployment limitations. Publish through the existing draft migration PR without merging main.

## Verification and review ledger

- 902 application tests pass; 42 operational tests pass with Ruby 3.4.7 and no skips; TypeScript and changed-file TypeScript Biome pass.
- Ten production cache/PPR replay cases pass with each bundler. The actual reader and HTTP publication code are copied into an isolated Next fixture; a local HTTP server models only the external Supabase boundary.
- The local environment lacked Ruby and `/proc`; Ruby 3.4.7 was built in scratch, and a local-only memory-telemetry shim allowed Next builds. The corrupt local SWC binary was restored from the official exact-version archive after SHA512 verification. No project dependency changes.
- Independent whole-diff review found no critical/important production issue. It identified a test-harness common-ancestor loop that could hang when dependencies are in another top-level directory. A bounded VM execution of the actual loop reproduced the timeout; adding a filesystem-root stop fixes it. Root, sibling, identical and nested paths are checked separately.
- Live container Ruby 4.0.1, effective deployed layers, RSS/CPU/throughput, connection contention/autoscaling, remote Vercel cache, S3, Store API and checkout remain deployment verification tasks. Local checks do not establish those outcomes. Both public endpoints returned HTTP 402 on 25 October; logs API returned 403. No subscription changes, production cutover or daemon activation.
