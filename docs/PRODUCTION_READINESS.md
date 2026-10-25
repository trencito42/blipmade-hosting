# Blipmade — production readiness report

Date: 2026-10-23 · Revised: 2026-10-25 · Target: VM 103 (`10.77.0.13`), `/opt/blipmade` · Staging entry point: `http://10.77.0.13:3000`

## Revision of 2026-10-25

The report below is the one of 2026-10-23 and it is kept as it was written,
so the state of that day stays readable. The entries that the remediation
campaign changed are corrected here, and the rest of the changes are listed
in the report of the campaign.

* **Backups** — the off-host copy is now configured, produced and proven
  restorable. See the section below and §5 of this document.
* **Domains** — the Caddy gateway of the edge is configured and a hostname is
  routed and answered with a valid certificate. The blocking issue 4 of this
  report is closed.
* **The off-host copy is still inside one provider.** The target of the copy is
  a second virtual machine of the same provider, so a failure of the provider
  takes both the host and the copy with it. A copy outside of the provider is
  still required before a commercial launch.

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
| Domains | The proof of ownership is implemented. The gateway is configured since 2026-10-25, and a hostname is routed and answered with a valid certificate. |
| Backups | The local backup and the encrypted off-host copy work and are proven restorable. The off-host copy is still inside one provider. |

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

### 5. The off-host copy stays inside one provider — **operator**

`OFFSITE_TARGET` points to a second virtual machine of the same provider
(`blipmade-offsite:/srv/blipmade-backups`), the copy is encrypted with `age`
and it was fetched, decrypted and restored into a scratch database that matched
the live one exactly. The copy is therefore readable and restorable.

Two things are still missing, and only the operator can close them:

* A copy **outside of the provider**. A failure of the provider takes the host
  and the copy with it, so the copy does not cover that case yet. An rclone
  remote of a bucket of another provider closes it; the script already supports
  that transport.
* An **offline copy of the age identity** (`OFFSITE_AGE_IDENTITY`). The copy on
  the target cannot be read without it. The identity lives on the platform
  host only, so a lost host would mean lost backups.

> The off-host script itself had a defect that was found and fixed on
> 2026-10-25: it dumped the database with the host of the platform, and that
> host is the name of the compose network service, which does not resolve from
> the host. Every run ended with "could not translate host name postgres", so
> the copy could never be made. The host of the url is rewritten now, and
> `api/tests/backup-offsite-database-host.test.ts` runs the whole script and
> keeps it that way.

## Required before go-live

1. Add `PTERODACTYL_CLIENT_KEY` and run one provisioning job end to end until
   the instance is online and answers on its own port.
2. Add the Stripe test keys, run a real checkout and confirm the webhook.
3. Add `SMTP_URL` and confirm a verification and a reset email arrive.
4. Keep an offline copy of the age identity of the backups, and set an
   `OFFSITE_TARGET` of a bucket outside of the provider. The off-host copy
   inside the provider is done and proven.
5. Set `CADDY_ADMIN_URL` and `CADDY_ADMIN_TOKEN`, then claim a test hostname,
   publish the TXT record and confirm the route and the certificate. (Done on
   2026-10-25 for the edge of the platform.)
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
