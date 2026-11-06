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

**Owner 2026-11-06:** both paid charges and all 9 active subscriptions are **the operator’s own development tests**. There are no paying customers. Do not treat them as unidentified customer billing. Do not cancel them in this work; the owner handles them separately.

**Not done:** cancel/pause those 9 test subscriptions (owner will).

**Code (not in production until deploy):** `catalogSalesContext()` marks paid SKUs not orderable when checkout is off; `/apps` copy when count is 0; `scripts/disable-live-checkout.sh`. Tests: `api/tests/availability-sales.test.ts`.

**Acceptance:** new Checkout 503 VERIFIED. UI honesty for remaining SKUs BLOCKED on deploy.

**Rollback:** restore `.env` from the backup file, set both flags true, recreate api+worker. Do not do that.

## Phase 2 / 3 — 2026-11-06T07:24Z

Reuse Storage Box + `blipmade-offsite-agent`. No RAID change. No PBS.

| Item | Result |
|---|---|
| PVE configs off-site | `pve/n7030e1/pve-config-20261106T072429Z.tar.gz.age` **3413 B verified** (hash after read-back). Daily timer. |
| Infra vzdump 100/102–105 | Weekly timer enabled. Not run this pass (large). VM101 excluded (file-level jobs exist). |
| Restore drill | Still needs age identity off-host. |
| onboot 100/1001/1002 | `onboot: 1` |
| vmbr2 TAP isolated | sysfs `isolated=1` on tap1001i0 and tap1002i0 |
| MariaDB VM101 | `127.0.0.1:3306` only |
| VM103 disk | 85% → **71%** after `docker builder prune --filter until=72h`; timer installed |
| Checkout | still `PAYMENTS_ENABLED=false` |
| Stripe test subs | left in place per owner |

## Ops Center 3.0 — 2026-11-06 (code, not deployed)

Reuse existing `/admin/ops`, `OffsiteBackup`, off-site agent, GlitchTip DSN. No second backup stack.

- `OffsiteKind` gained `INFRA` and `PVE` so agent reports stop 400.
- Missing backup/off-site/restore receipts are **unknown**, not ok.
- `/admin/backups/health` no longer turns `listNodes()` failure into `[]`.
- Coverage matrix + destination inventory (`fileCount` from `rsync --list-only`. Storage Box SSH has no `find`).
- GlitchTip list is server-side (`GLITCHTIP_AUTH_TOKEN`). DSN is never returned.
- Pages: `/admin/ops/backups`, `/admin/ops/errors`.
- Tests: `api/tests/ops-coverage.test.ts`, `web/e2e/admin-ops-center.spec.ts`.

**Not deployed.** Production still `8b07cd2d` until the owner says deploy.

