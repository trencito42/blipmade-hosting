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

## Production deploy — 2026-11-06T09:15Z

Authorized deploy of `76cacd75` (images). Host git later `f7bc9c85` for `apply-migrations.sh` owner URL + `CHECK_MIGRATIONS=false`. Enum `INFRA`/`PVE` applied as DB owner after API-role P3018. Smoke: 75 products, 0 orderable. Flags remain false.

## Post-deploy verification — 2026-11-06T10:21Z

### Admin 3.0 (Priority 1)

- Health API: `GET /api/ops/health` (not `/api/admin/ops`).
- Browser `/login` loads. Staff login with `.env` `ADMIN_EMAIL`/`ADMIN_PASSWORD`: **fail** (`Email or password is incorrect.`). One API 401 on localhost:3100. No further attempts.
- Unauthenticated: `/api/ops/health` and `/api/admin/backups/health` **401** (expected). `/api/admin/ops/backups` and `/api/admin/ops/errors` **401**.
- Authenticated click-through of `/admin/ops`, `/admin/ops/backups`, `/admin/ops/errors`: **UNVERIFIED** until the owner supplies a working staff password or session.

### GlitchTip (Priority 2)

- DSN set on API (len 62). `VITE_SENTRY_DSN` set. One web asset mentions `errors.blipmade.com`.
- `GLITCHTIP_AUTH_TOKEN` / `GLITCHTIP_ORG` / `GLITCHTIP_PROJECT` unset. Admin issue list incomplete.
- GlitchTip Postgres (observability VM), counts only: `issue_events_issue` **30** (`blipmade-backend` 19, `blipmade-web` 11). Events in `issue_events_issueevent_20261106`: **1**. Ingestion exists; titles not copied.
- No synthetic error sent.

Owner token setup (least privilege for Admin list): sign in at `https://errors.blipmade.com` → Profile → Auth Tokens → create a token with **`event:read`**, **`project:read`**, **`org:read`**. Put it in `.env` as `GLITCHTIP_AUTH_TOKEN`, plus `GLITCHTIP_URL=https://errors.blipmade.com`, `GLITCHTIP_ORG=<org slug>`, `GLITCHTIP_PROJECT=<project slug>`. Recreate api (needs a later authorized deploy). A DSN is not this token.

### Storage Box (Priority 3)

| Path | Evidence |
|---|---|
| `infra/` | **missing**. Weekly timer `Sun 03:30` next 2026-11-08. Journal empty. Default VMIDs 100,102–105. |
| `pve/` | 2 files, 3742 B, 2026-11-06 |
| `platform/` | 6 files, 8 657 061 B; newest 2 511 157 B `…T022044Z.tar.gz.age` |
| `vps/vm1001` | 431 867 754 B, 2026-11-01 |
| `vps/vm1002` | 459 985 802 B, 2026-11-02 |
| `customers/games-node-01` | 7 files, 994 392 823 B; newest 2026-11-06 |
| `databases/…/s261_muratura` | 6 files, 942 875 B; newest 2026-11-06 |
| Box used | 1 897 005 056 / 1 099 511 627 776 bytes (~0.17%) |

Encryption: `age` recipient `age10qn5sgtz…`. Identity file exists on **vm103 only** (184 B, 0600). Not on the hypervisor. Drill: `blipmade-offsite-agent drill platform/blipmade-platform/blipmade-scheduled-20261106T022044Z.tar.gz.age <identity>` on an isolated host that **already** has the identity. Do not copy the identity onto more production machines. Drill posts `restore-verified` — do not run until authorized. Full VM restore not done.

Unprotected vs INFRA vzdump: Mailcow (VM104), panel (VM100), observability (VM105), proxy (VM102), platform disk (VM103) wait on first infra job. Wings/game files have customer+DB copies. VM101 excluded from INFRA by design.

### Mail :443 (Priority 4)

`mail.blipmade.com` A **193.34.214.20** is the **hypervisor** address (`n7030e1`). Host has **no** listener on :443 → hypervisor `Connection refused`. Proxy to public A: **timeout**. vm103 split-horizon **10.77.0.14** (VM104): TCP 443 ok, HTTPS **200**. Mail VM listens 80/443. **Hairpin/wrong public IP**, not Mailcow down. No network change.

### Remaining BM (Priority 5)

- **BM-003** `DATA_ENCRYPTION_SECRET` still unset. Dual-read code deployed. No key generated. No reencrypt.
- **BM-004** live egg 16 `python generic` still `done="change this part"`. Git `pterodactyl-eggs/python.json` is `"Python "`. Egg 84 already `"Python "`. Panel write not done.
- **onboot** 100–105 and 1001–1002 = 1. Running API `vps.js` `onboot: 1`.
- **BM-005** VM103 disk **72%**.
- **BM-012** `STRIPE_TAX_ENABLED` missing (off). Payments remain false.
- **BM-016** capacity gate is in this SHA; not load-tested this pass.

Payments and mail sales: **false**.

