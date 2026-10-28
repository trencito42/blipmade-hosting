# Blipmade

Blipmade is a commercial hosting platform: it sells game and application
servers, takes the orders and the payments, and provisions the servers on a
Pterodactyl cluster. It is a **headless** platform: the customer interface is a
React application in this repository, and it talks to the Pterodactyl panel and
the Wings nodes through their APIs. The panel, the nodes and the edge proxy are
not part of this repository and are not deployed from it.

This document is the operating manual for the repository: how the platform is
put together, how to run it locally, how the tests work, how it is deployed,
which environment variables it needs, and how the backups are made and proved.

**The platform is not ready to take paying customers yet.** The list at the
end of this file is honest about what is still unverified. Read it before you
promise anything to a customer.

---

## 1. Architecture

The platform runs on four machines. Only the first one is built from this
repository.

| Machine | Role | What runs there | In this repository |
|---|---|---|---|
| **VM 103** | Control plane | API, worker, web, PostgreSQL 17, Redis 7 | **Yes** — everything in this repository is deployed here |
| **VM 100** | Pterodactyl panel | The panel (the customer and admin web interface of the hosting software) | No |
| **VM 101** | Wings node | The node daemon that runs the customer containers | No |
| **VM 102** | Caddy edge | The reverse proxy that routes the customer domains | No |

Inside the control plane:

```
             ┌──────────── Caddy edge (VM 102) ────────────┐
             │                                              │
   browser ──┴─▶ web (node server.mjs, :3000) ──▶ api (fastify, :3100) ──▶ PostgreSQL 17
                          │                          │                              (blipmade)
                          └─ proxy /api             └─▶ Redis 7  ◀── worker (bullmq, :3101)
                                                            │
                                                            └──▶ Pterodactyl panel (VM 100)
                                                                     │
                                                                     └──▶ Wings node (VM 101)
```

* **api** — the Fastify 5 API. It owns the customers, the catalog, the orders,
  the invoices, the tickets, the instances and the audit log. It listens on
  port 3100 and answers `/health`.
* **worker** — the BullMQ consumer. It provisions the servers, so a slow panel
  never blocks a request. It answers `/health` on port 3101 with its own
  small server, because it does not serve the API.
* **web** — the React 19 + Vite single page application, served by a small
  Node server that also proxies `/api` to the API, so the session cookie stays
  first-party and no cross-site exemption is needed.
* **postgres** / **redis** — the database and the queue. Both are bound to
  loopback, so only the containers on this host can reach them.

---

## 2. Repository layout

| Path | What it is |
|---|---|
| `api/` | The Fastify API and the BullMQ worker. TypeScript, Prisma, PostgreSQL, Redis. |
| `api/prisma/` | The schema and the migration history. |
| `api/tests/` | The test suite (vitest). |
| `web/` | The React frontend and the small server that serves it. |
| `scripts/` | The operational scripts: backup, restore, restore drill, off-site backup, inventory. |
| `scripts/ops/` | The verification and probe scripts that read the panel and the node. |
| `panel-bridge/` | The component that the **panel** carries so that Blipmade can get a client key for one customer. It is installed on the panel host, not here. See `docs/PANEL_BRIDGE.md`. |
| `docs/` | The contracts, the status report and the runbook. |
| `compose.yml` | PostgreSQL and Redis. |
| `compose.api.yml` | The API and the worker. |
| `compose.web.yml` | The web container. |
| `.github/workflows/` | The continuous integration and the nightly restore drill. |

---

## 3. Prerequisites

* **Node.js 22 or newer** (`api/package.json` sets `engines.node >= 22`). The
  containers use `node:22-alpine`.
* **Docker** with the compose plugin. The deployment is plain
  `docker compose`, no Swarm and no Kubernetes.
* **PostgreSQL 17** for the database.
* **Redis 7** for the queue and the rate limiter.
* On the control-plane host: `postgresql-client-17`, so that `pg_dump`,
  `pg_restore` and `psql` are available for the backup scripts. Debian and
  Ubuntu put them in `/usr/lib/postgresql/17/bin`, which is not always on the
  `PATH`; the backup scripts look there themselves.

---

## 4. Local development

### 4.1 The database and the queue

```bash
docker compose up -d postgres redis
docker compose ps          # both have to be healthy
```

### 4.2 The environment file

Create a `.env` in the repository root. It is gitignored and it is never
included in a backup. Only the placeholders are shown here; every value has to
be generated for your own machine.

```ini
DATABASE_URL=postgresql://<user>:<password>@localhost:5432/blipmade
REDIS_URL=redis://localhost:6379
SESSION_SECRET=<a long random string of at least 16 characters>
APP_ORIGIN=http://localhost:5173
APP_PUBLIC_URL=http://localhost:5173
```

`api/src/env.ts` reads `.env` from the repository root or from `api/`, so one
file serves both workspaces. The application refuses to start when
`DATABASE_URL` is missing or when `SESSION_SECRET` is shorter than 16
characters.

### 4.3 The API and the worker

```bash
cd api
npm ci
npx prisma generate
npx prisma migrate deploy     # creates the schema in the local database
npm run dev                   # tsx watch, the API on http://localhost:3100
```

The worker is a second process against the same database:

```bash
cd api
npm run worker:dev            # the BullMQ consumer
```

### 4.4 The frontend

```bash
cd web
npm ci
npm run dev                   # vite on http://localhost:5173
```

The frontend talks to the API through the `/api` path. In development vite
proxies it; the API therefore has to answer on `http://localhost:3100` and
`APP_ORIGIN` has to be the address the browser uses.

---

## 5. The tests

```bash
bash scripts/run-tests.sh
```

The suite truncates every table it touches, so it refuses to run against a
database that holds real data. The rule is: **the name of the database must end
with `_test`**. It is enforced in three places, and all three have to agree:

* `scripts/run-tests.sh` rewrites the database name of `DATABASE_URL` to
  `blipmade_test` and refuses to start if it cannot derive that name.
* `api/tests/globalSetup.ts` refuses to migrate a database whose name does not
  end with `_test`.
* `api/tests/setup.ts` refuses to run against such a database.

Before the first run, create the test database:

```bash
docker compose exec postgres createdb -U blipmade blipmade_test
```

`DATABASE_URL` and `REDIS_URL` have to be set, either in the environment or in
the `.env` file. The script needs both, because it rewrites the compose
hostnames to `localhost` so that the suite can run from the host.

The suite covers the authentication, the customer isolation, the pricing, the
webhooks, the tickets, the provisioning and the Pterodactyl client adapter. The
files are listed in `docs/IMPLEMENTATION_STATUS.md`.

---

## 6. Deploying to the control plane

The deployment is on **VM 103**, in `/opt/blipmade`. The repository is pulled,
the images are rebuilt and the containers are recreated:

```bash
cd /opt/blipmade
git pull

docker compose -f compose.yml -f compose.api.yml -f compose.web.yml build --no-cache api worker web
docker compose -f compose.yml -f compose.api.yml -f compose.web.yml up -d
docker compose -f compose.yml -f compose.api.yml -f compose.web.yml ps
```

Rules that matter:

* **The worker image is built from the same context as the API image.** Both
  services build `./api` and run the same code. A change under `api/src` that
  is not deployed with `build api worker` leaves the worker on the old code,
  and the two drift apart. Always rebuild them together.
* **The migrations run when the API container starts.** The entrypoint runs
  `prisma migrate status` before the API starts, because `CHECK_MIGRATIONS` is
  set in `compose.api.yml`. Never run `prisma migrate dev` on the host: it
  wants an interactive answer and it wants to reset the database.
* **The `.env` file is not in the repository.** It lives in `/opt/blipmade/.env`
  and is read by the API and the worker through `env_file`. A deployment never
  changes it.
* **The containers run with `no-new-privileges` and `cap_drop: ALL`**, and
  PostgreSQL and Redis are bound to loopback. Do not publish those ports.
* `docker compose ... up -d` recreates only the services whose configuration
  changed. After a schema change, check that the API came back healthy:
  `curl -s http://127.0.0.1:3100/health`.

---

## 7. The environment variables

The API reads its configuration in `api/src/env.ts` and refuses to start when
it is invalid. The values below are the placeholders, never a real value.

| Variable | Purpose | Required | Secret | Value |
|---|---|---|---|---|
| `NODE_ENV` | `development`, `production` or `test`. Decides the logging and the cookie behaviour. | no | no | `production` in the image |
| `HOST` | The address the API binds to. | no | no | `0.0.0.0` |
| `PORT` | The port the API listens on. | no | no | `3100` |
| `WORKER_HEALTH_PORT` | The port the worker answers its health check on. | no | no | `3101` |
| `DATABASE_URL` | The PostgreSQL connection string. | **yes** | **yes**, it carries the password | `<redacted>` |
| `REDIS_URL` | The Redis connection string. | no | **yes**, if it carries a password | `redis://127.0.0.1:6379` |
| `SESSION_SECRET` | Signs the session cookie, the CSRF token and the encrypted client key of a customer. At least 16 characters. | **yes** | **yes** | `<redacted>` |
| `APP_ORIGIN` | The origin the browser uses. It is the only allowed CORS origin. | no | no | `http://localhost:5173` |
| `APP_PUBLIC_URL` | The public address of the platform. | no | no | `http://localhost:5173` |
| `PUBLIC_WEB_URL` | The canonical public origin of the site. Every link of an email and every address of a checkout is built from it. | no | no | `https://blipmade.com` |
| `PAYMENTS_ENABLED` | `true` or `false`. While it is `false`, a checkout answers that payments are not available instead of starting one. | no | no | `false` |
| `COOKIE_SECURE` | `true`, `false` or unset. Unset follows the protocol of the request. | no | no | unset |
| `PTERODACTYL_URL` | The address of the Pterodactyl panel. | for provisioning | no | `<redacted>` |
| `PTERODACTYL_APP_KEY` | The administrative key of the panel. | for provisioning | **yes** | `<redacted>` |
| `PANEL_KEYMINT_URL` | The endpoint of the panel that issues the client key of a customer, for example `https://panel.example.com/api/blipmade/keymint`. It is the bridge of the panel, see `docs/PANEL_BRIDGE.md`. | for the customer tools | **yes** | empty |
| `PANEL_KEYMINT_SECRET` | The secret both sides sign with. At least 32 characters. The same value is on the panel. | for the customer tools | **yes** | `<redacted>` |
| `STRIPE_SECRET_KEY` | The Stripe secret key. Without it the local test gateway is used. | for real payments | **yes** | `<redacted>` |
| `STRIPE_PUBLISHABLE_KEY` | The Stripe publishable key. | for real payments | **yes** | `<redacted>` |
| `STRIPE_WEBHOOK_SECRET` | The signature secret of the Stripe webhook. | for real payments | **yes** | `<redacted>` |
| `SMTP_URL` | The SMTP server. Without it the mail is written to `BACKUP_DIR/mail` instead of being sent. | for real mail | **yes** | `<redacted>` |
| `MAIL_FROM` | The sender of the emails. | no | no | `Blipmade <no-reply@blipmade.com>` |
| `MAIL_SUPPORT_EMAIL` | The inbox that receives the notifications about new support tickets. | no | no | `support@blipmade.com` |
| `INTERNAL_API_TOKEN` | The token of the internal service calls. `BLIPMADE_INTERNAL_API_TOKEN` is accepted as an alias. | no | **yes** | `<redacted>` |
| `ADMIN_ENROLLMENT_KEY` | The key that admits the first administrator. | for the first setup | **yes** | `<redacted>` |
| `BACKUP_DIR` | Where the backups and the mail spool are written. | no | no | `/var/backups/blipmade` |
| `ATTACHMENT_DIR` | Where the files attached to support tickets are stored. The off-site backup adds this directory to the payload. | no | no | `/data/uploads` |
| `DOMAIN_BASE` | The base name of the customer domains. | for customer domains | no | `<redacted>` |
| `CADDY_ADMIN_URL` | The administrative API of the Caddy edge. It is never public. | for customer domains | no | `<redacted>` |
| `CADDY_ADMIN_TOKEN` | The bearer token for the Caddy administrative API. | for customer domains | **yes** | `<redacted>` |
| `DOMAIN_TARGET` | The address the customer domains point at. | no | no | `<redacted>` |
| `TRUSTED_PROXIES` | The addresses that are allowed to set the forwarding headers. | no | no | `127.0.0.1,::1,172.16.0.0/12` |
| `WORKER_URL` | Where the API reads the health of the worker. | no | no | `http://worker:3101` |
| `METRICS_ENABLED` | Whether the metrics route is served. | no | no | `true` |
| `LOG_LEVEL` | The log level of the API and the worker. | no | no | `info` |
| `POSTGRES_PASSWORD` | The password of the PostgreSQL container. | **yes** | **yes** | `<redacted>` |
| `API_URL` | Where the web container proxies `/api` to. | no | no | `http://api:3100` |
| `SERVER_PORT` | The port the web container listens on. | no | no | `3000` |
| _(none)_ | proxima nova is served from this machine under `/fonts/`. The licensed web files are placed under `web/public/fonts/` and the site is built again. There is no variable and no address of a third party. See `docs/TYPOGRAPHY.md`. | — | — | — |

### The backup scripts

| Variable | Purpose | Required | Secret | Value |
|---|---|---|---|---|
| `BACKUP_DIR` | Where the local archives are written. | no | no | `/var/backups/blipmade` |
| `BACKUP_KEEP_DAYS` | How many days the local archives are kept. | no | no | `14` |
| `OFFSITE_TARGET` | Where the encrypted copy goes. An rclone remote, an ssh destination or a mounted volume. | for the off-site copy | no, but it names a host | `<redacted>` |
| `OFFSITE_TRANSPORT` | `rclone`, `ssh` or `local`. Detected from the shape of the target when it is not set. | no | no | detected |
| `OFFSITE_ENCRYPTION_KEY` | The passphrase of the openssl fallback. | unless `OFFSITE_AGE_RECIPIENT` is used | **yes** | `<redacted>` |
| `OFFSITE_AGE_RECIPIENT` | The age recipient, for example `age1...`. | no | no, it is a public key | `<redacted>` |
| `OFFSITE_AGE_IDENTITY` | The path to the age identity file. Needed to read the copy back. | with `OFFSITE_AGE_RECIPIENT` | **yes** | `<redacted>` |
| `OFFSITE_KEEP_COPIES` | How many copies stay on the off-site target. | no | no | `14` |
| `OFFSITE_UPLOAD_DIR` | The customer upload storage that is added to the payload. It defaults to `ATTACHMENT_DIR`. | no | no | `/data/uploads` |
| `SCRATCH_DB` | The database the restore drill writes to. | no | no | `blipmade_restore_check` |

A key or a target is never given as a command line argument: it would end up
in the shell history and in the process list. Everything comes from the
environment or from the `.env` file.

---

## 8. Backups, restore drills and the off-site copy

The host uses **RAID 0**. A copy that stays on this machine is not a backup.
Three scripts cover the three stages.

### 8.1 The local backup

```bash
bash scripts/backup.sh daily
```

It dumps the database with `pg_dump --format=custom`, archives the
configuration **without** the `.env` file, writes a SHA-256 checksum next to
the archive, applies the retention policy and prints the result.

Schedule it on the host, for example in `/etc/cron.d/blipmade-backup`:

```
17 2 * * * cd /opt/blipmade && /bin/bash scripts/backup.sh daily >> /var/log/blipmade-backup.log 2>&1
```

### 8.2 The restore drill

```bash
bash scripts/restore-drill.sh
```

It restores the newest archive into a scratch database (`blipmade_restore_check`),
compares the tables, the users, the products and the applied migrations with
the live database, drops the scratch database and leaves the live database
untouched. The exit code is `0` only when the two match. Run it after every
backup change and at least once a month.

### 8.3 The off-site copy

```bash
bash scripts/backup-offsite.sh
```

The script dumps the database, adds the customer upload storage, **encrypts
the payload before it leaves the host**, reads the encrypted copy back and
compares it with the original, sends it to the off-site target, lists the
target and compares the size, and finally removes the local copy of the
payload.

* Without `OFFSITE_TARGET` the script prints that the off-site copy was not
  made and exits `0`. It never fails a deployment because the optional feature
  is not configured, and it never claims that a backup was made.
* With a target but without a key the script **fails**: a plain copy is never
  sent.
* `age` is used when it is installed and `OFFSITE_AGE_RECIPIENT` is set. It
  encrypts with ChaCha20-Poly1305. Otherwise the fallback is `openssl enc`
  with AES-256-CBC and PBKDF2, because `openssl enc` has no AEAD mode at all:
  it refuses every GCM cipher. The read-back comparison is the integrity
  check of that fallback.
* The target can be an rclone remote (`OFFSITE_TARGET=blipmade-backups:/srv`),
  an ssh destination (`OFFSITE_TARGET=user@host:/srv/blipmade`) or a mounted
  volume (`OFFSITE_TARGET=/mnt/offsite/blipmade`). Set `OFFSITE_TRANSPORT`
  when the automatic detection guesses wrong.
* The remote keeps the last `OFFSITE_KEEP_COPIES` copies.
* The local copy of the payload is only removed after the copy on the target
  was verified. If anything fails, the encrypted local copy is kept so that
  the upload can be repeated.

**Before go-live, the off-host restore has to be proved.** The drill has to run
against a copy that was fetched from the off-site target on another machine,
not against the local archive. The procedure is in `docs/RUNBOOK.md`.

---

## 9. Continuous integration

Every push and every pull request runs `.github/workflows/ci.yml`:

| Job | What it does |
|---|---|
| API typecheck | `npm ci`, `prisma generate`, `tsc` on the production sources and on the tests. |
| Web typecheck and build | `npm ci`, `tsc --noEmit`, `vite build`. |
| Unit and integration tests | The suite against a disposable `blipmade_test` database in a PostgreSQL 17 service container. |
| Secret scan | `gitleaks` over the whole history, not only the tip. |
| Dependency audit | `npm audit --audit-level=high` for both workspaces. A new high or critical advisory fails the build. |
| Schema drift | `prisma validate` and a comparison of the migration history with `prisma/schema.prisma`. A model that was changed without a migration fails the build. |

`.github/workflows/nightly-backup-drill.yml` runs the backup and the restore
drill against a disposable PostgreSQL service container every night, so a
broken backup script is noticed within a day and not at the next restore.

Branch protection has to be set on the repository settings: `main` requires the
jobs above to pass before a pull request can be merged. That setting lives in
the repository settings, not in this repository.

---

## 10. Known limitations — not ready for paying customers

These are the open points. None of them is fixed by anything in this
repository.

* **The allocation ports are not published on the node.** A server is created,
  installed and started, but the port the customer would connect to refuses
  connections. The fault is on the node (VM 101), not in the platform.
* **The panel cannot issue a client key on its own.** The power control, the
  file manager, the console, the backups and the databases need a key that is
  scoped to one customer, and the panel has no route that creates one. The
  bridge of `panel-bridge/` is the answer and it has to be installed on the
  panel; until then the customer operations answer `503` and say so. See
  `docs/PANEL_BRIDGE.md` and `docs/HEADLESS_PANEL.md`.
* **The Stripe integration has never run live.** Only the local test gateway
  was exercised. A real checkout and a real webhook delivery are still open.
* **The mail is never delivered.** Without `SMTP_URL` the messages are written
  to a file instead of being sent, so no verification or reset mail has ever
  reached a customer.
* **The Caddy administrative API has never been called.** `CADDY_ADMIN_URL` and
  `CADDY_ADMIN_TOKEN` are empty, so no customer domain has ever been routed.
* **The off-site backup is not configured.** `OFFSITE_TARGET` is unset, so the
  backups still stay on the RAID 0 host. Set it and repeat the restore drill
  against the off-host copy.
* **The dependency tree carries known advisories.** The audit in the CI accepts
  them explicitly until the packages are upgraded; the list is in
  `.github/workflows/ci.yml`.
* **The panel still has four `root_admin` accounts.** They were not touched.

`docs/PRODUCTION_READINESS.md` is the full report of the last verification
round, with the evidence for every line.

---

## 11. The other documents

| Document | What it holds |
|---|---|
| [`docs/RUNBOOK.md`](docs/RUNBOOK.md) | The incident procedures: the panel is unreachable, the node is down, the worker has a backlog, a webhook failed, a restore, a drill, a credential rotation. |
| [`docs/API_CONTRACT.md`](docs/API_CONTRACT.md) | Every route of the API, with its parameters and its answers. |
| [`docs/PRICING.md`](docs/PRICING.md) | The card of the platform, the arithmetic of the price, the policy of the prices that already exist and the policy of the shared processors. |
| [`docs/FRONTEND_CONTRACT.md`](docs/FRONTEND_CONTRACT.md) | Every screen of the frontend and the calls it makes. |
| [`docs/IMPLEMENTATION_STATUS.md`](docs/IMPLEMENTATION_STATUS.md) | What is finished, what is implemented but unverified and what is blocked, with the command that proves each claim. |
| [`docs/FRONTEND_REVIEW.md`](docs/FRONTEND_REVIEW.md) | The review of the interface of 2026-10-23: the typeface, the auth screens, the path to the first deployment, the customer overview, the phone and the states of every route. |
| [`docs/TYPOGRAPHY.md`](docs/TYPOGRAPHY.md) | How the typeface is loaded, which weights exist and how to set the Adobe Fonts web project. |
| [`docs/HEADLESS_PANEL.md`](docs/HEADLESS_PANEL.md) | How the headless integration works: the two identities, the key of a customer, the rules of every operation and the provisioning. |
| [`docs/PANEL_BRIDGE.md`](docs/PANEL_BRIDGE.md) | The bridge between Blipmade and the panel: what it does, how it is installed on the panel and how it is removed. |
| [`docs/PRODUCTION_READINESS.md`](docs/PRODUCTION_READINESS.md) | The readiness report of the last verification round. |
| [`scripts/README.md`](scripts/README.md) | What every script in `scripts/` does. |
