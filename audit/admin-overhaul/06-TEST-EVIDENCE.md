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

## After the deploy
Filled in at the end of this file by the deploy step.
