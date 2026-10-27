# Migration verification on 27 October 2026

- Shipping restoration code on main: `a95c025e0d302b55a9383c6f47e51430bb2b1f70`.
  Backend production `dpl_F4E2AEVQ2QYdqHQFm2XhboBTfWmr` became Ready in
  1m 1s. The private native operation created 22 shipping methods and four
  province zones. A second call created zero rows. Readback confirmed 66
  physical-category associations and no shipping tax category.
- Created native default market España, EUR, locale es, country ES and
  tax-inclusive prices through the Admin API. Invalidated only market cache
  tags; no storefront deployment was needed.
- Public checkout for one physical Tarkir display showed €129.50 + Madrid
  €4.99 = €134.49 and Stripe BisonTCG. Stripe independently returned an unpaid
  EUR intent for 13449 cents, with amount_received=0. No card, terms acceptance
  or payment submission was made. Initial loading had also created a separate
  unpaid intent for 12950 cents. Both require a payment method; no charge exists.
- A second native guest cart used an existing purchasable variant with its
  existing 1.50 kg weight. Madrid offered €4.99 local and €17.10 Correos;
  Barcelona offered only €17.10 Correos, Palma only €21.80, and Las Palmas
  only €30.70. Native totals were €32.49, €44.60, €49.30 and €58.20, with
  no added shipping tax. These quotes do not certify the supplier's weight.
- Removed exactly the two diagnostic carts through native Store API, both
  returning 204. The pre-existing third cart was preserved. Native cancellation
  unexpectedly restocked their never-deducted inventory. Native Admin updates
  corrected only the two affected rows: Tarkir 7→6, other product 1→0. Neither
  cart completed and no customer, payment, reservation or actual shipment was
  placed. See `shipping-restoration.md` for the regression and callback guard.
- Inventory guard commit `114abd900f1df1b3059aa0d5205943cb46547410` deployed
  as production `dpl_84jc481iiPxM12kyAMk42YH5dgkb`, Ready in 1m 7s with
  the stable backend alias assigned. The container ran the native Ruby checks.
  Local regression first failed without the guard, then passed with it; TypeScript
  and five operational Node checks passed (four native-Ruby Node checks skipped
  locally because no native Ruby binary is installed). Independent review found
  no blocker. No frontend build was performed.
- After that deployment, one new native diagnostic cart contained both an
  on-hand Tarkir and a backordered variant. Native inventory units confirmed
  one of each state. Create returned 201 and deletion returned 204; stock stayed
  exactly 6 and 0, with no new stock movement. All diagnostic inventory units
  were gone, native payments remained zero, and the original cart was untouched.
- Sent exactly one authenticated application order-confirmation email probe
  to the verified shop mailbox. Subject contains
  `PRUEBA-MIGRACION-SIN-PEDIDO-NI-COBRO-20261027`; its item text explicitly says
  there is no order, payment, reservation or shipment. The existing signed
  storefront webhook returned 200, handled=true. Gmail readback confirmed the
  message in INBOX. This proves application email delivery, not a completed
  paid purchase or the complete native-event pipeline.
- Resumed the paused Devir cycle `e671f24d-acb7-4c59-b06a-30b618467423`
  conditionally after category completion and lock expiry. One existing bounded
  tick returned 200 and processed four products. Snapshot: 276 categories done,
  436 products done, 592 pending, 17 held errors; config phase products with no
  last_error. Known sampled errors are supplier HTTP 404s and remain held.
  The 09:00 scheduled tick succeeded; no new recovery daemon was enabled.
- Supplier cron remains every 30 minutes. Conditional payment/mail cron remains
  every minute, with successful idle runs returning 0 rows and pending=false,
  causing no Vercel request. Both versioned daemon instance counts remain zero.
- Latest observed team usage: $3.73 of $20 included infrastructure credit,
  credits applied -$3.73, subscription $20, total $20; additional usage $0.
  Dashboard data may lag up to one hour. This snapshot predates the inventory
  guard deployment and cannot establish its later spending rate.

Remaining: the physical Tarkir variant has weight zero in all recovered data,
so Correos cannot quote it outside Madrid until reliable weight is supplied.
The three original customer accounts are absent from both databases, Stripe
and the targeted export search; their original export/backup is still needed.
The supplier backlog is not complete. Portugal's former amount was not
recoverable; Ceuta/Melilla remain outside the restored coverage. BISON3 local
free delivery and automatic Correos labels/collection are still pending as
documented in `SHIPPING.md`. Do not describe the migration or a paid purchase
as fully verified.
