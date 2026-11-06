# 26 — Remediation log

Start: 2026-11-06. Production was `8b07cd2d`. Audit IDs unchanged.

## BM-002 / BM-015 / BM-018 — commercial containment (2026-11-06T07:11Z)

**Action (owner-authorized Phase 1):** `scripts/disable-live-checkout.sh` on VM103.

- Backup: `/opt/blipmade/.env.before-disable-checkout-20261106T071102Z`
- `.env`: `PAYMENTS_ENABLED=false`, `MAIL_SALES_ENABLED=false` (keys untouched)
- Recreated `api` + `worker` only. No `deploy.sh`. No RAID change.

**Process evidence:** `docker compose exec api` `PAYMENTS_ENABLED=false`, `MAIL_SALES_ENABLED=false`. Parsed `env.paymentsEnabled === false`, `MAIL_SALES_ENABLED === false`, `stripeMode === "live"`.

**Checkout:** in-container `createCheckout` and `createBillingPortal` → **503 `payments_unavailable`**. `paymentState().enabled === false`.

**Catalog (this SHA, before code deploy):** 75 products, **56 orderable** (was 59). Three EMAIL_HOSTING SKUs off via live `MAIL_SALES` getter. Remaining 56 still say DEPLOYABLE until the catalog-sales code is deployed.

**Stripe live account (read, then expire open sessions only):**

| Item | Count |
|---|---|
| Charges listed | 4 |
| Paid, not refunded | 2 (299 + 399 EUR cents, 2026-10-30) |
| Active subscriptions | 9 (will **renew**; flag does not cancel them) |
| Canceled subscriptions | 1 |
| Checkout sessions | 17 |
| Open sessions expired this pass | 1 (`cs_live_…`, 596 EUR cents) |
| Open remaining | 0 |

**Not done:** cancel/pause the 9 active Stripe subscriptions. That would stop existing customers. Owner decision.

**Code (not in production until deploy):** `catalogSalesContext()` marks paid SKUs not orderable when checkout is off; `/apps` copy when count is 0; `scripts/disable-live-checkout.sh`. Tests: `api/tests/availability-sales.test.ts`.

**Acceptance:** new Checkout 503 VERIFIED. UI honesty for remaining SKUs BLOCKED on deploy.

**Rollback:** restore `.env` from the backup file, set both flags true, recreate api+worker. Do not do that.
