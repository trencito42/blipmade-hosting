# 00 — Project inventory (factorial baseline)

**Subject:** the Blipmade hosting platform, as it exists in `/root/blipmade-work` and as it is deployed on VM 103.
**Date of the audit:** 2026-10-23.
**Method:** every number below was produced by a command on the working copy or on VM 103, and the command is given. Where a statement is about the running system, the command was run against the deployment.

> This document only states **what exists**. It does not judge whether it works and it does not judge whether it is documented correctly — that is `00-current-state.md` and `00-documentation-drift.md`.
> **No secret appears in this document.** Only the *names* of environment variables and whether they are set or empty are ever mentioned.

---

## 1. The working copy is not a Git repository

```
$ ls -d /root/blipmade-work/.git
ls: cannot access '/root/blipmade-work/.git': No such file or directory
```

The copy that was audited is a plain directory. The **deployment** on VM 103 *is* a Git working tree:

```
$ ssh -i /root/.ssh/blipmade_vm103 debian@10.77.0.13 'cd /opt/blipmade && git log --oneline -3'
7df3973 Note the time the gateway holds the typefaces and the limit of the browser
f370c87 Fix the clipped mobile layout and serve the typeface from the site
a0212b8 Complete the customer panel: session guard, catalog selector, settings, mail
```

Consequence for the audit: anything that depends on the *history* of the repository (the CI secret scan, which scans "the whole history", and the branch-protection setting) **cannot be checked from this copy** — see `00-documentation-drift.md`.

---

## 2. Directory map

```
/root/blipmade-work
├── api/                 Fastify 5 API + BullMQ worker + Prisma schema   (97 files)
│   ├── prisma/          schema.prisma, seed.ts, 10 migrations           (13 files)
│   ├── src/             application source (49 .ts files)
│   │   ├── routes/      12 HTTP route files
│   │   ├── lib/         12 helper modules
│   │   ├── services/    16 service modules (panel/, pterodactyl/, …)
│   │   └── plugins/     3 Fastify plugins
│   └── tests/           22 test files + 3 support files                (25 files)
├── web/                 React 19 + Vite SPA + its own Node server       (87 files)
│   ├── src/             69 .ts/.tsx + stylesheet                       (71 files)
│   ├── public/          static assets and the fonts folder             (2 files)
│   └── tests/           3 test files                                   (3 files)
├── panel-bridge/        PHP component that is installed on the panel    (6 files)
├── scripts/             operator runbooks + 46 exploration scripts      (57 files)
├── docs/                15 documents                                    (15 files)
├── .github/             dependabot.yml + 2 workflows                    (3 files)
├── screenshots/         45 PNG + index.json                             (46 files)
├── audit/               this audit (4 files + the briefing)
├── compose.yml          postgres + redis
├── compose.api.yml      api + worker
├── compose.web.yml      web
├── README.md            the operating manual
└── .gitignore
```

### 2.1 What lives in each directory

| Directory | Files | What it is | Counted detail |
|---|---|---|---|
| `api/` | 97 | The whole backend: HTTP API, background worker, database schema, test suite. | 49 `.ts` in `src/`, 25 in `tests/`, 13 in `prisma/`, 2 Docker/tsconfig at the root. |
| `api/src/` | 49 | Application source. | 6 top-level modules (`app.ts`, `index.ts`, `worker.ts`, `db.ts`, `redis.ts`, `env.ts`) + 12 routes + 12 lib + 16 services + 3 plugins. |
| `api/prisma/` | 13 | Schema, seed, migrations. | `schema.prisma` (31 models, 16 enums), `seed.ts`, `migration_lock.toml`, 10 migration folders = 13 files. |
| `api/tests/` | 25 | The test suite (vitest) + fixtures. | 22 `*.test.ts` + `globalSetup.ts`, `setup.ts`, `helpers.ts`. |
| `web/` | 87 | The single page application and the small server that serves it. | 71 in `src/`, 3 in `tests/`, 2 in `public/`, plus `server.mjs`, `fonts.mjs`, `Dockerfile`, `index.html`, config files. |
| `web/dist/` | 51 | A **build artefact** present in the audited copy but excluded from the file counts and from the image (the image builds it again). | 48 assets + `index.html` + `favicon.svg` + `fonts/`. |
| `panel-bridge/` | 6 | The PHP component that is **installed on the panel (VM 100)**, not on VM 103. | `BlipmadeKeyMintController.php`, `BlipmadeBridgeServiceProvider.php`, `config/blipmade_bridge.php`, `routes-snippet.php`, `install.sh`, `README.md`. |
| `scripts/` | 57 | Operational tooling. | 11 at the root (10 scripts + `README.md`) and 46 in `scripts/ops/`. |
| `docs/` | 15 | The documentation set (listed in §9). | — |
| `.github/` | 3 | CI. | `dependabot.yml`, `workflows/ci.yml`, `workflows/nightly-backup-drill.yml`. |
| `screenshots/` | 46 | Review artefacts. | 45 PNG (34 at the root, 3 in `audit/`, 8 in `review/`) + `index.json` (30 entries). |
| `audit/` | 5 | This audit. | `00-BRIEFING.md` + the four reports. |

**Repository total: 317 files** (excluding `node_modules/`, `.git/` and `dist/`):

```
$ find . -type f -not -path '*/node_modules/*' -not -path './.git/*' -not -path '*/dist/*' | wc -l
317
```

By extension: 87 `.ts`, 61 `.tsx`, 45 `.png`, 35 `.mjs`, 20 `.md`, 14 `.py`, 13 `.sh`, 10 `.sql`, 8 `.json`, 6 `.yml`, 4 `.php`, 2 `.svg`.

---

## 3. The three deployable units

| Unit | Language / runtime | Entry point | Build command | How it runs | Depends on |
|---|---|---|---|---|---|
| **api** | TypeScript → Node 22 (`fastify@5`) | `api/src/index.ts` → `api/dist/index.js` | `prisma generate && tsc -p tsconfig.json` (`api/package.json:11`) | Container `blipmade-api-1`, `node dist/index.js`, listens on `0.0.0.0:3100` (`compose.api.yml:2-14`) | PostgreSQL 17, Redis 7, the panel (via `extra_hosts` `panel.blipmade.com:10.77.0.10`, `compose.api.yml:11-12`), volumes `backup_data` + `upload_data` |
| **worker** | TypeScript → Node 22 (`bullmq@5`) | `api/src/worker.ts` → `api/dist/worker.js` | **the same image and the same build as `api`** (`compose.api.yml:35` builds `./api`) | Container `blipmade-worker-1`, `command: ["node","dist/worker.js"]` (`compose.api.yml:37`), own health port **3101** (`compose.api.yml:57`) | same as `api` (same `env_file`, same `extra_hosts`, same volumes) |
| **web** | TypeScript/React 19 + Vite 8, served by a plain Node server | `web/server.mjs` (`node server.mjs`, `web/package.json:10`); the SPA entry is `web/index.html` | `tsc --noEmit && vite build` (`web/package.json:8`) | Container `blipmade-web-1`, `SERVER_PORT=3000` (`compose.web.yml:8`), published on `10.77.0.13:3000` (`compose.web.yml:23`) | the `api` container over the Compose network (`API_URL: http://api:3100`, `compose.web.yml:11`) |
| **panel-bridge** (not a container) | PHP 8 + Laravel | `panel-bridge/BlipmadeKeyMintController.php`, registered by `panel-bridge/BlipmadeBridgeServiceProvider.php:31` | none — `install.sh` copies the files into the panel and registers a provider | as a route of the Pterodactyl panel on **VM 100** | the panel (Laravel cache for the nonce, the `Pterodactyl` client API for the key) |

### 3.1 Supporting services (not built from this repository)

| Service | Image | Bind | Source |
|---|---|---|---|
| `postgres` | `postgres:17-alpine` | `127.0.0.1:5432:5432` | `compose.yml:2-14` |
| `redis` | `redis:7-alpine` (`--appendonly yes`) | `127.0.0.1:6379:6379` | `compose.yml:21-28` |

Both are loopback-only, and all five containers run with `security_opt: no-new-privileges:true` and `cap_drop: ALL` (`compose.api.yml:23-26`, `compose.api.yml:51-54`, `compose.web.yml:24-27`).

### 3.2 The Compose network

```
$ docker network inspect blipmade_default --format '{{range .IPAM.Config}}{{.Subnet}}{{end}}'
172.18.0.0/16
worker=172.18.0.5  api=172.18.0.4  web=172.18.0.6  postgres=172.18.0.2  redis=172.18.0.3
```

This matters for the trust boundary: the API's default `TRUSTED_PROXIES` is `127.0.0.1,::1,172.16.0.0/12` (`api/src/env.ts:95`), and `172.18.0.0/16` is inside `172.16.0.0/12`, so the `web` container is a trusted proxy by default.

---

## 4. HTTP surface — counted from the running container

The route tree was taken from the **running** API, not from the source, so it is the truth of what is served:

```
$ ssh -i /root/.ssh/blipmade_vm103 debian@10.77.0.13 'cd /opt/blipmade && docker compose -f compose.yml -f compose.api.yml -f compose.web.yml exec -T api node -e "import(\"./dist/app.js\").then(async (m) => { const app = await m.buildApp(); console.log(app.printRoutes({ commonPrefix: false })); await app.close(); process.exit(0); })"'
```

| Measure | Value |
|---|---|
| Distinct route paths | **121** |
| Path+method pairs (HEAD excluded) | **144** |
| — of which under `/api` | **142** |
| — of which outside `/api` | 2 (`GET /health` at the root, and the `OPTIONS *` catch-all) |
| Method bindings including the automatic `HEAD` | **265** |
| Route files in `api/src/routes/` | **12** |
| Root-mounted paths (outside `/api`) | **1** (`/health`, the container health check, `api/src/app.ts:150`) |

### 4.1 Endpoints per area (from the running route tree)

| Area | Path+method pairs | Route file |
|---|---|---|
| instances (customer) + instance-server (per-server operations) | 57 | `routes/instances.ts`, `routes/instance-server.ts` |
| admin | 30 | `routes/admin.ts` |
| settings | 11 | `routes/settings.ts` |
| auth | 10 | `routes/auth.ts` |
| tickets | 8 | `routes/tickets.ts` |
| billing | 6 | `routes/billing.ts` |
| orders | 5 | `routes/orders.ts` |
| webhooks | 4 | `routes/webhooks.ts` |
| internal | 3 | `routes/auth.ts` (they live in the auth file, not in a separate one) |
| catalog | 3 | `routes/catalog.ts` |
| domains | 3 | `routes/domains.ts` |
| health + status | 2 | `routes/health.ts` |
| **total** | **144** | — |

The three internal routes are `POST /api/internal/prune-sessions`, `GET /api/internal/whoami` and `GET /api/internal/not-a-real-route` (`api/src/routes/auth.ts:338`, `:345`, `:355`).

> Note against the briefing's estimate of "~95 HTTP endpoints": the measured figure is **121 paths / 144 method+path pairs**. The 12 route files are registered in `api/src/app.ts:130-145`.

### 4.2 Rate limits declared in the source

| Route | Limit | Source |
|---|---|---|
| `POST /auth/register` | 20 / 15 min | `api/src/routes/auth.ts:132` |
| `POST /auth/login` | 10 / 15 min | `api/src/routes/auth.ts:167` |
| `POST /auth/resend-verification` | 5 / 15 min | `api/src/routes/auth.ts:228` |
| `POST /auth/forgot-password` | 5 / 15 min | `api/src/routes/auth.ts:245` |
| `POST /auth/reset-password` | 10 / 15 min | `api/src/routes/auth.ts:263` |
| `POST /auth/enroll-admin` | 5 / 1 hour | `api/src/routes/auth.ts:291` |
| `POST /catalog/quote` | 120 / 1 min | `api/src/routes/catalog.ts:129` |
| `POST /orders` | 30 / 10 min | `api/src/routes/orders.ts:65` |
| `POST /settings/email` | 5 / 15 min | `api/src/routes/settings.ts:235` |
| `POST /settings/password` | 10 / 15 min | `api/src/routes/settings.ts:296` |
| `POST /settings/email/confirm` | 10 / 15 min | `api/src/routes/settings.ts:344` |
| `POST /settings/account/closure` | 5 / 15 min | `api/src/routes/settings.ts:476` |

---

## 5. Data layer

| Measure | Value | Source |
|---|---|---|
| Prisma models | **31** | `grep -cE "^model " api/prisma/schema.prisma` |
| Prisma enums | **16** | `grep -cE "^enum " api/prisma/schema.prisma` |
| Migration folders | **10** | `ls -1 api/prisma/migrations` (plus `migration_lock.toml`) |
| Physical tables in the live database | **32** | `SELECT count(*) FROM information_schema.tables WHERE table_schema='public'` on VM 103 |
| Live rows (selected) | `User` 6, `Instance` 3, `Order` 5, `Ticket` 12, `Session` 251, `AuditLog` 528, `ProvisioningJob` 123, `InstanceEvent` 321, `MailDelivery` 13, `PanelCredential` 3, `StaffMember` 2, `Product` 5, `ProductPrice` 5, `WebhookEvent` 8 | `SELECT count(*)` per table on VM 103 |
| Empty tables | `Subscription` 0, `Invoice` 0, `Payment` 0, `Promotion` 0, `InstanceDomain` 0, `Setting` 0, `ProductOption` 0, `Egg` 0, `Node` 0, `Attachment` 0, `PromotionRedemption` 0, `EmailChangeRequest` 0, `NotificationPreference` 0 | idem |

The 32 tables against 31 models: the extra table is `_prisma_migrations`, which Prisma maintains itself.

### 5.1 The migrations, in order

| # | Folder | Adds |
|---|---|---|
| 1 | `20261022192556_init` | the initial schema |
| 2 | `20261022200855_product_startup_command` | `Product.startupCommand` |
| 3 | `20261022211200_pterodactyl_panel_credentials` | `PanelCredential` |
| 4 | `20261023090000_commerce_hardening` | the commerce fields |
| 5 | `20261023100000_subscription_items` | `Subscription.orderItemId` |
| 6 | `20261023120000_product_startup_command` | **a second folder with the same purpose as #2** |
| 7 | `20261023130000_ticket_message_attachments` | `Attachment` |
| 8 | `20261023210000_panel_identity_and_credentials` | the panel identity columns |
| 9 | `20261024093000_customer_settings` | `EmailChangeRequest`, `NotificationPreference`, `User.deletionRequestedAt` |
| 10 | `20261024100000_mail_delivery` | `MailDelivery` |

Migrations 2 and 6 are two different folders that carry the same name in their slug. Both are applied, so this is not a broken history — but see `00-documentation-drift.md` for what the documentation says about the migration count.

---

## 6. Tests

| Suite | Runner | Files | Cases | Result on VM 103 |
|---|---|---|---|---|
| API | vitest (`api/package.json:20`) | **22** `*.test.ts` | **219** | **219 passed, 0 failed** |
| Web | `node --test` (`web/package.json:11`) | **3** | **21** | **21 passed, 0 failed** |
| **Total** | | **25** | **240** | **240 passed, 0 failed** |

Command and evidence:

```
$ ssh -i /root/.ssh/blipmade_vm103 debian@10.77.0.13 'cd /opt/blipmade && bash scripts/run-tests.sh'
...
 Test Files  22 passed (22)
      Tests  219 passed (219)
...
# tests 21
# pass 21
# fail 0
```

The suite only ever touches the separate database `blipmade_test`; the rule "the name of the database must end in `_test`" is enforced in three places (`scripts/run-tests.sh`, `api/tests/globalSetup.ts`, `api/tests/setup.ts`).

Cases per API test file:

| File | Cases | File | Cases |
|---|---|---|---|
| `auth.test.ts` | 16 | `panel-client-contracts.test.ts` | 12 |
| `billing.test.ts` | 5 | `panel-identity.test.ts` | 6 |
| `catalog.test.ts` | 8 | `pricing.test.ts` | 12 |
| `credential-renewal.test.ts` | 3 | `provisioning.test.ts` | 6 |
| `deployment-probe.test.ts` | 4 | `pterodactyl-client.test.ts` | 14 |
| `domains.test.ts` | 19 | `session-cookie.test.ts` | 6 |
| `email-delivery.test.ts` | 16 | `settings.test.ts` | 16 |
| `email-templates.test.ts` | 10 | `stripe-origin.test.ts` | 7 |
| `instance-operations.test.ts` | 9 | `tickets-create.test.ts` | 9 |
| `isolation.test.ts` | 9 | `tickets.test.ts` | 13 |
| `upgrades.test.ts` | 6 | `webhooks.test.ts` | 13 |

Web: `auth-guard.test.ts` 8, `fonts-server.test.mjs` 6, `fonts.test.mjs` 7.

---

## 7. Continuous integration

`.github/workflows/ci.yml` — triggered on `push` and `pull_request` (`ci.yml:20-21`), `permissions: contents: read` (`ci.yml:27`).

| Job | Name | What it runs | Source |
|---|---|---|---|
| `api-typecheck` | API typecheck | `npm ci`, `prisma generate`, `tsc -p tsconfig.json --noEmit`, `tsc -p tsconfig.test.json --noEmit` | `ci.yml:41-74` |
| `web-build` | Web typecheck and build | `npm ci`, `tsc --noEmit`, `vite build` | `ci.yml:77-102` |
| `test` | Unit and integration tests | PostgreSQL 17 service container, `prisma db push --accept-data-loss`, `bash scripts/run-tests.sh` | `ci.yml:108-196` |
| `secret-scan` | Secret scan | `gitleaks/gitleaks-action@v2`, `fetch-depth: 0` (the whole history) | `ci.yml:199-215` |
| `dependency-audit` | Dependency audit | a written checker + `npm audit --audit-level=high` for both workspaces, with an explicit accept-list of advisories | `ci.yml:231-345` |
| `schema-drift` | Schema drift | `prisma validate` + a comparison of the migration history with `schema.prisma` | `ci.yml:347-…` |

`.github/workflows/nightly-backup-drill.yml` — `schedule: cron '17 3 * * *'` plus `workflow_dispatch`; runs `backup.sh` + `restore-drill.sh` against a disposable PostgreSQL service container.

`.github/dependabot.yml` is the third file in `.github/`.

**Not verifiable from this copy:** whether the workflow has ever run, whether the accept-list is still accurate, and whether branch protection is on. See `00-documentation-drift.md`.

---

## 8. Scripts (57 files)

### 8.1 Operator runbooks (`scripts/`, 11 files)

| File | What it does | Writes? |
|---|---|---|
| `backup.sh` | `pg_dump --format=custom`, archive of the configuration without `.env`, SHA-256 checksum, retention | yes, in `BACKUP_DIR` |
| `backup-offsite.sh` | encrypted off-host copy (age, or openssl fallback), read-back verification, then release the local copy | yes |
| `restore.sh` | checksum check, dump listing, interactive confirmation, restore | yes, it overwrites the database |
| `restore-drill.sh` | restore into `blipmade_restore_check`, compare with the live database, drop the scratch database | no (the live database is never written) |
| `run-tests.sh` | the whole suite against `blipmade_test` | only the test database |
| `inventory.sh` | prints products, orders, users, instances, subscriptions, invoices, tickets | no |
| `setup-browser-tools.sh` | installs Chromium, Xvfb and the Node packages into `tools/` | installs packages |
| `cleanup-panel.py` | removes the verification servers and accounts from the panel | yes, but dry run by default; needs `--execute` **and** `--confirm` |
| `cleanup-data.sh` | removes the rows the verification runs created | yes, dry run by default |
| `verify-provisioning.py` | creates a product, a customer and an order, pays it through the local test gateway, waits for a real server | yes, only with `--execute` |
| `README.md` | what every script does, whether it changes anything, what it needs | — |

### 8.2 `scripts/ops/` (46 files)

Exploration tooling, no writes by default. The families: `browser-*.mjs` (13 browser drivers), `probe-*.{mjs,py,sh}` (17 panel/node probes), `client-read.py`, `seed-browser-account.mjs`, `verify-deployment-probe.ts`, `verify-frontend.sh`, `watch-install.py`, `prune-empty-migrations.sh`, `apply-truncate-fix.mjs`.

The three-file verification entry point `scripts/ops/verify-frontend.sh` runs three passes: `browser-checks.mjs` (fixed behaviour), `browser-responsive.mjs` (every route at every width) and `browser-screenshots.mjs` (the captures).

`scripts/ops/browser-responsive.mjs` measures **26 route entries** (25 fixed + 1 conditional on `BM_INSTANCE_PATH`) at the widths `320, 375, 390, 768, 1024, 1440` (`browser-responsive.mjs:35`, `:37-70`).

---

## 9. The 15 documents in `docs/`

| # | Document | Lines | What it holds |
|---|---|---|---|
| 1 | `API_CONTRACT.md` | 224 | every route of the API |
| 2 | `AUDIT_REMEDIATION.md` | 468 | the 20 findings BM-AUD-001…020 and what was done |
| 3 | `BLIPMADE_DESIGN_PROMPT.md` | 225 | the design system of every surface |
| 4 | `CUSTOMER_PANEL_AUDIT.md` | 400 | the problems of the customer area and the fixes |
| 5 | `CUSTOMER_PANEL_COMPLETION.md` | 257 | one line per route of the customer area |
| 6 | `EMAIL.md` | 404 | the mail transport, the providers, the DNS |
| 7 | `FRONTEND_CONTRACT.md` | 113 | every screen of the frontend |
| 8 | `FRONTEND_REVIEW.md` | 168 | the frontend round of 2026-10-23 |
| 9 | `HEADLESS_PANEL.md` | 157 | the two identities, the key of a customer, the provisioning |
| 10 | `IMPLEMENTATION_STATUS.md` | 344 | what is finished, what is blocked, with the command per claim |
| 11 | `MOBILE_AND_TYPOGRAPHY_FIX.md` | 355 | the clipped mobile layout and the typeface |
| 12 | `PANEL_BRIDGE.md` | 276 | the bridge between Blipmade and the panel |
| 13 | `PRODUCTION_READINESS.md` | 156 | the readiness report of the last verification round |
| 14 | `RUNBOOK.md` | 540 | the incident procedures |
| 15 | `TYPOGRAPHY.md` | 246 | how the typeface is loaded and the operator steps |

Plus `README.md` (427 lines) at the root and `scripts/README.md`.

---

## 10. The panel bridge (6 files)

| File | Lines | What it does |
|---|---|---|
| `panel-bridge/BlipmadeKeyMintController.php` | — | the endpoint: verifies the signature, the clock window and the nonce, then issues **one** client key for **one** panel account |
| `panel-bridge/BlipmadeBridgeServiceProvider.php` | 34 | registers `POST /api/blipmade/keymint` with `throttle:30,1` (line 31-33) |
| `panel-bridge/config/blipmade_bridge.php` | 24 | `keymint_secret` and `keymint_allowed_ips`, both from the `.env` of the panel |
| `panel-bridge/routes-snippet.php` | 11 | the alternative registration for the layout `routes/api.php` |
| `panel-bridge/install.sh` | — | the installer; it detects the layout of the panel and either registers the provider or appends the snippet |
| `panel-bridge/README.md` | — | the short description of the component |

---

## 11. Configuration surface

`api/src/env.ts` is the single schema; the API refuses to start when it is invalid. The variables it reads (name only, with the line in `env.ts`):

`NODE_ENV`(14) `PORT`(15) `WORKER_HEALTH_PORT`(16) `HOST`(17) `DATABASE_URL`(19) `REDIS_URL`(20) `SESSION_SECRET`(22) `APP_ORIGIN`(23) `APP_PUBLIC_URL`(24) `COOKIE_SECURE`(26) `PTERODACTYL_URL`(28) `PTERODACTYL_APP_KEY`(30) `PANEL_KEYMINT_URL`(36) `PANEL_KEYMINT_SECRET`(38) `PANEL_NODE_ADDRESSES`(54) `STRIPE_SECRET_KEY`(56) `STRIPE_PUBLISHABLE_KEY`(57) `STRIPE_WEBHOOK_SECRET`(58) `SMTP_URL`(60) `MAIL_FROM`(61) `MAIL_SUPPORT_EMAIL`(63) `PUBLIC_WEB_URL`(69) `PAYMENTS_ENABLED`(75) `INTERNAL_API_TOKEN`(77) `BLIPMADE_INTERNAL_API_TOKEN`(78) `ADMIN_ENROLLMENT_KEY`(79) `BACKUP_DIR`(81) `ATTACHMENT_DIR`(83) `DOMAIN_BASE`(84) `CADDY_ADMIN_URL`(85) `CADDY_ADMIN_TOKEN`(86) `METRICS_ENABLED`(87) `LOG_LEVEL`(88) `TRUSTED_PROXIES`(95) `WORKER_URL`(98).

Variables the web container reads: `SERVER_PORT`, `API_URL`, `TRUSTED_PROXY_IPS` (`compose.web.yml:8-16`).
Variables the backup scripts read: `BACKUP_DIR`, `BACKUP_KEEP_DAYS`, `OFFSITE_TARGET`, `OFFSITE_TRANSPORT`, `OFFSITE_ENCRYPTION_KEY`, `OFFSITE_AGE_RECIPIENT`, `OFFSITE_AGE_IDENTITY`, `OFFSITE_KEEP_COPIES`, `OFFSITE_UPLOAD_DIR`, `SCRATCH_DB`.

### 11.1 The state of the production environment file (names and set/empty only)

`/opt/blipmade/.env` on VM 103, read with a command that prints only the name and the length:

| Variable | State | Variable | State |
|---|---|---|---|
| `DATABASE_URL` | set | `SESSION_SECRET` | set |
| `REDIS_URL` | set | `ADMIN_ENROLLMENT_KEY` | set |
| `POSTGRES_PASSWORD` | set | `ADMIN_PASSWORD` | set |
| `ADMIN_EMAIL` | set | `APP_ORIGIN` | set |
| `APP_PUBLIC_URL` | set | `PUBLIC_WEB_URL` | set |
| `NODE_ENV` | set (`production`) | `MAIL_FROM` | set |
| `TRUSTED_PROXY_IPS` | set | `BACKUP_DIR` | set |
| `PTERODACTYL_URL` | set | `PTERODACTYL_APP_KEY` | set |
| `PANEL_KEYMINT_URL` | set | `PANEL_KEYMINT_SECRET` | set |
| `PANEL_NODE_ADDRESSES` | set | `DOMAIN_TARGET` | set |
| `BLIPMADE_INTERNAL_API_TOKEN` | set | `PAYMENTS_ENABLED` | set (`false`) |
| `STRIPE_TEST_MODE` | set (`false`) | `PTERODACTYL_CLIENT_KEY` | **empty** |
| `SMTP_URL` | **empty** | `STRIPE_SECRET_KEY` | **empty** |
| `STRIPE_PUBLISHABLE_KEY` | **empty** | `STRIPE_WEBHOOK_SECRET` | **empty** |
| `CADDY_ADMIN_URL` | **empty** | `CADDY_ADMIN_TOKEN` | **empty** |
| `DOMAIN_BASE` | **empty** | | |

Three observations that belong to the drift report, not here:

* `PTERODACTYL_CLIENT_KEY` is present in the file but **is not in the schema of `api/src/env.ts`** — no code reads it.
* `TRUSTED_PROXY_IPS` is the name the **web** container uses (`compose.web.yml:16`), while the API reads `TRUSTED_PROXIES` (`api/src/env.ts:95`). The two are different variables; the API's value comes from its default, which happens to cover the Compose network (§3.2).
* `DOMAIN_TARGET` is **not** in the schema either, but it *is* read — straight from `process.env`, outside the validation of `env.ts`, in `api/src/routes/domains.ts:208`. `METRICS_ENABLED` is in the schema (`env.ts:87`, default `true`) and is read by **nothing**: there is no platform-level metrics route among the 121 live paths.

---

## 12. Summary of the counts

| What | Number |
|---|---|
| Files in the repository (no `node_modules`, no `.git`, no `dist`) | **317** |
| Source files of the API (`api/src`) | 49 |
| Source files of the web (`web/src`) | 71 |
| Deployable units | 3 (api, worker, web) + 1 PHP component installed on the panel |
| Compose files | 3 |
| Distinct HTTP route paths | **121** |
| Path+method pairs | **144** (142 of them under `/api`) |
| Route files | 12 |
| Prisma models | **31** |
| Prisma enums | 16 |
| Migrations | **10** |
| Tables in the live database | **32** |
| Test files | **25** (22 API + 3 web) |
| Test cases | **240** (219 API + 21 web), all passing |
| CI jobs | 6 (+ 1 nightly workflow) |
| Scripts | **57** (11 runbooks + 46 ops) |
| Documents | **15** in `docs/` + `README.md` + `scripts/README.md` |
| Panel-bridge files | 6 |
| Screenshots | 45 PNG + 1 index (30 entries) |
| Environment variables in the schema | 35 |
