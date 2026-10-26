# Existing Stripe connection

The storefront already creates and verifies live PaymentIntents using its
existing private Vercel credentials. `STRIPE_WEBHOOK_SECRET` and the existing
`/api/payments/stripe/webhook` remain unchanged.

The fixed authenticated `/internal/bison-payment/prepare` operation creates a
backend-only Check ledger for externally verified payments and a dedicated
native key with `write_orders`, `write_payments`, and `read_settings`. Its raw
token goes directly to private Vault (`spree_owned_payment_bot_20261026`), never
to an HTTP response. Copy it privately into the production frontend
`SPREE_ADMIN_API_KEY` and set `SPREE_STRIPE_EXTERNAL_PAYMENT_METHOD_ID` to the
returned method ID. Do not widen the supplier key.

After the coordinated storefront deployment, authenticated POST `{}` to
`/api/internal/migration-readiness` verifies the existing key belongs to live
BisonTCG account `acct_1UDiVZHU3Etzdhlg`, then forwards the existing key pair only
to the fixed owned backend. The native operation validates and saves an
official `SpreeStripe::Gateway`, registers its native signed webhook, and
activates it only after its signing key exists. Native webhook URLs point to
the backend host, while normal storefront payments keep using the existing
frontend webhook. Native-session intents without a storefront cart link are
acknowledged by the frontend and handled by the native webhook.

Native session creation and updates reject EUR amounts above €500 before
contacting Stripe. Those orders use normal checkout, which preserves the
existing manual authorization/review rule. The same bounded HTTP processor
dispatches and executes only owned native payment-webhook jobs, independently
of whether the email endpoint is active; no permanent worker is enabled.

These operations never create or confirm a payment, capture funds, refund,
create a customer, or change tax calculation. No Stripe Tax calculator is added.
The internal ledger stays hidden from public checkout. Repeated setup is
idempotent and rejects inconsistent existing credentials/methods instead of
overwriting them. Requests are fixed-purpose, private, target guarded, and
silence sensitive SQL logs.

GET on the protected frontend readiness route checks Stripe account/charge
readiness and refreshes the existing Gmail OAuth grant without sending email.
It returns only status booleans, never provider responses, keys or access tokens.

Physical stock confirmed by the owner on 2026-10-26: six Spanish Tarkir
Dragonstorm Play Booster displays (30 packs), EAN `5010996290557`, native
variant `variant_4a5iOlu6p4`. All other physical quantities remain zero. Current
gross-price calculation is preserved. Legacy customers are absent from both
available databases and the connected Stripe customer list; no customer
identities are reconstructed from guesses.
