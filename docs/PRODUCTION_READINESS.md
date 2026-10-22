# Blipmade — production readiness report

Date: 2026-10-22 · Target: VM 103 (`10.77.0.13`), `/opt/blipmade` · Staging entry point: `http://10.77.0.13:3000`

## Verdict

**The platform is not ready to take paying customers.** The application itself is
complete, tested and deployed, but three things stand between it and production:
the node does not publish the ports a customer would connect to, and two
credentials that the customer-facing features depend on are still empty. None of
the three is a defect in the platform, and none can be fixed from VM 103.

| Area | State |
|---|---|
| Application code | Ready. 60 automated tests pass, the build is clean, the containers are healthy. |
| Database | Ready. Schema applied, migrations run on start, backup and restore drill pass. |
| Customer area and admin panel | Ready. Every screen renders real data, with loading, empty, error and populated states. |
| Billing | Code complete, only the local test gateway has been exercised. |
| Email | Code complete, mail is written to a file instead of being delivered. |
| Hosting (Pterodactyl) | **Blocked** by the node not publishing the allocation ports. |
| Customer power control, files, console | **Blocked** by the missing client API key. |
| Backups | Works, but the copy stays on a RAID 0 host until `OFFSITE_TARGET` is set. |

## What was verified, and how

* **Build and type check** — `npx tsc --noEmit` is clean; the frontend bundle is
  316.71 kB (94.78 kB gzip) with every route chunk ≤ 26 kB.
* **Tests** — `bash scripts/run-tests.sh` on VM 103: 6 files, 60 tests, all passing.
  The suite runs against the separate `blipmade_test` database, and the setup
  refuses to run against a database whose name does not end in `_test`.
* **Containers** — PostgreSQL, Redis, API, worker and web all report healthy.
  `GET /api/health` answers `{status:"ok", database:true, redis:true,
  pterodactyl:"configured", mail:"file", stripe:"not_configured",
  pterodactylClient:"not_configured"}`.
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

## Blocking issues

### 1. The node does not publish the allocation ports — **node owner**

The container is created, installed and running on the node, but nothing answers
on the port the customer would use:

```
allocated port : 30002 (node 10.77.0.11)
install        : installed = 1 after ~80 s
power          : POST /api/client/servers/{uuid}/power -> 204
daemon state   : current_state "starting", uptime rising, 12.5 MB resident
connect        : 10.77.0.11:30002    -> Connection refused
                193.34.214.87:30002  -> Connection refused
                node1.blipmade.com:30002 -> Connection refused
port scan      : 30000-30019 -> only 30001 open (the pre-existing test server)
```

The same behaviour was reproduced on a second, freshly created server, so it is
not a property of one instance. It needs a decision from whoever owns the node:
either the ports have to be published, or the platform has to be pointed at a
different port range that is.

### 2. The Pterodactyl client API key is missing — **operator**

`PTERODACTYL_CLIENT_KEY` is empty. The panel answers
*"You are attempting to use an application API key on an endpoint that requires a
client API key"*, so a `ptc_` token from Pterodactyl → Account → API is needed.
Without it the platform cannot start a container, so the provisioning flow stops
at the `started` step with that reason in the instance record instead of
pretending to succeed.

### 3. Backups stay on a RAID 0 host — **operator**

`OFFSITE_TARGET` is unset. `scripts/backup.sh` says so on every run. A local
copy on a RAID 0 host is not a backup.

## Required before go-live

1. Publish the allocation ports on the node, or agree a different range.
2. Add `PTERODACTYL_CLIENT_KEY` and re-run one provisioning job end to end.
3. Add the Stripe test keys, run a real checkout and confirm the webhook.
4. Add `SMTP_URL` and confirm a verification and a reset email arrive.
5. Set `OFFSITE_TARGET` and repeat the restore drill against the off-host copy.
6. Set `CADDY_ADMIN_URL` and `CADDY_ADMIN_TOKEN` and test one customer domain.
7. Review the four `root_admin` panel accounts and reduce them to the accounts
   that need them.
8. Decide how the panel password of a customer is handled. It is encrypted at
   rest with a key derived from `SESSION_SECRET`; rotating the secret makes it
   unreadable, so the reset path has to exist before that happens.

## What was deliberately not touched

* The live domain and the Caddy gateway on VM 102.
* The Proxmox host and its networking.
* The protected Pterodactyl server `Blipmade App Test` (id 2,
  `aec52a41-0445-4c03-bab9-82f1af8ed621`, allocation 74 → port 30001). It was
  re-read after every cleanup run and is intact.
* No new VM and no new public address.
* The existing homepage and the Studio simulation.

## Security notes

* Passwords are hashed with scrypt; the parameters live inside the hash.
* Sessions are stored in PostgreSQL; only the SHA-256 hash of the token is kept.
* State-changing routes require a double-submit CSRF token, except the
  credential-carrying authentication endpoints.
* Login, registration, password reset, quotes and orders are rate limited.
* Money is integer minor units everywhere; promotions are basis points.
* The Application API key never leaves the server; the browser only ever sees the
  session cookie and the CSRF token.
* Containers run with `no-new-privileges` and `cap_drop: ALL`; PostgreSQL and
  Redis are bound to loopback.
* The test data that the verification runs created was removed afterwards: eight
  test servers, ten test panel accounts, eight test orders, eight test instances,
  eight test subscriptions and eight test products. The administrator account and
  the five demo catalog products were kept.
