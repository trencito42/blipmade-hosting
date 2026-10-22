# Blipmade — audit remediation

Last updated: 2026-10-23

This file tracks the 20 findings of the independent technical audit (BM-AUD-001
… BM-AUD-020) and what was done about each of them. Every "verified" line
names the command that was run on VM 103 (`10.77.0.13`); a finding is never
called verified on the strength of a code change alone.

Legend: **Fixed** — the code is changed and checked. **Partial** — the code is
changed for the part that can be closed without an external credential, and the
rest is listed. **Blocked** — the fix needs a credential or an infrastructure
decision that only the operator can make.

---

## Summary

| ID | Finding | Severity | State |
|---|---|---|---|
| BM-AUD-001 | Resource upgrade without billing | P0 | Fixed |
| BM-AUD-002 | Webhook can be lost | P0 | Fixed |
| BM-AUD-003 | Payment and subscription correctness | P0 | Fixed |
| BM-AUD-004 | Domains without proof of ownership | P0 | Fixed |
| BM-AUD-005 | Catalog does not reflect the real offer | P0 | Fixed |
| BM-AUD-006 | Client API incompatible with Pterodactyl 1.x | P0 | Fixed |
| BM-AUD-007 | No console relay | P0 | Fixed |
| BM-AUD-008 | Retry can reinstall a running server | P0 | Fixed |
| BM-AUD-009 | Hardcoded credential in a public repository | P1 | Fixed |
| BM-AUD-010 | Client key scope is global and unusable | P1 | Partial |
| BM-AUD-011 | `trustProxy: true` | P1 | Fixed |
| BM-AUD-012 | Caddy API never integrated | P1 | Partial |
| BM-AUD-013 | Backups only on RAID 0 | P1 | Partial |
| BM-AUD-014 | Destructive scripts in a public repository | P1 | Fixed |
| BM-AUD-015 | No CI, no root README | P1 | Fixed |
| BM-AUD-016 | Renewals, suspension, withdrawal | P2 | Fixed |
| BM-AUD-017 | No real attachment upload | P2 | Fixed |
| BM-AUD-018 | Status page can be green without checking | P2 | Fixed |
| BM-AUD-019 | Promotion consumed at order creation | P2 | Fixed |
| BM-AUD-020 | Deployment check accepts any answer | P2 | Fixed |

---

## BM-AUD-001 — A resource upgrade was applied without billing

**Was:** `PUT /instances/:id/resources` wrote the new limits to the panel and
the database in the same request. Nothing was charged, and the price field
followed whatever the client sent.

**Now:** a resource change is a paid product.

1. `GET /instances/:id/resources/quote` returns the difference without touching
   anything.
2. `PUT /instances/:id/resources` with a higher price creates an order
   (`kind = UPGRADE`) plus a Stripe Checkout session and answers
   `status: "requires_payment"` with the checkout URL. **The instance is not
   changed.**
3. The webhook applies the change after the payment is confirmed
   (`api/src/services/upgrades.ts`).
4. A change that costs less is applied right away and lowers the recurring
   amount.
5. If the panel refuses the new limits, the database is left untouched, the
   order is marked `FAILED`, the customer is refunded and an instance event
   records what happened.

Files: `api/src/services/upgrades.ts` (new), `api/src/routes/instances.ts`,
`api/src/services/stripe.ts`, `api/prisma/schema.prisma` (`Order.kind`,
`Order.requestedConfig`, `Order.fulfillmentStatus`).

Tests: `api/tests/upgrades.test.ts` — 6 cases, including "the instance is
unchanged before the payment" and "a rejected change leaves the instance
alone".

## BM-AUD-002 — A webhook could be lost

**Was:** the event was inserted, the handler ran, and a failure returned
`200`. The row was never marked, so a redelivery looked like a duplicate and
the payment was lost.

**Now:** the ledger carries the processing state
(`received → processing → processed`, or `→ failed`).

- A failed event is answered with **500**, so the provider retries it.
- A redelivery of a failed event is processed again; a redelivery of a
  processed event is ignored as a duplicate.
- An event whose processing was interrupted is retried after five minutes.
- `POST /api/webhooks/stripe/replay` replays failed events from the stored
  payload, and `GET /api/webhooks/stripe/failed` lists them.
- The worker retries the failed events every five minutes.

Files: `api/src/routes/webhooks.ts`, `api/src/services/billing.ts`,
`api/prisma/schema.prisma` (`WebhookEvent.status`, `attempts`,
`lastAttemptAt`).

Tests: `api/tests/webhooks.test.ts` — "refuses a payment that does not match
the order and keeps the event for a replay", "replays a failed event".

## BM-AUD-003 — Payment and subscription correctness

**Was:** at most one subscription for the whole checkout, approximate period
dates, no invoice upsert, `stripeCustomerId` never populated, so the billing
portal could not work.

**Now:**

- **One subscription per order line.** `Subscription.orderItemId` is unique and
  `Subscription.stripeSubscriptionItemId` identifies the line inside the
  Stripe subscription, so a checkout with several items produces several
  subscriptions that can be cancelled on their own.
- **The period comes from Stripe**, never from a thirty-day approximation:
  `retrieveStripeSubscription()` reads `current_period_start` and
  `current_period_end`, and the invoice carries the period of every renewal.
- **Invoices are upserted** from the provider payload
  (`upsertInvoice()`), so a local invoice exists even when the local one was
  missing.
- **`stripeCustomerId` is stored** on the payment row, and the billing portal
  finds it with `findStripeCustomerId()`.
- **The collected amount is verified** against the order total. A mismatch
  fails the event and marks the order `FAILED` instead of provisioning it.
- The order has its own `fulfillmentStatus`, so "paid" and "running" are two
  separate facts.

Files: `api/src/services/stripe.ts`, `api/src/routes/webhooks.ts`,
`api/src/routes/orders.ts`, `api/prisma/schema.prisma`.

Tests: `api/tests/webhooks.test.ts` — "creates one subscription per order
line", "provisions one instance per unit of a line".

## BM-AUD-004 — Domains without proof of ownership

**Was:** any authenticated user could claim any hostname, and verification
only checked that a DNS A record pointed at the shared gateway IP, which
proves nothing because every customer uses the same IP.

**Now:** the hostname has to be proved with a TXT record.

- Claiming generates a random token, stores it, and returns the record to
  publish: `_blipmade-verify.<hostname>` with the token as the value.
- **Only a matching TXT record activates the hostname.** An A record to the
  shared IP is never accepted.
- Reserved hostnames are refused: the platform domain and its subdomains, the
  platform service names, and the list in the `reserved_domains` setting.
- A hostname can only be claimed, verified or released by the user who claimed
  it. A second user cannot take it over. An unverified claim expires.
- Routing to Caddy happens only after the proof was accepted.

Files: `api/src/routes/domains.ts`, `api/src/services/dns.ts`,
`api/src/services/gateway.ts`, `api/prisma/schema.prisma`
(`InstanceDomain.verificationToken`, `verificationHost`, `verifiedAt`,
`claimedByUserId`).

Tests: `api/tests/domains.test.ts`.

## BM-AUD-005 — The catalog did not reflect the real offer

**Was:** twelve static products with illustrative prices, a CTA to
`/login?next=/deploy/<slug>` where only `/app/deploy/:slug` exists (so the
login landed on a 404), and five seeded products that were all
`deployable: false` with generic images.

**Now:**

- The homepage catalog is served by the API. The public list only contains
  visible products that have an active price, and every amount is the server's
  integer cents.
- `/deploy/:slug` redirects to `/app/deploy/:slug`, and the login carries
  `?next=/app/deploy/:slug`.
- A product that is not deployable has no deploy CTA and says so.
- Only the product that really maps to the verified egg (egg 15,
  `node.js generic`, `ghcr.io/ptero-eggs/yolks:nodejs_25`) is marked
  deployable. Nothing else claims an egg, an image or a startup command that
  does not exist on the panel.
- The prices on the hero, the pricing section, the navigation and the sign-in
  screens come from the catalog. The marketing scenes that still show sample
  data are labelled as such.

Files: `web/src/home/Catalog.tsx`, `web/src/routes.tsx`,
`web/src/lib/pricing.ts` (new), `web/src/home/Hero.tsx`,
`web/src/home/Rest.tsx`, `web/src/home/Nav.tsx`, `web/src/home/Story.tsx`,
`web/src/pages/Docs.tsx`, `web/src/pages/Login.tsx`,
`web/src/pages/Register.tsx`, `web/src/pages/ForgotPassword.tsx`,
`web/src/pages/ResetPassword.tsx`, `web/src/pages/VerifyEmail.tsx`,
`api/src/routes/catalog.ts`, `api/prisma/seed.ts`.

Tests: `api/tests/catalog.test.ts`.

## BM-AUD-006 — The client API was incompatible with Pterodactyl 1.x

**Was:** `/files`, `/files/content`, `DELETE /files/content` and a flat
resource response that Pterodactyl 1.x never sends.

**Now:** the adapter speaks the 1.x contract and unwraps the JSON:API
envelopes internally, so no route had to change.

| Operation | Endpoint |
|---|---|
| List files | `GET /api/client/servers/{uuid}/files/list?directory=` |
| Read a file | `GET /api/client/servers/{uuid}/files/contents?file=` |
| Write a file | `POST /api/client/servers/{uuid}/files/write?file=` (raw body) |
| Delete files | `POST /api/client/servers/{uuid}/files/delete` |
| Resources | `GET /api/client/servers/{uuid}/resources` |

Files: `api/src/services/pterodactyl/client.ts`,
`api/src/services/pterodactyl/types.ts`.

Tests: `api/tests/pterodactyl-client.test.ts` — 14 cases, run with
`npx vitest run --config vitest.db-free.config.ts` (no database needed).

## BM-AUD-007 — There was no console relay

**Was:** the API returned the console credentials and the browser had to talk
to the panel directly, which needed the panel token in the browser.

**Now:** the browser opens `/api/instances/{id}/console/stream` with its
session cookie. The API checks the ownership, opens the panel console on the
server and pipes the traffic in both directions. The panel token never leaves
the API. `POST /instances/{id}/command` sends a command.

The web container proxies the WebSocket upgrade and replaces the forwarding
headers, so the API only ever sees an address the server established itself.

Files: `api/src/routes/instances.ts`, `web/server.mjs`,
`web/src/app/InstanceDetail.tsx`.

## BM-AUD-008 — A retry could reinstall a running server

**Was:** the worker always ran the whole flow, including the reinstall.

**Now:**

- The instance records the last completed step (`Instance.provisionStep`), and
  a retry continues after it.
- **The reinstall happens at most once per server.** A retry of a server that
  was already installed never reinstalls it, so the files of the customer stay
  untouched.
- A run that dies between the install and the start is resumed at the start
  step.
- An instance lock (`provisionLockAt`) keeps two workers from provisioning the
  same instance; a lock older than thirty minutes is taken over.
- `reconcileInterruptedInstances()` puts instances that were left behind back
  in the queue.

Files: `api/src/services/provisioning.ts`, `api/prisma/schema.prisma`.

Tests: `api/tests/provisioning.test.ts` — "a retry never reinstalls a server
that already exists", "does not reinstall a server after a crash between the
install and the start", "refuses a second run while another run holds the
instance".

## BM-AUD-009 — A hardcoded credential in a public repository

**Was:** `scripts/browser-session.mjs`, `scripts/browser-console.mjs` and
`scripts/browser-state.mjs` carried the mail and password of a test panel
account.

**Now:**

- No credential is written in any script. Every credential comes from an
  environment variable and the script refuses to run without it.
- The test account itself was deleted on the panel, so the credential is
  revoked. The copy in the Git history is therefore dead.
- `rejectUnauthorized: false` is gone from the whole repository. When the
  certificate is not trusted, the script says how to install the CA instead of
  trusting anything.

Files: `scripts/**` (the operator tools now live in `scripts/ops/`).

## BM-AUD-010 — The client key scope was global and unusable

**Was:** the client module signed an invented HS256 token and used it for
every customer.

**Now:**

- The invented JWT is gone. A panel-issued client key (`ptc_…`) is the only
  accepted credential.
- A key that is missing or is not a `ptc_` key makes `clientApiAvailable()`
  false, and every call fails with a message that names the missing
  credential. The application key is never sent to a client endpoint.
- The key stays on the server and never reaches the browser.

**Partial:** the platform still uses one global client key. Giving every
customer its own key needs the panel to issue one key per account, which
needs an authenticated panel session (the panel login currently answers
`500 TypeError` for every account). The strategy is documented in the header
of `api/src/services/pterodactyl/client.ts`.

## BM-AUD-011 — `trustProxy: true`

**Was:** every proxy was trusted, so a client could forge `X-Forwarded-For`
and walk around the rate limit.

**Now:**

- The API trusts only the addresses in `TRUSTED_PROXIES` (default: loopback
  and the Docker network). Everything else is a direct client.
- The web server replaces the forwarding headers with the address it
  established itself. It only believes the incoming header when the request
  came from an address in `TRUSTED_PROXY_IPS`.

Files: `api/src/app.ts`, `api/src/env.ts`, `web/server.mjs`.

## BM-AUD-012 — The Caddy API was never integrated

**Was:** `gateway.ts` called an assumed endpoint with an assumed body, and
nothing was ever routed.

**Now:** the gateway service validates the hostname and the target, is
idempotent, stays inside its own namespace and fails clearly when the admin
API is not configured — it never pretends that a route exists.

**Partial:** the real Caddy Admin API is on VM 102 and is not configured
(`CADDY_ADMIN_URL` and `CADDY_ADMIN_TOKEN` are empty). The integration cannot
be exercised until the operator provides the admin address and a token. The
Caddy configuration itself was not touched.

## BM-AUD-013 — The backups only lived on RAID 0

**Was:** `backup.sh` wrote to the local volume and nothing left the host.

**Now:** `scripts/backup-offsite.sh` copies the dump and the uploads to an
off-host destination, encrypted before it leaves the host, with a retention
window, and it verifies the copy before the local copy is released. Without
`OFFSITE_TARGET` it is a clear no-op and never a silent failure. The
configuration comes from the environment only, never from the command line.

**Partial:** the destination is not configured yet. The operator has to set
`OFFSITE_TARGET` and `OFFSITE_ENCRYPTION_KEY` on the host and run the script
once to confirm the copy.

## BM-AUD-014 — Destructive scripts in a public repository

**Was:** `cleanup-panel.py` deleted by default and matched its targets by
name, and `cleanup-data.sh` ran `DELETE FROM "Order" WHERE number LIKE
'BM-%'`, which matches **every** order.

**Now:**

- The cleanup is a **dry run by default**. Deleting needs `--execute` **and**
  an explicit confirmation.
- Every target is verified by id, uuid and name against a hard-coded
  allowlist. The protected server (id 2, uuid
  `aec52a41-0445-4c03-bab9-82f1af8ed621`) is refused even if it is on the
  list.
- The order cleanup matches the exact numbers of the test orders, never a
  pattern.
- The operator tools live in `scripts/ops/` and `scripts/README.md` states for
  each of them what it does, whether it changes anything and what it needs.

Files: `scripts/cleanup-panel.py`, `scripts/cleanup-data.sh`,
`scripts/README.md`, `scripts/ops/**`.

## BM-AUD-015 — No CI, no root README

**Now:** `.github/workflows/ci.yml` runs the API typecheck, the web typecheck
and build, the isolated test suite against a `_test` database, a full-history
secret scan, a dependency audit and a schema drift check. `README.md` at the
root explains the architecture, the local setup, the tests, the deploy, the
environment variables and the backup procedure.

Files: `.github/workflows/ci.yml`, `README.md`, `docs/RUNBOOK.md`.

## BM-AUD-016 — Renewals, suspension and withdrawal

**Was:** cancelling only set a flag, nothing was ever renewed, suspended or
withdrawn.

**Now** the worker sweeps every fifteen minutes:

- A subscription whose period ended and that was cancelled is withdrawn: the
  container is stopped, the instance is marked `CANCELLED` and an event is
  written. The server is removed only when the
  `auto_delete_cancelled_instances` setting is on, so the default is safe.
- A subscription that was not paid is suspended after seven days of grace.
- A subscription that is due is renewed, and a local invoice is written for
  the renewal.
- The local state is reconciled with the provider.

Files: `api/src/services/billing.ts` (new), `api/src/worker.ts`.

Tests: `api/tests/billing.test.ts` — 5 cases.

## BM-AUD-017 — There was no real attachment upload

**Was:** the ticket messages carried a JSON description of a file that was
never stored.

**Now:** `@fastify/multipart` accepts one file per request, up to 5 MB, with
an allowlist of types. The bytes go to the attachment volume under a random
name, the metadata goes into an `Attachment` row with the SHA-256 of the
file, and the file is only readable through a route that checks who may read
it.

Files: `api/src/lib/attachments.ts` (new), `api/src/routes/tickets.ts`,
`api/src/app.ts`, `compose.api.yml`, `api/Dockerfile`.

## BM-AUD-018 — The status page could be green without checking

**Was:** the page reported the same "panel ping" for the panel, the nodes and
the deployments.

**Now:** every component is measured on its own: the database, the cache, the
panel, the worker (its own health endpoint), the queue (real job counts), the
nodes, the allocator (free ports), the deployments (instances that are not
online, with the age of the oldest) and support (the mail transport). The
overall state is derived from the measurements, so a green light means that
part was actually checked.

Files: `api/src/routes/health.ts`.

## BM-AUD-019 — A promotion was consumed at order creation

**Was:** `usedCount` was incremented as soon as an order was created, so
unpaid orders could exhaust a campaign.

**Now:**

- Creating an order **reserves** the promotion. The reservation holds the
  slot while the customer pays and expires after 48 hours.
- The campaign is only consumed when the payment lands
  (`Order.promotionRedeemedAt`).
- A cancelled order releases the reservation.
- `Promotion.maxPerUser` limits how often one account may use a code.

Files: `api/src/services/pricing.ts`, `api/src/routes/orders.ts`,
`api/src/services/stripe.ts`, `api/src/services/billing.ts`,
`api/prisma/schema.prisma`.

Tests: `api/tests/webhooks.test.ts` — "does not consume a promotion before the
payment".

## BM-AUD-020 — The deployment check accepted any answer

**Was:** `verifyDeployment` accepted any HTTP status below 500, so a 404 or a
403 counted as a working deployment.

**Now:**

- The probe comes from the product (`Product.healthProbe`). An HTTP probe only
  passes when the status is one of the expected ones; a 404 or a 403 is a
  failure.
- A service that speaks a protocol of its own is checked with a TCP
  connection.
- The reason is recorded, so a failed provisioning says what the application
  answered.

Files: `api/src/services/provisioning.ts`, `api/prisma/schema.prisma`.

---

## What is still open

These need a credential or a decision that is not the code's to make:

1. `PTERODACTYL_CLIENT_KEY` — a panel-issued client key (`ptc_…`). Without it
   the platform cannot start or stop a container, and the console cannot be
   opened. This also blocks the per-customer key strategy of BM-AUD-010.
2. The panel login answers `500 TypeError` for every account, so the panel
   cannot be driven from the browser and the client keys cannot be issued.
3. `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PUBLISHABLE_KEY` —
   real checkout. The local test gateway covers the flow, but no real card
   has been charged.
4. `SMTP_URL` — real mail. Without it the mail is written to a file.
5. `CADDY_ADMIN_URL`, `CADDY_ADMIN_TOKEN` — real domain routing and TLS.
6. `OFFSITE_TARGET`, `OFFSITE_ENCRYPTION_KEY` — the off-host copy of the
   backups.
7. The node `10.77.0.11` has no shell access for the operator account, so the
   Wings configuration cannot be inspected from here.
