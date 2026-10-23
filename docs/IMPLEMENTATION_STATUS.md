# Blipmade — implementation status

Last updated: 2026-10-23 02:10 UTC

> **Update 2026-10-23, second round — the panel became headless.** The panel is
> now strictly a backend: no customer signs in to it, nothing links to it and no
> key of it is shared. Every customer has a client key of their own on the
> panel, issued by the bridge of `panel-bridge/` and stored encrypted. The
> shared key (`PTERODACTYL_CLIENT_KEY`) and the impersonation that used it are
> gone. The architecture is in [`HEADLESS_PANEL.md`](HEADLESS_PANEL.md) and the
> installation of the bridge is in [`PANEL_BRIDGE.md`](PANEL_BRIDGE.md).

This file is the source of truth for what is finished, what is implemented but not
verified, and what is blocked. Every claim below is backed by a command that was run
on VM 103 (`10.77.0.13`), not by an assumption.

> **Update 2026-10-23.** The independent technical audit (20 findings) has been
> worked through. The finding-by-finding report is in
> [`AUDIT_REMEDIATION.md`](AUDIT_REMEDIATION.md), the operating procedures are in
> [`RUNBOOK.md`](RUNBOOK.md), and the current verdict is in
> [`PRODUCTION_READINESS.md`](PRODUCTION_READINESS.md). The corrections to the
> statements below are marked.

Sections: [The headless round](#0-the-headless-round-2026-10-23-second-round) · [Recovered work](#1-recovered-work) · [Backend](#2-backend) · [Frontend](#3-frontend)
· [Infrastructure](#4-infrastructure) · [Tests](#5-tests) · [Panel contract](#6-pterodactyl-panel-contract)
· [Not verified](#7-what-was-not-verified) · [Blocked](#8-blocked) · [Next](#9-next-steps)

---

## 0. The headless round (2026-10-23, second round)

Pterodactyl is strictly a backend. No customer signs in to it, nothing links
to it and no key of it is shared. What was done, what was checked against the
real panel and what is still blocked:

### Implemented

| what | where |
|---|---|
| The name of a customer is two parts and both are required at the registration. The optional single name is gone. | `api/src/routes/auth.ts`, `web/src/pages/Register.tsx` |
| One panel account per customer, found by `external_id` and by nothing else. An account that Blipmade did not create is never taken over. The account carries a reserved address that cannot receive mail, and the two parts of the name of the customer. | `api/src/services/panel/identity.ts` |
| One client key per customer, encrypted in `PanelCredential`. The shared key and the impersonation that used it are gone. | `api/src/services/panel/credentials.ts` |
| The bridge of the panel: one endpoint that issues a key for one customer, signed with a secret, with a replay guard and an address list. | `panel-bridge/`, `docs/PANEL_BRIDGE.md` |
| Every server operation goes through the key of the customer, after the ownership of the instance was checked. An instance of somebody else answers 404. | `api/src/services/panel/operations.ts`, `api/src/routes/instance-server.ts` |
| The console is a relay: the browser opens a socket on Blipmade and Blipmade relays it. The address of the node and the token of the console stay on the server. | `api/src/routes/instances.ts` |
| The whole page of the instance: overview, console, files, databases, backups, network, startup, schedules, settings, activity. | `web/src/app/instance/` |
| The provisioning reads the allocation the panel really assigned, never installs a server that is already installed, and never takes over a panel account by its address. | `api/src/services/provisioning.ts` |

### Verified against the real panel

| what | how |
|---|---|
| Two disposable customers get two distinct panel identities | `GET /api/application/users`: id 19 and 20, with `external_id = blipmade_acc_<id>`, `root_admin = false` and a reserved address. |
| Every server belongs to its own customer | `GET /api/application/servers`: id 10 belongs to the account 19, id 11 to the account 20. No server is owned by an administrator. |
| The address is the one the panel assigned | The allocations 74 and 75 were assigned by the panel, one per server, and are stored in `Instance.pterodactylAllocation`. |
| The installation runs once | `installed = 1` on both servers, and the event list of the instance says "The server was already installed, so nothing was reinstalled" on the retry. |
| The container cannot be started | The step `started` uses the key of the customer, which the bridge of the panel hands out. The bridge is installed on the panel host (VM 100) since 2026-10-23, so the step runs and the container of the server is started. |
| The cross-customer access is refused | `tests/instance-operations.test.ts`: 16 routes of the instance answer 404 for the other customer and the panel is never asked. |
| The tests of the platform | 153 of 153 pass on VM 103, including the contracts of the client API, the renewal of a key and the check of a deployment. |

### The bridge of the panel, installed

| what | how |
|---|---|
| The bridge is on the panel | `panel-bridge/` is installed on the panel host (VM 100, Pterodactyl 1.15.2). The panel splits its api routes, so the route is registered by a provider: `app/Providers/BlipmadeBridgeServiceProvider.php`, listed in `config/app.php`. |
| The endpoint answers | `POST /api/blipmade/keymint` with a signature over `timestamp.nonce.external_id`. A wrong signature answers 401, a signature for another account answers 401, and a correct one answers 200 with a client key of 48 characters that starts with `ptlc_`. |
| The key is scoped to one customer | The key is made for the panel account of that customer, so it can only reach the servers of that account. The panel checks the ownership of the server again on its side. |
| The key works from one address | `BLIPMADE_KEYMINT_ALLOWED_IPS` names the address of the Blipmade host, which is the address the panel sees when the container of the API connects (10.77.0.13). |
| The operations of a customer work | The file manager, the resources, the startup, the settings, the activity, the allocations, the planifications and the databases answer with the data of the real server on the node. |
| A key that is revoked heals itself | The operations ask for a new key and run again when the panel answers 401, so a customer is never stuck because a key was revoked on the panel. |
| The check of a deployment | A product that does not expose a port, like a bot, is checked through the panel instead of over the network. The Discord Bot product carries `healthProbe = { "kind": "container" }`. |

> **Note on the panel.** Server 9, which the previous round had restored after
> the probe that destroyed server 2, was destroyed again by that same probe:
> `DELETE /api/application/servers/9/power` answers 204 through the catch-all
> route of the panel, and that route deletes the server. The probes of this
> round only used GET. The panel now carries the server 8 that existed before,
> the two servers of the check, and the four administrators.


---

## 1. Recovered work

The previous agent's work was **not** deployed to VM 103. The Git repository had
**zero commits** and every file was untracked. What was actually present:

| Path | State found | Action |
|---|---|---|
| `web/src/**` | React 19 + Vite + Tailwind v4 prototype: homepage (`Hero`, `Catalog`, `Configurator`, `Studio`, `Platform`, `Story`, `Ticker`, `Nav`), `Home.tsx`, `Login.tsx`. Login contained `// TODO: POST credentials to the auth API`. | **Preserved.** The homepage is unchanged. `Login.tsx` was rewired to the real API. |
| `api/server.mjs` | 2.3 KB Fastify prototype with 3 routes: `/health`, `/internal/servers`, `/internal/nodes`. No database, no auth, no schema. | Replaced by the platform API. The prototype is kept in Git history at commit `07c7fa6`. |
| `compose.yml` | PostgreSQL 17 + Redis 7, named volumes | Kept, extended with loopback port bindings for host-side migrations and tests. |
| `compose.api.yml` | Single `api` service, no health check, no `env_file` | Rewritten with the `api` and `worker` services, health checks, `no-new-privileges`, `cap_drop: ALL`. |
| `.env` | 17 keys. **Five were empty**: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PUBLISHABLE_KEY`, `SMTP_URL`, `PTERODACTYL_CLIENT_KEY`. `DATABASE_URL` contained the literal text `${POSTGRES_PASSWORD}`, which neither `sh` nor Docker would expand. | Fixed. `DATABASE_URL` now holds the real value, `MAIL_FROM` is quoted, and the missing keys plus `ADMIN_ENROLLMENT_KEY`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `DOMAIN_BASE`, `CADDY_ADMIN_URL`, `CADDY_ADMIN_TOKEN`, `DOMAIN_TARGET` were added. |
| `docs/` | Missing | Created: `API_CONTRACT.md`, `FRONTEND_CONTRACT.md`, `BLIPMADE_DESIGN_PROMPT.md`, `IMPLEMENTATION_STATUS.md`, `PRODUCTION_READINESS.md`. |

The claim of "approximately 33 changed files" could not be confirmed. A filesystem
sweep of the whole VM for `*blipmade*` directories, Prisma schemas and staging
directories found only `/opt/blipmade` and the two Docker volumes. No recoverable
copy existed.

**Checkpoint:** commit `07c7fa6` (prototype baseline) and a source archive at
`/root/backups/blipmade-checkpoint-20261022-190319.tgz` on VM 103.

---

## 2. Backend

`api/` is now a TypeScript Fastify 5 service backed by PostgreSQL 17, Redis 7 and BullMQ.

### Verified working

| Area | Evidence |
|---|---|
| Database schema | `prisma/schema.prisma` — 25 models. Migrations `20261022192556_init`, `20261022200855_product_startup_command` and `20261022211200_pterodactyl_panel_credentials` applied to `blipmade` and `blipmade_test`. |
| Authentication | Register, login, logout, session lookup, email verification, password reset, admin enrollment. scrypt password hashing (`N=16384, r=8, p=1`) with parameters stored inside the hash. |
| Sessions | PostgreSQL-backed. The cookie carries a random token; only its SHA-256 hash is stored. Expired and deleted sessions are rejected. |
| CSRF | Double-submit cookie. Rejected on every state-changing route except the credential-carrying auth endpoints. |
| Rate limiting | Login 10/15 min, register 20/15 min, reset 10/15 min, quote 120/min, order 30/10 min. Answers `429` with a calm message. |
| Authorisation | `CUSTOMER` / `STAFF` / `ADMIN` roles plus 20 granular staff permissions. Administrators hold all of them. |
| Ownership isolation | Instances, orders, tickets and domains answer `404` for another customer, and a refused request changes nothing. |
| Catalog and pricing | Server-side quote only. Integer minor units. `base + extraGB×ramPerGb + extraVCPU×cpuPerUnit + extraGB×diskPerGb + options`, plus percentage or fixed promotions. |
| Orders | Order creation, listing, reading, checkout, cancellation. Prices are frozen onto the order items. |
| Billing | Summary, invoices, subscriptions, cancel at period end, resume, payment method. |
| Tickets | Create, reply, internal notes, status changes, categories, assignment, event history, attachment metadata validation. |
| Admin API | Overview, customers, customer detail, suspend, orders, services, products (create/update/delete), pricing, tickets, promotions, infrastructure sync, audit log, staff permissions, settings, provisioning retry, server import. |
| Audit log | Every mutating admin action and every authentication event is written with actor, target and IP. |
| Webhook idempotency | `WebhookEvent` has a unique `(provider, eventId)`. A redelivered event is acknowledged and not applied twice. |
| Secret storage | The panel password of a customer account is encrypted with AES-256-GCM before it is stored (`api/src/lib/secrets.ts`). The key is derived from `SESSION_SECRET`, so rotating the secret invalidates the stored values instead of leaking them. |

---

## 3. Frontend

React 19 + TypeScript + Vite + Tailwind v4. The marketing homepage and the clearly
labelled Studio simulation are **unchanged**.

| Area | State |
|---|---|
| Shell | `src/ui-app.tsx` — sidebar on desktop, bottom tab bar on phone, loading / empty / error / populated states for every panel, forms, tables, toasts and confirm dialogs. |
| Customer area | Overview, instances, instance detail, deploy, domains, billing, tickets, ticket detail, settings (`src/app/*`). |
| Admin area | Overview, customers, customer detail, orders, services, catalog, pricing, tickets, promotions, infrastructure, audit log, staff, settings (`src/admin/*`). |
| Public pages | Login, register, forgot password, reset password, verify email, documentation, status, not found (`src/pages/*`). |
| Routing | `src/router.tsx` — path parameters, query strings, `safeNext` for post-login redirects, guarded areas. |
| API client | `src/lib/api.ts` — typed client, CSRF header from the readable cookie, session refresh. |
| Scrollbars | One treatment for the whole interface: a flat 10 px track that is invisible, a 6 px thumb in `--color-ink3` (5:1 against the page, so it stays visible without being loud) that turns `--color-acc` on hover and `--color-acc-h` while it is dragged. Chromium and Safari get the `::-webkit-scrollbar` pseudo-elements, Firefox gets `scrollbar-width: thin` with `scrollbar-color` inside a `@supports (-moz-appearance: none)` block, so neither engine ignores the other. `scrollbar-gutter: stable` keeps the layout from shifting between pages. The sideways chip strips keep their bar hidden in every engine through the `bm-hide-scroll` class. |
| Build | `main` bundle 316.71 kB (94.78 kB gzip); every route chunk ≤ 26 kB. |

### The review of 2026-10-23

A round of frontend work followed the audit of the platform. The details are in
[`FRONTEND_REVIEW.md`](FRONTEND_REVIEW.md); the summary:

| Area | State |
|---|---|
| Typeface | proxima nova is the typeface of the interface. It arrives through the **authorized Adobe Fonts web project**, not through the desktop files: the kit URL comes from `ADOBE_FONTS_KIT_URL` and only `use.typekit.net` and `p.typekit.net` are accepted. No font file is committed. Geist stays the fallback until the kit is set. The weights are normalized in the theme tokens to 400, 600 and 700, so nothing is synthesised. Geist Mono still carries the ports, the console and the numbers. |
| Focus | One indicator per control. The global indicator sits in the base layer, so a control with a ring of its own switches the outline off with `focus-visible:outline-none`. A field shows the ring of its container, never an outline on top of it. |
| Autofill | The fill of the browser is painted with the colour of the field (`--bm-field-bg`), so the text stays readable and the rounded shape of the field survives. |
| Auth screens | Five screens share one field (`src/pages/auth-field.tsx`): the password can be shown and hidden, the error and the disabled state are the same everywhere, the attributes of the password manager are correct, no field is focused on arrival, and an empty field is not an error before the form was sent. The resend of the verification mail now carries the address the API asks for. |
| Deploy | The deploy button is built from the catalog of the API and points at a product that can really be ordered. `/app/deploy/wordpress` is gone. A product that cannot be deployed says so instead of leading to a dead end. |
| Overview | A new account gets one onboarding panel with one primary action. An account with services gets four facts and the real list of its services. No number is made up. |
| Phone | The bottom bar shows four entries and a fifth that opens the rest of the navigation, so no page of the customer area or the staff area is unreachable. The bar hides itself while the keyboard is open, the header keeps clear of the notch, and the tap targets are at least 44 px. |
| Verification | 150 checks over 27 routes at 320, 375, 390, 768, 1024 and 1440 px: no sideways scroll, no element out of the viewport, no clipped text, no tap target under 40 px, no covered bar, no error in the console. The checks of the fixed behaviour (one indicator, the autofill, the password button, the order of the keyboard, the links, the deploy buttons) pass. |

---

## 4. Infrastructure

| Item | State |
|---|---|
| PostgreSQL 17 | Running, healthy, named volume `postgres_data` preserved. Loopback port added for host-side migrations and tests. |
| Redis 7 | Running, healthy, named volume `redis_data` preserved. |
| API container | `blipmade-api-1`, port `127.0.0.1:3100`, health check against `/health`. |
| Worker container | `blipmade-worker-1`, BullMQ consumer, own health endpoint on port `3101`. It inherited the API health check from the image and was therefore permanently `unhealthy`; it now answers `/health` itself with the database, queue and worker state. |
| Web container | `blipmade-web-1`, serves the built SPA and proxies `/api` to the API so the session cookie stays first-party. Bound to `10.77.0.13:3000` so the staging build can be reviewed on the LAN; the API stays on loopback. |
| Migrations | Applied automatically by the container entrypoint before the API starts. |
| Backups | `scripts/backup.sh` (pg_dump + config archive + SHA-256 + retention + optional offsite copy), `scripts/restore.sh` (checksum check, listing, confirmation, restore, verification) and `scripts/restore-drill.sh` (restores into a scratch database and compares it with the live one). `postgresql-client-17` is installed on the host, without it `pg_dump` was missing and the backup script could not run at all. |

**Backup drill (run on 2026-10-22):**

```
==> Backup written: /var/backups/blipmade/blipmade-drill-20261022T212029Z.tar.gz
==> Restoring into blipmade_restore_check
  tables         live=26     restored=26
  users          live=1      restored=1
  products       live=5      restored=5
  migrations     live=3      restored=3
  RESULT: the backup restores into a database that matches the live one.
```

---

## 5. Tests

`api/tests` — **60 tests, all passing** (`bash scripts/run-tests.sh` on VM 103).

| File | Covers |
|---|---|
| `auth.test.ts` | Registration, duplicate address, weak password, wrong password, unknown account, session persistence, logout, expired session, deleted session, CSRF rejection and acceptance, rate limiting. |
| `isolation.test.ts` | Instance, order, ticket and admin isolation between customers; anonymous access rejected. |
| `pricing.test.ts` | Base price, resource surcharge, integer minor units, minimum and maximum rejection, non-deployable products, paid options, percentage promotion, invalid promotion, catalog visibility. |
| `webhooks.test.ts` | Payment applied, redelivery ignored, one payment per event, unknown order ignored, no second instance for the same order, order pricing, cancellation rules. |
| `tickets.test.ts` | Ticket creation, replies and status, internal notes hidden from customers, customers cannot write internal notes, status history, attachment type and size validation, admin route protection, real admin counts, product updates, audit entries, staff permission checks. |
| `provisioning.test.ts` | Server created and instance activated, retry does not create a second server, failure is recorded and the instance is not activated, and a missing client key is named in the error instead of failing silently. The panel is replaced with a fake; the flow itself is the production code. |

The tests run against a **separate `blipmade_test` database** so they can never touch
live data. `tests/setup.ts` and `tests/globalSetup.ts` refuse to run against a
database whose name does not end in `_test`, and `scripts/run-tests.sh` enforces the
same rule.

Real bugs found by these tests and fixed:

1. BullMQ rejects a custom job id containing a colon. `provision:${id}` broke every
   order. Now `provision-${id}`.
2. The rate-limit error body had no `statusCode`, so a throttled request answered
   `500` instead of `429`.
3. `/api/health` was registered twice, which crashed the application on startup.
4. `Secure` cookies were forced in production even on the plain HTTP staging
   origin, so no session could be established.
5. The mailer crashed the registration request when `BACKUP_DIR` was not writable.
6. `chmod +x` produced mode `710` in the image, so the entrypoint was unreadable.
7. The worker container was permanently `unhealthy` because it inherited the API
   health check.

---

## 6. Pterodactyl panel contract

The panel does not expose its schema, so every route was discovered by probing the
live panel. `OPTIONS` requests reveal the methods a route accepts, and an empty
`PATCH` body makes the validator answer with the list of required fields. The
Application API splits a server update across **three** routes, and each of them
validates the whole record, so sending fields that belong to another route makes
the panel answer `500`:

| Route | Method | Required fields |
|---|---|---|
| `/api/application/servers` | `POST` | `name`, `user`, `egg`, `docker_image`, `startup`, `environment`, `limits`, `feature_limits`, `allocation.default` (id) and `allocation.allocations` (list) |
| `/api/application/servers/{id}/details` | `PATCH` | `name`, `user` |
| `/api/application/servers/{id}/build` | `PATCH` | `allocation` (**plain id**), `limits`, `feature_limits` |
| `/api/application/servers/{id}/startup` | `PATCH` | `startup`, `environment`, `egg`, `image`, `skip_scripts` |
| `/api/application/servers/{id}/reinstall` | `POST` | none — answers `204` and the node installs the server |
| `/api/client/servers/{uuid}/power` | `POST` | `{"signal":"start"}` — **Client API**, needs a `ptlc_` key |

Two earlier assumptions were wrong and are now corrected in the code:

* `PATCH /build` was called with a payload that mixed all three routes, which made
  the panel answer `500`. With the correct payload the same call answers `200`.
* The install was driven through `PATCH /build`. The panel actually installs through
  `POST /reinstall`, and the install takes **one to three minutes** on the node
  before `container.installed` becomes `1`.

The provisioning flow now follows the real contract: create → `POST /reinstall` →
wait for `installed = 1` → start the container → HTTP health check.

---

## 7. What was not verified

* **The Pterodactyl Client API** (power, files, console, metrics) is implemented and
  the panel confirmed the token format, but `PTERODACTYL_CLIENT_KEY` is still empty,
  so no customer-facing call has been executed. The panel answers
  *"You are attempting to use an application API key on an endpoint that requires a
  client API key"* for the application key and `401` for anything else.
* **The container never became reachable over HTTP.** The container is created on the
  node, the egg's install script runs, `installed` becomes `1`, the power signal is
  accepted and the daemon reports a running container with rising uptime and
  memory — but the allocation port never opens. A scan of the node shows that only
  `30001`, the port of the pre-existing test server, is published. The fault is on
  the node, not in the platform; see the blocked list.
* **The live Stripe integration** was never executed; only the local test gateway
  path was.
* **Email delivery** was never exercised against a real SMTP server.

---

## 8. Blocked

### Blocked by missing configuration

Each item needs one credential. Nothing else is waiting on them.

| Missing | Needed for | Where it comes from |
|---|---|---|
| `PANEL_KEYMINT_URL` and `PANEL_KEYMINT_SECRET` | The key of every customer, for the power control, the file manager, the console, the backups and the databases | The bridge of the panel, see `docs/PANEL_BRIDGE.md`. The shared key is gone: every customer has a key of their own. |
| `PANEL_NODE_ADDRESSES` | The console of a server, when the address the panel gives for the node cannot be reached from here | A list of pairs: the address the panel uses and the address that works. On this network the node answers on `10.77.0.11:8080`, while the panel answers with `node1.blipmade.com:8080`. The name of the node is kept for the certificate, so the certificate of the node is still the one that is checked. |
| `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET` | Live checkout, subscriptions, invoices | Stripe dashboard → API keys. `sk_test_…` first. |
| `SMTP_URL` | Real email (verification, password reset, ticket notifications) | Any SMTP provider. Without it, mail is written to `/var/backups/blipmade/mail/` and logged. |
| `CADDY_ADMIN_URL` + `CADDY_ADMIN_TOKEN` | Customer domain routing on VM 102 | Caddy admin API on the gateway. It stays private; the platform calls it from the server. |
| `OFFSITE_TARGET` | Off-host backups | The host uses **RAID 0**. A local copy is not a backup. |

### Blocked by a fault in the panel or on the node

These are outside the platform and were found by probing the live systems.

| Fault | Evidence | Effect |
|---|---|---|
| ~~The panel never publishes the allocation port~~ **corrected 2026-10-23** | Port `30000` on the node answers with HTTP 200, so the node does publish the ports of a server whose allocation relationship is correct. The servers that Blipmade created earlier never published their port because the platform used the build route to mark a server as installed, which created the container without the allocation relationship. | Fixed in the platform. The provisioning now installs through the install route of the panel, waits for `installed = 1`, starts the container and verifies the application with the probe of the product before it says online. |
| `PATCH /servers/{id}/build` answered `500` | Reproduced with every payload shape until the validator's own field list was read; the correct payload answers `200`. | Fixed in the platform. |
| The panel login answers `500` for every account | `POST /auth/login` answers `TypeError` for an unknown address and for a known one, with and without a reCAPTCHA token. The panel has reCAPTCHA enabled. | The panel's own web interface cannot be used. The platform never needed it. |
| All four panel administrators are `root_admin` | `GET /api/application/users` | Not changed. Every staff account has full administrative rights. |

---

## 9. Next steps

1. Add `PTERODACTYL_CLIENT_KEY`, then run one provisioning job end to end and
   record the result here. The node publishes its ports; the missing piece is
   the key that starts the container.
2. Verify one power cycle, one file listing and one console stream.
3. Add the Stripe test keys, run a real checkout in test mode, and confirm the
   webhook path.
4. Add `SMTP_URL` and complete the verification and reset flows with real mail.
5. Configure `OFFSITE_TARGET` and repeat the restore drill against the off-host copy.
6. Review the customer-domain route design with the gateway owner before pointing
   `blipmade.com` at VM 103. **The live domain, the Caddy gateway and the Proxmox
   networking were not changed.**
7. Turn on the branch protection of `main`, so the checks of the new pipeline
   have to pass before a change lands.

## 10. Audit remediation — 2026-10-23

The 20 findings of the independent audit are listed one by one in
[`AUDIT_REMEDIATION.md`](AUDIT_REMEDIATION.md), with the files that changed and
the tests that cover each of them. The short version:

| Area | Before | After |
|---|---|---|
| Resource upgrade | Applied without charging | Quote, order, payment, then apply; a rejected change leaves the instance alone and refunds the customer |
| Webhooks | Inserted, then processed; a failure answered 200 | A ledger with `received → processing → processed`, a failure answers 500, a failed event is retried and can be replayed |
| Subscriptions | One per checkout, approximate periods | One per order line, the period comes from Stripe, the invoices are upserted, the customer is stored |
| Promotions | Consumed when the order was created | Reserved at the order, consumed at the payment, a limit per account, reservations expire |
| Catalog | Twelve static products with illustrative prices | The catalog of the API, honest availability, the CTA goes to `/app/deploy/:slug` |
| Client API | Pterodactyl 0.x endpoints | The 1.x endpoints with typed JSON:API adapters and a contract test |
| Console | Credentials for the browser | A relay on the server; the panel token never leaves it |
| Provisioning retry | Could reinstall a running server | The step is recorded, the reinstall happens once, an instance lock, reconciliation |
| Domains | Any hostname, proved by an A record | A random TXT token, reserved names, a claim that cannot be taken over |
| Deployment check | Any answer below 500 | The probe of the product; 404 and 403 are failures |
| Status page | One panel ping for everything | Nine components, each measured on its own |
| Secret hygiene | A password in a public script | Every credential comes from the environment; the TLS check cannot be switched off |
| Scripts | Deleted by default | A dry run by default, an allowlist, the protected server is refused |
| CI | None | Typecheck, tests, build, secret scan, dependency audit, schema drift |
| Backups | Local only | Encrypted, verified, with a retention window; the destination is still missing |
| Attachments | A description of a file | A real upload with a size limit, a type allowlist and access rules |
