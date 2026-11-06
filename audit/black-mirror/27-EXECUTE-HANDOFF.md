# 27 — Execute remaining remediation handoff

Date: 2026-11-06. Owner authorized production deploy and migrations.

## Release

| Item | Value |
|---|---|
| Git commit / production SHA | `729e2d22eac36bec2acf7d01628cd35ec59f6ec8` |
| Previous production git | `f7bc9c855c5ba4c7a5a1daea3cc9c6abdd468011` |
| Deploy | VM103 `/opt/blipmade` `scripts/deploy.sh`, pinned `origin/main` |
| Rollback images | `blipmade-{api,web,worker}:before-729e2d22e` |

## What landed

- CI unit failures: Stripe tests now inject `setStripeClient` (vitest never replaced `stripe` ESM). Mail tests read `MAIL_*` from `process.env`. Deploy Studio category `VPS`; GAMES quotes use the resource card (349 for 1 GiB / 1 CPU / 5 GB). `run-tests.sh` unsets `PAYMENTS_ENABLED` so tests can turn checkout on.
- Resume of a subscription no longer maps every Stripe error to “already ended”; only `resource_missing`.
- Prisma `20261106140000` then `20261106150000` applied on production after isolated clone deploy succeeded. Duplicate rolled_back+applied `20261106120000` rows left in place. Enum `INFRA`/`PVE` already present. Not re-run.
- Offsite agent `27a8992f…` installed on hypervisor, VM103, VM101. Drill still reports decrypt, not restore.
- Egg 16 `done` matcher set to `"Python "` (BM-004). Zero servers on that egg.

## Tests (local, this pass)

- API `vitest run --reporter=verbose --bail=1`: **216 files passed, 2 skipped, 1863 tests passed, 7 skipped**. ~20.5 min.
- Web `node --test`: **513 passed, 3 skipped, 0 failed**.
- `tsc -p tsconfig.test.json`: pass after mail test env assignment.
- GitHub Actions CI **#779** for `729e2d22` was **still in progress** when this file was written. Do not treat GH as green until that run finishes.

## Production checks after deploy

- API/web/worker: healthy. `/api/health` 200, database+redis true. Stripe keys present; `PAYMENTS_ENABLED=false`; `MAIL_SALES_ENABLED=false`. Catalog **75 products, 0 orderable**. Smoke pages 200.
- Three historical drill rows: `isolatedRestore=false`, `decryptVerifiedAt` filled from the 150000 copy, `restoreVerifiedAt` kept. AuditLog count for those drill notes: 3.
- No API/worker error lines in the first 20 minutes of logs.

## Backups

- Pre-deploy dump `c3519205…` 2 707 134 B gzip-tested on VM103, copied to hypervisor `/root/pre-deploy-729e2d22-20261106T115213Z.sql.gz`, age-encrypted and **read-back verified** on Storage Box as `platform/n7030e1/pre-deploy-729e2d22.sql.gz.age` (sha `7d3219db…`).
- Isolated Postgres restore of that dump into `blipmade_restore_iso_test`: User/Order/OffsiteBackup/AuditLog counts **12/20/21/839** matched live, then the test database was dropped. Role `blipmade_app` is missing on the restore host; GRANTs were skipped.
- Storage Box ~1.90 GiB / 1 TiB, 24 files after the extra dump. `infra/` still empty. Next INFRA timer **Sun 2026-11-08 03:31:43 UTC**. Controlled INFRA not started (live vzdump I/O on RAID 0).
- VM103 age identity **does not decrypt** Storage Box objects. Encrypt recipient prefix `age10qn5sgtz…` (env + hypervisor `recipient.txt`). VM103 identity prefix `age1v3rpdzrr…`. Owner Bitwarden identity already decrypted PVE. Do not copy or rotate keys. Drills on VM103 stay blocked until the operator installs the matching identity (Bitwarden), which this agent must not do.
- MariaDB / customer-file / VM isolated restores: **not done** (decrypt on VM103 failed). PVE archive listing still not done here.

## Black Mirror

| ID | State |
|---|---|
| BM-003 | Dual-read remains. `DATA_ENCRYPTION_SECRET` still empty. No rotation. |
| BM-004 | **Fixed** on live egg 16. |
| Mailcow public HTTPS | Internal 10.77.0.14 **200**. Public `mail.blipmade.com:443` from hypervisor **connection refused** (A record is hypervisor). DNS/proxy still wrong for the internet. |
| GlitchTip token | Unset. |
| Admin click-through | Still needs a working staff password reset. No brute force. |
| RAID 0 | Unchanged. |

## GO / NO-GO

- **Production ops GO** for the deployed SHA: health, checkout closed, migrations applied, rollback tags present.
- **Commercial GO: no** — payments and mail sales remain off by policy.
- **Full disaster recovery GO: no** — no INFRA copies, VM103 identity mismatch vs sealed archives, no isolated MariaDB/VM restore this pass. Host-loss still depends on Bitwarden identity + Sunday INFRA + Mailcow public DNS.

Next agent: wait for CI #779; owner-only identity alignment on VM103; Sunday INFRA; Mailcow public A/proxy; GlitchTip token; staff password reset; BM-003 migrate when a v2 key is chosen safely.
