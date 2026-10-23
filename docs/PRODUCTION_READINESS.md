# Blipmade — production readiness report

Date: 2026-10-23 · Target: VM 103 (`10.77.0.13`), `/opt/blipmade` · Staging entry point: `http://10.77.0.13:3000`

## Verdict

**The platform is not ready to take paying customers.** The application is
complete, tested and deployed, and the independent audit that was run against
it has been worked through (see `AUDIT_REMEDIATION.md`). What is left are not
defects in the code but credentials and decisions that only the operator can
make.

| Area | State |
|---|---|
| Application code | Ready. 119 automated tests pass, the build is clean, the containers are healthy. |
| Database | Ready. Schema and migrations applied, no drift, backup and restore drill pass. |
| Customer area and admin panel | Ready. Every screen renders real data, with loading, empty, error and populated states. |
| Billing | Code complete, only the local test gateway has been exercised. |
| Email | Code complete, mail is written to a file instead of being delivered. |
| Hosting (Pterodactyl) | The node publishes its ports. The provisioning now waits for the install, starts the container and verifies the application before it says online. |
| Customer power control, files, console | **Blocked** by the missing client API key. |
| Domains | The proof of ownership is implemented. **Blocked** for real routing by the missing Caddy admin credentials. |
| Backups | Works. The off-host copy is implemented but the destination is not set. |

## What was verified, and how

* **Build and type check** — `npx tsc --noEmit` is clean for the API sources and
  for the API tests; the frontend type check and `vite build` are clean.
* **Tests** — `bash scripts/run-tests.sh` on VM 103: 11 files, 119 tests, all
  passing. The suite runs against the separate `blipmade_test` database, and
  the setup refuses to run against a database whose name does not end in
  `_test`.
* **Schema** — `prisma migrate deploy` applies every migration to the live and
  to the test database, and `prisma migrate diff` reports no difference
  between the migrations and the schema. A migration that was missing has been
  added, so a fresh database is built the same way.
* **Containers** — PostgreSQL, Redis, API, worker and web all report healthy.
  `GET /api/health` answers with the state of the database, the cache, the mail
  transport, Stripe and the two Pterodactyl keys.
* **Live panel** — a real server was created on node `games-node-01` with the
  requested limits, the egg's install script ran, the panel reported
  `installed = 1`, and the daemon reported a running container. The panel
  contract for all three server-update routes was read from the live validator
  and is documented in `IMPLEMENTATION_STATUS.md`.
* **Backup and restore** — `scripts/backup.sh` produced a verified archive;
  `scripts/restore-drill.sh` restored it into a scratch database and compared it
  with the live one. 26 tables, 1 user, 5 products and 3 migrations matched
  exactly. The scratch database was dropped afterwards.
* **Responsive rendering** — 30 screenshots at 390 px and 1440 px across the
  public pages, the customer area and the admin area (`screenshots/`).

### The ports of the node

An earlier version of this report said the node does not publish the
allocation ports. **That conclusion was wrong.** Port 30000 on the node answers
with HTTP 200, and the container of the instance that was created through the
panel interface runs on it. The servers that Blipmade created earlier never
published their port because the platform used the build route to mark a server
as installed, which created the container without the allocation relationship
the node needs to bind the port.

The provisioning now uses the install route of the panel, waits until the panel
reports the server as installed, starts the container and only then verifies the
application over HTTP with the probe of the product. A server that answers with
404 or 403 is a failure, not a success.

## Blocking issues

### 1. The Pterodactyl client API key is missing — **operator**

`PTERODACTYL_CLIENT_KEY` is empty. The panel answers *"You are attempting to use
an application API key on an endpoint that requires a client API key"*, so a
`ptlc_` token from Pterodactyl → Account → API is needed. Without it the
platform cannot start a container, so the provisioning flow stops at the
`started` step with that reason in the instance record instead of pretending to
succeed. It also blocks the console relay and the customer facing power
control, file manager and metrics.

The panel login currently answers `500 TypeError` for every account, so the key
cannot be issued from here. The panel side has to be repaired first, or the key
has to be created by hand in the panel database.

### 2. The Stripe keys are missing — **operator**

`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` and `STRIPE_PUBLISHABLE_KEY` are
empty. The local test gateway exercises the whole path — order, payment,
subscription, invoice, provisioning — but no real card has been charged.

### 3. Real mail is not configured — **operator**

`SMTP_URL` is empty, so the mail is written to a file inside the container. The
verification and the password reset mails have never been delivered.

### 4. The Caddy gateway is not configured — **operator**

`CADDY_ADMIN_URL` and `CADDY_ADMIN_TOKEN` are empty. The gateway service is
written, validated and idempotent, and it refuses to route a hostname whose
proof of ownership was not accepted, but no real hostname has been routed and
no certificate has been issued. The Caddy configuration on VM 102 was not
touched.

### 5. The backups stay on a RAID 0 host — **operator**

`OFFSITE_TARGET` is unset. The offsite script is written, encrypted and
verified, and it refuses to run without a key, but the destination is missing.
A local copy on a RAID 0 host is not a backup.

## Required before go-live

1. Add `PTERODACTYL_CLIENT_KEY` and run one provisioning job end to end until
   the instance is online and answers on its own port.
2. Add the Stripe test keys, run a real checkout and confirm the webhook.
3. Add `SMTP_URL` and confirm a verification and a reset email arrive.
4. Set `OFFSITE_TARGET` and `OFFSITE_ENCRYPTION_KEY`, then repeat the restore
   drill against the off-host copy.
5. Set `CADDY_ADMIN_URL` and `CADDY_ADMIN_TOKEN`, then claim a test hostname,
   publish the TXT record and confirm the route and the certificate.
6. Review the four `root_admin` panel accounts and reduce them to the accounts
   that need them.
7. Decide how the panel password of a customer is handled. It is encrypted at
   rest with a key derived from `SESSION_SECRET`; rotating the secret makes it
   unreadable, so the reset path has to exist before that happens.
8. Turn on the GitHub branch protection, so the checks of the new pipeline have
   to pass before a change lands on `main`.

## What was deliberately not touched

* The live domain and the Caddy gateway on VM 102.
* The Proxmox host and its networking.
* The protected Pterodactyl server `Blipmade App Test` (id 2,
  `aec52a41-0445-4c03-bab9-82f1af8ed621`, allocation 74 → port 30001). It was
  re-read after every cleanup run and is intact.
* No new VM and no new public address.
* The existing homepage, its logo, the navigation and the Studio simulation.
  The homepage now reads its prices from the catalog instead of a hardcoded
  list; the layout was not changed.

## Security notes

* Passwords are hashed with scrypt; the parameters live inside the hash.
* Sessions are stored in PostgreSQL; only the SHA-256 hash of the token is kept.
* State-changing routes require a double-submit CSRF token, except the
  credential-carrying authentication endpoints.
* Login, registration, password reset, quotes and orders are rate limited, and
  the API only believes the forwarding headers of the addresses it knows.
* Money is integer minor units everywhere; promotions are basis points.
* The Application API key never leaves the server; the browser only ever sees the
  session cookie and the CSRF token. The console token is added by the API and
  never reaches the browser.
* A hostname is only routed after the customer proved it with a TXT record.
* Containers run with `no-new-privileges` and `cap_drop: ALL`; PostgreSQL and
  Redis are bound to loopback.
* The test data that the verification runs created was removed afterwards: eight
  test servers, ten test panel accounts, eight test orders, eight test instances,
  eight test subscriptions and eight test products. The administrator account and
  the five demo catalog products were kept.
