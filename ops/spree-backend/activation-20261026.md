# Activation verified on 26 October 2026

- Frontend code: `34faae7b576f22d89c4848c51fefcdfcb18e60f2`; backend hardening
  on main: `1aeaeacac41cd2e07b2205f7489cb2d6279a0bfc`.
- Backend production: `dpl_Cs5cBV8SE8CMHSdd7kGGZb2LURQT`, image built and
  published successfully, including the native Ruby operation tests.
- Frontend production: `dpl_FvXgxSEGndaQAMAgcMqrRcVNwFus`, build and publication
  verified Ready. One preceding frontend build failed because a route config
  was incompatible with Cache Components; it was removed before the retry.
- 925 frontend tests, TypeScript, formatting checks and operational Node tests
  passed. Ruby syntax/offline behavior was also checked locally with official
  Ruby 3.4 WASI; actual native Ruby checks ran in the backend build.
- Existing live Stripe keys and existing frontend signing secret were preserved.
  The frontend verified account BisonTCG and charge readiness; native connection
  returned `connected:true`. Native gateway `pm_gbHJdmfrXB` is active. The
  backend-only external ledger is `pm_UkLWZg9DAJ`.
- Stripe independently lists both expected enabled endpoints: the original
  frontend reconciliation endpoint and the native backend endpoint. The owned
  native database contains one native Stripe webhook signing key.
- A recipient-free, empty guest cart returned 201 and exposed only the real
  Stripe method. Real Store API attempts to select the hidden internal ledger
  through both payments and payment sessions returned 422
  `payment_method_unavailable`. A caller-selected amount differing from the
  authoritative cart returned 422 `gateway_error` before any Stripe intent was
  created. The diagnostic cart was then removed through native Store API.
- A dedicated native reconciliation key has only `write_orders`,
  `write_payments`, and `read_settings`. A real authenticated GET of owned Admin
  orders returned 200. Private keys were transferred directly from Vault into
  Vercel and never printed or committed.
- Gmail OAuth refresh succeeded. The exact four-event storefront email endpoint
  is active, its signed recipient-free probe returned 200, and an authenticated
  real drain returned 200 with zero eligible work. No email or charge was sent
  as a test, and no legacy customer was recreated.
- Conditional cron `bison-transactional-mail-tick` is active every minute;
  successful idle runs report `0 rows`, making no Vercel request. Native payment
  webhooks are handled independently of email availability. Both Vercel daemons
  are verified at zero running instances. Devir returned to every five minutes.
- Physical inventory remains exactly six Spanish Tarkir Dragonstorm displays,
  EAN `5010996290557`; every other physical quantity is zero. The public product
  was verified as Disponible, €129.50, with Add to cart enabled.
- Latest billing snapshot: $2.97 of $20 included infrastructure credit, $0
  additional usage, existing $1 additional-spend budget with Pause enabled.
  This is a delayed usage snapshot, separate from the fixed Pro subscription.

Remaining migration work is explicit: the three original customer accounts are
absent from both available databases and Stripe; original shipping coverage and
checkout rates are absent (zero native shipping methods/markets), so a complete
purchase was not verified. The active supplier cycle still had 595 product jobs
pending, one processing and 17 held errors at the final snapshot; catalog
recovery continues at its bounded existing cadence. No shipping prices, customer
identities, additional stock, or replacement tax rules were invented.
