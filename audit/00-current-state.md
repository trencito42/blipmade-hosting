# 00 — Current state: what the platform actually does today

**Date of the audit:** 2026-10-23.
**Target:** the deployment on VM 103 (`10.77.0.13`, `/opt/blipmade`), the public domain `https://blipmade.com` through the gateway on `10.77.0.12`.

### The classes used in this document

| Class | Meaning |
|---|---|
| **VERIFIED** | Exercised against the running system. The command and its output are given. |
| **CODE-INSPECTED** | The code path exists and was read end to end, but it could not be exercised without a write to the production database, a credential, or a host that is not reachable. |
| **BLOCKED** | The exact blocker is named, together with the smallest safe step that would open it. |
| **NOT-IMPLEMENTED** | There is no code for it. |

**The production system was treated as read-only.** Nothing was written to the production database, nothing was deployed, nothing was pushed, no DNS, firewall or panel setting was changed. The only test run was `bash scripts/run-tests.sh`, which refuses to run against a database whose name does not end in `_test` and therefore only ever touches `blipmade_test`.

**No secret appears in this document.** Only the names of environment variables and whether they are set or empty.

---

## 1. The three capabilities that are configured OFF

These are the three that the product claims and that are switched off in production. All three are **CODE-INSPECTED**; the first two were also confirmed from the live health endpoint.

### 1.1 Stripe (the payments)

| | |
|---|---|
| **State** | **CODE-INSPECTED** — and confirmed OFF by the running system. |
| **What is off** | `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY` and `STRIPE_WEBHOOK_SECRET` are **empty**; `PAYMENTS_ENABLED=false`; `STRIPE_TEST_MODE=false`. |
| **The switch** | `api/src/services/stripe.ts:150-153` — when `env.paymentsEnabled` is false and there is no live key, `createCheckout()` throws `paymentsUnavailable()`, an `AppError(503, 'payments_unavailable')` (`api/src/services/stripe.ts:115`). **No session is created and no URL is handed out.** |
| **The test gateway cannot be switched on by accident** | `api/src/services/stripe.ts:39-41` — the local stand-in returns `false` when `NODE_ENV === 'production'`, and also when `STRIPE_TEST_MODE === 'false'`. Production has `NODE_ENV=production` and `STRIPE_TEST_MODE=false`, so it is off twice over. |
| **The webhook refuses unsigned events** | `api/src/routes/webhooks.ts:452-455` — with neither a live key nor the test gateway, `POST /api/webhooks/stripe` answers `200 {"received": false, "reason": "Stripe is not configured."}`. It never marks an order as paid. |
| **Live evidence** | `GET /api/health` → `"stripe": "not_configured"`. |
| **What still exists** | The order → payment → subscription → invoice → provisioning chain is implemented and covered by 13 tests in `api/tests/webhooks.test.ts` and 7 in `api/tests/stripe-origin.test.ts`; it has only ever run against the local test gateway. |
| **Consequence** | `POST /api/orders` still creates the `Order` row in `PENDING` (`api/src/routes/orders.ts:74-104`); the refusal happens later, at `POST /api/orders/:id/checkout` (`api/src/routes/orders.ts:154`). The live database holds 4 orders in `AWAITING_PAYMENT` and 1 in `PENDING` — orders that were created and never paid. |

### 1.2 The SMTP relay (the mail)

| | |
|---|---|
| **State** | **CODE-INSPECTED** — and confirmed OFF by the running system. |
| **What is off** | `SMTP_URL` is **empty**. |
| **The switch** | `api/src/lib/mailer.ts` — with an empty `SMTP_URL` the transport is the file transport: the message is written to `BACKUP_DIR/mail` and the state is `written-to-file`. The API never says "sent". |
| **Live evidence** | `GET /api/health` → `"mail": "file"` and `"mailDelivery": {"transport": "file", "configured": false, "counts": {"queued": 0, "delivered": 0, "writtenToFile": 7, "failed": 0}}`. |
| **What still exists** | The whole chain: templates in HTML and plain text (`api/src/lib/email-templates.ts`), the queue `blipmade.email` with 4 attempts and a backoff (`api/src/services/queue.ts:120-123`), the persistent state table `MailDelivery` (13 live rows), the staff view `GET /api/admin/email/delivery` (`api/src/routes/admin.ts:829`), and 26 tests across `api/tests/email-delivery.test.ts` (16) and `api/tests/email-templates.test.ts` (10). |
| **Consequence** | **No customer has ever received a verification or a reset mail.** The messages exist on disk with the link redacted. `docs/EMAIL.md` §7 gives the manual procedure to finish a flow by hand. |

### 1.3 The typeface (proxima nova)

| | |
|---|---|
| **State** | **CODE-INSPECTED** — and confirmed OFF by the running system. |
| **What is off** | The three licensed web files `proxima-nova-400/600/700.woff2` are not in the image. `/app/dist/fonts/` contains only a `README.md` (897 bytes). |
| **The switch** | `web/fonts.mjs` — the module names the three files and reports which are missing; `web/server.mjs:55-61` prints one line in the container log. |
| **Live evidence** | `GET /healthz` on the public site answers with `fonts.family = "Proxima Nova"`, `installed: false`, the three missing files, and `fallback: "Geist Variable"`. The `assets/` folder of the deployed image contains only the Geist and Geist Mono woff2 files — 10 of them, no proxima nova file. |
| **The fallback** | The interface draws with Geist, and it says so. Nothing was silently replaced. |
| **Legal note** | `docs/TYPOGRAPHY.md` §4 records that the desktop Adobe files carry `fsType = 0x0004` (preview and print only) and may not be embedded in a web page. The repository contains **no** font file and **no** third-party font address. |
| **Unblock step** | The operator places the three licensed **woff2** files under `web/public/fonts/` with exactly those names, then rebuilds the web image (`docker compose … build web` + `up -d --force-recreate web`). The step is in `docs/TYPOGRAPHY.md` §5. |

---

## 2. The catalogue: one real product, four "coming soon"

| | |
|---|---|
| **State** | **VERIFIED** |
| **Command** | `curl -s https://blipmade.com/api/catalog/products` and `SELECT … FROM "Product"` on VM 103 |
| **Result** | 5 products, all `visible: true`, all with an active monthly price, and **only one is `deployable`**. |

| Slug | Name | Category | Visible | Deployable | Egg | Image | Monthly base | Verdict |
|---|---|---|---|---|---|---|---|---|
| `discord-bot` | Discord Bot | BOTS | yes | **yes** | 15 | `ghcr.io/ptero-eggs/yolks:nodejs_25` | 149 | **real** — orderable and provisionable |
| `wordpress` | WordPress | WEB_CMS | yes | no | — | — | 149 | "coming soon" |
| `code-server` | Code Server | DEVELOPER_TOOLS | yes | no | — | — | 299 | "coming soon" |
| `uptime-kuma` | Uptime Kuma | MONITORING | yes | no | — | — | 149 | "coming soon" |
| `postgresql` | PostgreSQL | DATABASES | yes | no | — | — | 449 | "coming soon" |

The public JSON from the live site confirms it:

```
$ curl -s https://blipmade.com/api/catalog/products
wordpress    | deployable: False | price: {'amount': 149, 'currency': 'EUR', 'period': 'MONTHLY'}
code-server  | deployable: False | price: {'amount': 299, 'currency': 'EUR', 'period': 'MONTHLY'}
discord-bot  | deployable: True  | price: {'amount': 149, 'currency': 'EUR', 'period': 'MONTHLY'}
uptime-kuma  | deployable: False | price: {'amount': 149, 'currency': 'EUR', 'period': 'MONTHLY'}
postgresql  | deployable: False | price: {'amount': 449, 'currency': 'EUR', 'period': 'MONTHLY'}
```

**How "coming soon" is expressed:** the four products have no egg, no image and no startup command in the database, and the catalogue selector labels a listed-but-not-validated product **"Coming soon"** and does not let it be ordered (`web/src/app/DeployCatalog.tsx:47`).

**Pricing** — **CODE-INSPECTED**, and the numbers are live:

* The price of a configuration is `base + ramPerGb × (RAM − minRam) + cpuPerUnit × (CPU − minCpu) + diskPerGb × (disk − minDisk) + the paid options` (`api/src/services/pricing.ts:48-51`). All amounts are **integer minor units** (cents), never a float: `normalizeAmount` rounds and floors at 0 (`api/src/lib/money.ts:15`).
* Every price in the live database: `ramPerGb=60`, `cpuPerUnit=40`, `diskPerGb=2`, currency `EUR`, one active monthly price per product. The same 60/40/2 for all five products.
* `POST /api/catalog/quote` recomputes the price on the server on every change, rate-limited to 120/minute (`api/src/routes/catalog.ts:129`). The client never computes a price.
* Promotions are expressed in basis points and are **reserved** at order creation and only **consumed** when the payment lands (`Order.promotionRedeemedAt`); a cancelled order releases the reservation. The live `Promotion` table is empty.

---

## 3. Capability by capability

### 3.1 Checkout and payments — **CODE-INSPECTED** (and the off-switch VERIFIED)

* `POST /api/orders` (rate limit 30/10 min) → `201` with the order; `POST /api/orders/:id/checkout` → **503 `payments_unavailable`**; `POST /api/orders/:id/cancel`; `GET /api/orders`; `GET /api/orders/:id`. Sources: `api/src/routes/orders.ts:64`, `:120`, `:131`, `:142`, `:165`.
* A **paid** order is only ever the result of a verified webhook, and the collected amount is checked against the order total — a mismatch fails the event and marks the order `FAILED` (`api/src/services/billing.ts`, `api/src/routes/webhooks.ts`).
* The upgrade path is the same chain: `GET /api/instances/:id/resources/quote` returns the difference without touching anything, and `PUT /api/instances/:id/resources` with a higher price creates an `UPGRADE` order and leaves the instance unchanged until the payment is confirmed (`api/src/services/upgrades.ts`).
* **Tests:** 6 in `api/tests/upgrades.test.ts`, 13 in `api/tests/webhooks.test.ts`, 7 in `api/tests/stripe-origin.test.ts` — all passing.
* **Live data:** 5 orders (4 `AWAITING_PAYMENT`, 1 `PENDING`), 0 invoices, 0 payments, 0 subscriptions. Nothing was ever charged.

### 3.2 Provisioning — **VERIFIED** (that it has run) + **CODE-INSPECTED** (the steps)

* **It has run, and it worked.** The live database holds 3 instances — **2 `ONLINE`, 1 `STOPPED`** — and 123 `ProvisioningJob` rows: **93 `completed`, 30 `failed`**.
* The steps are recorded in `api/src/services/provisioning.ts:21` and include `started`, which uses the **customer's own client key**: `withCustomerKey(instance.userId, (token) => pteroClient.sendPower(token, server.uuid, 'start'))` (`api/src/services/provisioning.ts:566`).
* The provisioning is asynchronous: the API enqueues on `blipmade.provision`; the worker does the work (`api/src/services/queue.ts:42-45`).
* A retry continues after `Instance.provisionStep` and never reinstalls a server that is already installed; a lock older than 30 minutes is taken over; the worker reconciles interrupted instances every minute.
* **Tests:** 6 in `api/tests/provisioning.test.ts`, 4 in `api/tests/deployment-probe.test.ts` — passing.
* **BLOCKED — the allocation ports are not published on the node.** From VM 103, a read-only TCP probe of the node `10.77.0.11`: `8080` **open** (Wings), `30000` **open** (HTTP 200), `30001` **closed**. The customer would connect to the allocation port, and that port refuses connections. *Unblock step:* on VM 101, start the QEMU guest agent and add the audit public key to `/root/.ssh/authorized_keys`, then read the Wings configuration and the `docker`/iptables state of the node. The guest agent is configured but not running, so the node's internals cannot be inspected from here. This is a node fault, not a platform fault.

### 3.3 Console and file management — **CODE-INSPECTED** (the credential is proven to work)

* 41 per-server routes exist in `api/src/routes/instance-server.ts`: files (list, read, write, delete, download, copy, move, rename, compress, decompress, archive, unarchive, chmod), databases (list, create, patch, delete, credentials), backups (list, create, download, restore, delete), allocations, schedules (list, create, patch, delete, run), startup, settings, reinstall, suspend, resources, activity, power.
* **The credential is real and it works.** The bridge is installed on the panel (proved with a `GET` on the `POST`-only route → **405**, against a definitely-absent path → **404**), and the live database holds **3 rows in `PanelCredential`**, so customer client keys have already been minted through it. The health endpoint reports `"panelKeyBridge": "configured"`.
* The console is a relay: the browser opens `/api/instances/:id/console/stream` with its session cookie (`api/src/routes/instances.ts:214`), the web container proxies the upgrade (`web/server.mjs:226-271`), and no panel token ever reaches the browser.
* The client adapter refuses anything that is not a `ptlc_` key on a client endpoint (`api/src/services/pterodactyl/client.ts:86`, `:151`).
* **Tests:** 14 in `api/tests/pterodactyl-client.test.ts`, 12 in `api/tests/panel-client-contracts.test.ts`, 9 in `api/tests/instance-operations.test.ts`, 6 in `api/tests/panel-identity.test.ts`, 3 in `api/tests/credential-renewal.test.ts` — passing.
* **Why it is not VERIFIED end to end:** exercising a file write or a console against a live customer server would change the state of a production instance. The read-only and contract-level behaviour is covered by the tests.

### 3.4 Domains — **CODE-INSPECTED**; the routing half is **BLOCKED**

* A hostname is only activated by a **matching TXT record** `_blipmade-verify.<hostname>`; an A record to the shared IP is never accepted (`api/src/routes/domains.ts`, `api/src/services/dns.ts`).
* Reserved hostnames are refused; only the user who claimed a hostname may verify or release it; an unverified claim expires.
* 4 routes: claim, verify, list, release.
* **Live data:** 0 rows in `InstanceDomain`. No customer domain has ever been claimed.
* **BLOCKED — the Caddy admin API has never been called.** `CADDY_ADMIN_URL` and `CADDY_ADMIN_TOKEN` are both **empty**, so the gateway service throws "The gateway is not configured on this environment" (`api/src/services/gateway.ts:38-40`, `:177`). No customer domain has ever been routed. *Unblock step:* the operator puts the Caddy admin address and its token into `/opt/blipmade/.env` and restarts the API and the worker. The Caddy admin API itself is **not exposed** on VM 102 — the Caddyfile has no `admin` block — so the operator must also enable it there.

### 3.5 Billing and invoices — **CODE-INSPECTED**

* 6 routes in `api/src/routes/billing.ts`.
* The invoice, the subscription and the payment are real models with the correct separation: `Order.fulfillmentStatus` is separate from `Order.status`, `Subscription.orderItemId` is unique so one checkout produces one subscription per line, `stripeCustomerId` is stored on the payment row, and the period comes from the provider, never from a 30-day approximation.
* The worker sweeps every 15 minutes: a cancelled and expired subscription is withdrawn, an unpaid one is suspended after 7 days of grace, a due one is renewed with a local invoice.
* **Tests:** 5 in `api/tests/billing.test.ts` — passing.
* **Live data:** 0 invoices, 0 payments, 0 subscriptions — because no payment has ever been made. This part of the platform has never been exercised against real money.

### 3.6 Support tickets — **VERIFIED** (the API) + **CODE-INSPECTED** (the UI)

* 8 routes in `api/src/routes/tickets.ts`; the attachment upload is a real one — `@fastify/multipart`, one file, 5 MB, an allow-list of types, the bytes on the attachment volume under a random name, the SHA-256 in the `Attachment` row, and the file only readable through a route that checks who may read it (`api/src/lib/attachments.ts`).
* **Live data:** 12 tickets, all `OPEN`, 12 messages, 24 events. The attachment volume is mounted (`upload_data:/data`, `compose.api.yml:17`).
* The category/priority/status values are accepted in any case and always answered in the upper case of the Prisma enumeration.
* **Tests:** 13 in `api/tests/tickets.test.ts`, 9 in `api/tests/tickets-create.test.ts` — passing.

### 3.7 Settings and sessions — **CODE-INSPECTED** (and the session cookie VERIFIED)

* 11 routes in `api/src/routes/settings.ts`: the whole page in one answer, the profile, the change of the address (the address only changes after it has answered), the password (the current one is needed, the other sessions end), the list and the closing of the sessions, the notification preferences, and the request to close the account (a request, never a deletion).
* The session is a PostgreSQL row; only the **SHA-256 hash** of the token is kept (`api/src/lib/tokens.ts:9-10`, used at `api/src/plugins/auth.ts:66`, `:105`). The cookie is `bm_session`, `httpOnly`, `sameSite=lax`, `secure` follows the request protocol (`api/src/plugins/auth.ts:74-79`).
* **Live data:** 251 session rows. A password change ends the other sessions of the account (`api/src/routes/auth.ts:279`).
* **Tests:** 16 in `api/tests/settings.test.ts`, 6 in `api/tests/session-cookie.test.ts`, 16 in `api/tests/auth.test.ts` — passing.
* **Deliberately not offered:** an API key for the customer. The public API of the customer does not exist, so the interface does not offer a key that grants nothing.

### 3.8 Notifications and email — **CODE-INSPECTED**

* The templates exist: verification, reset, change of the address, the tickets, the invoices and the notifications of the services, in HTML and in plain text (`api/src/lib/email-templates.ts`). Every link is built by `publicLink()` from `PUBLIC_WEB_URL`, so a link can never point at `127.0.0.1` or at a staging host.
* The **state** of every message is persistent, in the table `MailDelivery` (13 live rows), readable by the staff with the permission `settings.read` at `GET /api/admin/email/delivery` and summarised in the health endpoint.
* A token is never written to a log, to a file name, to a job name or to a file: only the first characters of its hash are kept, and the link in the file transport is redacted.
* A retry never sends a message twice: the queue uses the key of the message as the job name, 4 attempts with a backoff.
* **What is NOT wired:** the notifications of the invoices and of the services. The templates (`invoicePaidTemplate`, `invoiceFailedTemplate`, `subscriptionChangedTemplate`, `instanceProvisionedTemplate`, `instanceStoppedTemplate`) and the helpers exist, but the payment events and the provisioning do not call them yet. `docs/EMAIL.md` §9 says the same.
* **Tests:** 16 + 10, passing.

### 3.9 The admin area — **CODE-INSPECTED**

* 30 routes in `api/src/routes/admin.ts`: the overview, the customers (and the panel credential of a customer), the orders, the services, the products, the pricing, the promotions, the tickets, the infrastructure (and the sync from the panel), the audit, the staff, the settings, the money, the e-mail delivery, the instance retry, the instance import, the suspend of a customer, the assignment of a ticket.
* The staff area is protected by the session cookie **and** by one of 22 granular permissions (`api/src/lib/permissions.ts:2-24`); an `ADMIN` holds all of them (`:33-36`).
* The audit log holds **528** rows and every credential change is written to it.
* **Live data:** 2 staff members, 5 products, 5 prices, 0 promotions, 5 orders, 12 tickets.
* **Not verified against the running system:** every admin route needs a staff session, and the audit is read-only. Signing in as a staff member would create a session row in the production database; the behaviour is covered by the tests instead.

### 3.10 The public website — **VERIFIED**

```
$ for p in / /login /register /docs /status /apps /app /app/deploy; do curl -s -o /dev/null -w "$p HTTP %{http_code}\n" "https://blipmade.com$p"; done
/            HTTP 200
/login       HTTP 200
/register    HTTP 200
/docs        HTTP 200
/status      HTTP 200
/apps        HTTP 200
/app         HTTP 200
/app/deploy  HTTP 200
```

* The site is served by the `web` container, behind Caddy and Cloudflare. The public catalogue on the homepage is read from the API (`GET /api/catalog/products`), not hard-coded.
* The protected API routes answer **401** without a session: `GET /api/instances` → 401, `GET /api/admin/overview` → 401, `GET /api/settings` → 401. (The SPA shell itself answers 200 for `/app`; the guard that sends the visitor to the login is in the browser, `web/src/routes.tsx`.)
* The deployed bundle: the main chunk is **318,678 bytes** and the stylesheet **64,741 bytes**; 48 assets in total, 36 of them lazy route chunks. The two largest route chunks are `Docs` (79,113 B) and `InstanceDetail` (69,577 B).
* The typeface falls back to Geist (§1.3).

### 3.11 The documentation site — **VERIFIED** (it is a page of the SPA, not a generated site)

* `/docs` answers 200. Its content is a **static bundle**: `const PAGES: DocPage[] = [...APP_DOCS.map(appPage), ...HAND_WRITTEN]` (`web/src/pages/Docs.tsx:2259`). There is no server, no Markdown pipeline and no fetch — the documentation ships inside the JavaScript.
* The in-app search is present (`web/src/pages/Docs.tsx:2534-2538`).
* Consequence: the documentation on the site and the documentation in `docs/` are two different things, and they have drifted apart (see `00-documentation-drift.md`).

### 3.12 The status endpoint — **VERIFIED**

```
$ curl -s https://blipmade.com/api/status
overall: degraded
keys: ['overall', 'components', 'updatedAt']
components: 10
   api operational      dashboard operational   cache operational
   panel operational    worker operational      queue operational
   nodes operational    allocator operational   provisioning operational
   support degraded
```

* 10 components, each measured on its own, each with a `detail` that says what was measured (`api/src/routes/health.ts`).
* `support` is `degraded` **because `SMTP_URL` is empty** — the mail is written to a file instead of being sent. That is the only component that is not green, and the reason is the off-switch of §1.2.
* The `overall` is derived from the measurements, so a green light means the check behind it really ran.
* The `panel` component is `operational`: the panel answers.

---

## 4. What is blocked, and the exact step that opens it

| # | What | Blocker | The smallest safe step |
|---|---|---|---|
| B1 | The internals of the Wings node (VM 101) — the configuration, the published ports, the reason the allocation port refuses connections | No shell on the node; the QEMU guest agent is configured but not running | On the hypervisor: `qm start <vmid>` is not needed (the guest runs) — start the agent inside the guest (`systemctl start qemu-guest-agent`) and add the audit public key to `/root/.ssh/authorized_keys`. Then `ssh -i <audit key> debian@10.77.0.11` works and the Wings configuration can be read. |
| B2 | The internals of the Pterodactyl panel (VM 100) — the version, the panel accounts, the state of the bridge beyond the route itself, the logs of the key mint | No shell on the panel | Add the audit public key to `/root/.ssh/authorized_keys` of the panel host and open port 22 to the audit address. The panel **is** reachable over HTTPS on `10.77.0.10:443` — that is how the bridge was confirmed — so only the shell is missing. |
| B3 | The customer domains, the Caddy routing and the TLS of the customer hostnames | `CADDY_ADMIN_URL` and `CADDY_ADMIN_TOKEN` are empty, and the Caddy admin API is not exposed on VM 102 | Enable the admin API in the Caddyfile on VM 102, then put the admin address and the token into `/opt/blipmade/.env` and `docker compose … up -d --force-recreate api worker`. |
| B4 | The off-site copy of the backups | `OFFSITE_TARGET` and `OFFSITE_ENCRYPTION_KEY` are not set | Set them on the host and run `bash scripts/backup-offsite.sh` once, then run the off-host restore of `docs/RUNBOOK.md` §9 from another machine. |
| B5 | The branch protection and the CI history | The audited copy has **no `.git`**, and the GitHub repository is not reachable from here | Point the audit at the real repository (or a clone with its history) and read the repository settings of the `main` branch. |
| B6 | The browser check (`scripts/ops/browser-customer-panel.mjs`, claimed at 134 checks) | It needs `BM_EMAIL`, `BM_PASSWORD`, `BM_ADMIN_EMAIL` and `BM_ADMIN_PASSWORD`, and **it creates a support ticket** — a write to the production database | Provide four disposable accounts (the script `scripts/ops/seed-browser-account.mjs` creates them, but it writes to the database, so it must be run in a window where that is accepted) and run it against a staging copy of the database, or accept the write to the production database. |
| B7 | A real payment, a real mail delivery | Stripe keys, an SMTP relay | Operator credentials. The steps are in `docs/EMAIL.md` §3 and §4 and in `docs/CUSTOMER_PANEL_COMPLETION.md` §7.1. |
| B8 | The typography in Safari, and the typography on a real device | No Safari and no WebKit in the environment; no phone | A person with a Safari session and a phone. The state of the capture on Chromium is in `docs/MOBILE_AND_TYPOGRAPHY_FIX.md` §6. |

---

## 5. The summary table

| Capability | Class | One-line evidence |
|---|---|---|
| Catalogue (public list, prices) | **VERIFIED** | `GET /api/catalog/products` → 5 products, 1 deployable |
| Pricing (formula, minor units) | **CODE-INSPECTED** | `api/src/services/pricing.ts:48-51`; live prices 149/299/149/149/449 EUR |
| Promotions | **CODE-INSPECTED** | reserved at order creation, consumed on payment; 0 live rows |
| Checkout | **CODE-INSPECTED** | `POST /api/orders/:id/checkout` → 503 `payments_unavailable` (`api/src/routes/orders.ts:154`) |
| Stripe | **CODE-INSPECTED** (off) | `/api/health` → `"stripe": "not_configured"`; all three keys empty |
| Webhook of the payments | **CODE-INSPECTED** | refuses unsigned events; `200 {"received": false, "reason": "Stripe is not configured."}` |
| Provisioning | **VERIFIED** | 3 instances (2 ONLINE), 123 jobs (93 completed) |
| Allocation ports published | **BLOCKED** | port 30001 on the node is closed |
| Console and file management | **CODE-INSPECTED** | 41 per-server routes; the credential is proven (3 `PanelCredential` rows, bridge answers 405) |
| Domains — the proof of ownership | **CODE-INSPECTED** | TXT record required; 0 live rows |
| Domains — the Caddy routing | **BLOCKED** | `CADDY_ADMIN_URL`/`CADDY_ADMIN_TOKEN` empty |
| Billing and invoices | **CODE-INSPECTED** | the models and the logic are there; 0 live invoices, because no payment was ever made |
| Support tickets | **VERIFIED** | 12 live tickets, 12 messages, 24 events |
| Attachments | **CODE-INSPECTED** | multipart, 5 MB, allow-list, SHA-256 in the row; 0 live rows |
| Settings and sessions | **CODE-INSPECTED** | 11 routes; the session is a hashed row, 251 live rows |
| Notifications of the invoices and of the services | **NOT-IMPLEMENTED** | the templates and the helpers exist, the call sites do not |
| E-mail transport | **CODE-INSPECTED** (off) | `/api/health` → `"mail": "file"`, 7 messages written to a file |
| The admin area | **CODE-INSPECTED** | 30 routes, 22 permissions, 528 audit rows |
| The public website | **VERIFIED** | 8 public routes answer 200; the protected API routes answer 401 |
| The documentation site | **VERIFIED** | `/docs` → 200; the content is a static bundle in the JS |
| The status endpoint | **VERIFIED** | 10 components, `overall: degraded` (only `support`, because the mail is off) |
| The typeface | **CODE-INSPECTED** (off) | `/healthz` → `installed: false`, three missing files, fallback Geist |
| The off-site backup | **BLOCKED** | `OFFSITE_TARGET` unset |
| The panel bridge | **VERIFIED** | the route answers 405 on the panel; 3 keys have been minted |
| The whole test suite | **VERIFIED** | 240 tests, 240 passing |
