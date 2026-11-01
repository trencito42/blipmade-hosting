# 06 · Test evidence

Environment: VM 103, Node 22, a disposable PostgreSQL 17 and Redis 7 in Docker (`bmci-pg`, `bmci-redis`, ports on 127.0.0.1 only), database `blipmade_test`, schema built by `prisma migrate deploy` (so the 41 migrations, including the two new ones, were applied to an empty database). Nothing ran against the live database.

| Check | Result |
|---|---|
| Baseline at `5a9bf845`: API suite | 1246 passed, **7 failed** (domain-routing, email-design ×2, notification-template-wiring ×3, script-pipe-safety), as the audit said |
| Final API suite (`npx vitest run`) | **142 files passed, 1 skipped; 1303 tests passed, 6 skipped, 0 failed** (747 s) |
| API typecheck (`tsc -p tsconfig.test.json`) | passed |
| Web typecheck + production build (`npm run build`) | passed, 164 pages prerendered |
| Web unit tests (`npm test`) | 376 passed, 2 skipped, 0 failed (1 failure on `main` fixed) |
| `npm audit --omit=dev`, web | 0 vulnerabilities |
| `npm audit --omit=dev`, api | **10 vulnerabilities (6 high)**, all need a major upgrade, not applied |
| Secret scan of the diff (pattern scan for Stripe, AWS, GitHub, Slack keys, private keys, Proxmox tokens) | nothing found. No dedicated scanner (gitleaks) is installed on the machines |
| Playwright | **not run** |

New tests: `settings-registry` (14), `pinned-tls` (5), `vps-allocator` (9), `vps-plan` (14), `vps-lifecycle` (5), `backup-sweep` (3); `phase2-access-control` was adapted to a registered key.

## Real versus mocked
- REAL: PostgreSQL (migrations, advisory lock, transactions, concurrency of 8 orders), the HTTP stack and RBAC through Fastify, a real TLS server with a self-signed certificate for the pin, the real worker code.
- MOCKED: Proxmox (an in-memory fake), Stripe's `updateSubscriptionAmount`, the Pterodactyl panel in the sweep test.
- NOT VERIFIED: a real Proxmox with the pin (checked after the deploy, see below), a real Stripe subscription update, real backups and restores, the browser rendering of the new admin controls.

The final change (commit `0dee9fc`, the report says when the token cannot list the pool) came after the full run. `vps-allocator.test.ts` (10 tests) and the API typecheck were run again and pass; the full suite was not run a third time.

## Second round
| Check | Result |
|---|---|
| Final API suite, isolated from the real backup directory | **147 files: 146 passed, 1 skipped; 1345 tests passed, 6 skipped, 0 failed** |
| Web | typecheck, 376 tests passed, production build with 164 pages prerendered |
| New tests | `product-editor` (15), `pricing-admin` (9), `email-admin` (9), `content` (9) |
| Mail tests on nodemailer 10 | 20 files, 253 tests passed |
| Real restore drill of the offsite copy | **PASS**: the newest copy was read from the Storage Box, decrypted with age and restored into a scratch database that matched the live one (57 tables, 7 users, 75 products, 42 migrations). The live database was not written to. A first run against a copy made 4 minutes before a migration correctly reported a mismatch |
| Live after the second deploy | 43 migrations applied, api, worker and web healthy; `GET /api/content` answers `{"content":{}}`; home page 200; SMTP of the live relay verified from the new container with nodemailer 10.3.1 (connected and authenticated, nothing sent); all 51 published products pass the readiness check |
| Still not verified | the new screens in a browser, Playwright, a real card payment of a VPS, a real Stripe plan change, the customer backups and the VPS backups |

## After the first deploy (live, 2026-11-01)
| Check | Result |
|---|---|
| Backup before the change | `pg_dump` custom format on VM 103 (`~/pre-overhaul-20261101T171214Z.dump`), `.env` copy `.env.bak-20261101T171214Z-before-overhaul`, rollback images `blipmade-{api,worker,web}:before-overhaul-20261101T171214Z` |
| Migrations on the live database | 41 applied, data intact (7 users, 12 orders, 75 products, 8 payments, 9 invoices, 5 instances). The one "failed migration" counted by the script is the old rolled-back `20261030090000_promotion_card_identity`, unrelated to this release |
| Ledger backfill | slots 1 and 2 `IN_USE`, both linked to their services |
| Containers | api, worker and web healthy after the restart |
| Proxmox with the pin, from the live API container | the connection is accepted by TLS and Proxmox answers; with a wrong fingerprint the connection is refused (`not the pinned one`); with no fingerprint the platform refuses (`not pinned`) |
| Live allocation report | 2 services, 0 orphans, 0 missing, 0 unledgered, capacity 2 of 150 |
| Public site | home and docs answer 200; the Terms page serves the new backup wording |
| NOT verified live | the token `bmapi@pve!provision` lacks `Pool.Audit` on `/pool/vps`, so the pool cannot be listed and orphans and strangers cannot be found (see 07); no VPS was ordered, planned, changed or deleted live; no Stripe call was made; the admin screens were not opened in a browser |
