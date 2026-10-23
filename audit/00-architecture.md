# 00 — Architecture: the real data and control flow

**Date of the audit:** 2026-10-23.
**What this document describes:** the system as it *runs*, not the system as it was intended to run. Where the code and the documentation disagree, the code wins and the disagreement is recorded in §7 and in `00-documentation-drift.md`.

Every statement carries a `file:line` or a command. **No secret appears here.**

---

## 1. The machines, as they really are

| Machine | Address | What the audit could see |
|---|---|---|
| **VM 103** — control plane | `10.77.0.13` | Fully reachable. All five containers, the database and the deployment tree. |
| **VM 102** — Caddy edge | `10.77.0.12` | Fully reachable. Caddy 2.6.2, `systemctl is-active caddy` → `active`. |
| **VM 100** — Pterodactyl panel | `10.77.0.10` | **Not reachable by SSH.** Reachable only as an HTTP service, from VM 103, on **port 443** (not 8080). |
| **VM 101** — Wings node | `10.77.0.11` | **Not reachable by SSH.** Reachable only as a TCP/HTTP service on ports 8080 and 30000. |
| Cloudflare | `188.114.96.x` / `188.114.97.x` for `blipmade.com` | The public edge. |

The public DNS, resolved from the audit host:

| Name | Public | From VM 103 |
|---|---|---|
| `blipmade.com` | `188.114.96.3`, `188.114.97.3` | `188.114.96.11`, `188.114.97.11` (Cloudflare anycast) |
| `www.blipmade.com` | same | same |
| `panel.blipmade.com` | `193.34.214.86` | `10.77.0.10` (via `/etc/hosts` on the host and `extra_hosts` in the containers) |
| `node1.blipmade.com` | `193.34.214.87` | `193.34.214.87` |
| `test.apps.blipmade.com` | `193.34.214.143` | `193.34.214.143` |

`DOMAIN_TARGET` in the production `.env` is `193.34.214.143` — the same address as `test.apps.blipmade.com`.

---

## 2. The components and the flow

```
                        ┌──────────── Cloudflare (188.114.96.x) ────────────┐
   browser  ──HTTPS──▶  │  terminates the TLS for blipmade.com            │
                        └──────────────────────┬───────────────────────────┘
                                               │  HTTP, X-Forwarded-For / -Proto
                        ┌──────────────────────▼───────────────────────────┐
  VM 102               │  Caddy 2.6.2  (/etc/caddy/Caddyfile)            │
  10.77.0.12           │  blipmade.com, www.blipmade.com                │
                       │    → reverse_proxy 10.77.0.13:3000              │
                       │  test.apps.blipmade.com                          │
                       │    → reverse_proxy 10.77.0.11:30001  ← see §6    │
                       └──────────────────────┬───────────────────────────┘
                                              │  HTTP
                        ┌─────────────────────▼───────────────────────────┐
  VM 103               │  web  (Node, web/server.mjs, :3000)             │
  10.77.0.13           │  • serves the built SPA                          │
                       │  • proxies /api ─────────────────────┐           │
                       │  • proxies the WebSocket upgrade ────┤           │
                       │  • serves /fonts/ and /healthz        │           │
                       └───────────────────────────────────────┼───────────┘
                                        ┌───────────────────▼───────────┐
                        ┌───────────────▼───────────────────────────────┐
                        │  api  (Fastify 5, :3100)                       │
                        │  • /api/*  (144 method+path pairs)              │
                        │  • /health (container health check)             │
                        │  • cookies: bm_session, bm_csrf                │
                        │  • writes to PostgreSQL, enqueues in Redis      │
                        └───┬───────────────┬──────────────┬─────────────┘
                            │               │              │
        ┌───────────────────▼──┐   ┌────────▼────────┐  ┌──▼─────────────────┐
        │ postgres:17-alpine   │   │ redis:7-alpine  │  │ Pterodactyl panel  │
        │ 127.0.0.1:5432       │   │ 127.0.0.1:6379  │  │ VM 100, 10.77.0.10 │
        │ database "blipmade"  │   │ bull:blipmade.* │  │ HTTPS :443         │
        └──────────────────────┘   └────────┬────────┘  └──┬────────────────┘
                                           │              │  client API (ptlc_)
        ┌──────────────────────────────────▼────────┐     │  application API (ptla_)
        │  worker (BullMQ, health :3101)            │     │
        │  • provisions the instances                │─────┤
        │  • renews, suspends, withdraws             │     │
        │  • sends the mail                          │     │
        └────────────────────────────────────────────┘     │
                                                          ▼
                                            Wings node, VM 101, 10.77.0.11
                                            Wings on :8080, customer
                                            containers on their allocation port
```

---

## 3. The request path, step by step

### 3.1 Browser → web container

1. The browser resolves `blipmade.com` to Cloudflare. Cloudflare terminates the TLS and forwards to the Caddy edge on VM 102.
2. Caddy matches the `blipmade.com, www.blipmade.com` block and does `reverse_proxy 10.77.0.13:3000` (`/etc/caddy/Caddyfile`, read on VM 102). Caddy sets `X-Forwarded-For` and `X-Forwarded-Proto: https` by default.
3. The request lands on the `web` container, which is published on the LAN address `10.77.0.13:3000` (`compose.web.yml:23`).
4. `web/server.mjs` decides what to do:
   * `/healthz` → the state of the typeface (`web/server.mjs:117-122`);
   * `/api/…` → proxied to `API_URL` (`http://api:3100`) (`web/server.mjs:128`, `:142`);
   * `/fonts/…` → served locally with an `ETag` (`web/server.mjs:186`);
   * everything else → the built SPA (`web/dist`).
5. **The web container rewrites the forwarding headers itself.** It believes `X-Forwarded-For` and `X-Forwarded-Proto` only when the peer address is in `TRUSTED_PROXY_IPS` (`web/server.mjs:69`, `:79`, `:87-97`); otherwise it uses the socket address and the socket scheme. In production `TRUSTED_PROXY_IPS=10.77.0.12` — the Caddy edge — so a client cannot forge its own address.
6. The API sees the request as coming from the Compose network (`172.18.0.6`), and Fastify's `trustProxy` is the list in `TRUSTED_PROXIES` (`api/src/app.ts:47`, `api/src/env.ts:95`).

**Why the web container exists at all:** so that the session cookie stays first-party. The browser never talks to `api:3100`; `/api` is a path on the same origin as the site.

### 3.2 The API and the session

| Step | Mechanism | Source |
|---|---|---|
| Session cookie | `bm_session`, `httpOnly`, `sameSite=lax`, `secure` follows the request protocol | `api/src/plugins/auth.ts:9`, `:74-79`, `:49` |
| CSRF cookie | `bm_csrf`, **not** `httpOnly` (the browser must read it), `sameSite=lax` | `api/src/plugins/csrf.ts:24`, `:44-49` |
| CSRF check | double submit: the `x-csrf-token` header must equal the `bm_csrf` cookie, on every method that is not `GET`/`HEAD`/`OPTIONS` | `api/src/plugins/csrf.ts:7`, `:28-40`; hook wired at `api/src/app.ts:118-120` |
| Session storage | PostgreSQL `Session` row; **only the SHA-256 hash of the token is kept** | `api/src/lib/tokens.ts:9-10` (`hashToken`), used at `api/src/plugins/auth.ts:66`, `:89`, `:105` |
| Session lifetime | 14 days | `api/src/plugins/auth.ts:11` |
| Staff permission | 22 granular permissions, `ADMIN` holds all | `api/src/lib/permissions.ts:2-24`, `:33-36` |
| Password storage | scrypt, N=16384, r=8, p=1, per-user salt | `api/src/lib/password.ts` |
| Rate limiting | `@fastify/rate-limit` over Redis, keyed on the client IP | `api/src/app.ts:62-67` |
| Response hardening | `@fastify/helmet` | `api/src/app.ts:58` |
| CORS | only the origin in `APP_ORIGIN` | `api/src/app.ts:52-57` |

The API is bound to `127.0.0.1:3100` inside VM 103 (`compose.api.yml:14`) — it is not reachable from the network at all. Everything enters through the web container.

---

## 4. The asynchronous path

```
api  ──enqueue──▶  redis:7  ──▶  worker (bullmq, :3101)  ──▶  panel  ──▶  node
  ▲                    │                                                        │
  │                    └── "blipmade.provision" (5 attempts, exponential backoff) │
  └──────── instance / order / audit rows written back to PostgreSQL ───────────┘
```

| Element | Value | Source |
|---|---|---|
| Queue name | `blipmade.provision` | `api/src/services/queue.ts` |
| Provisioning job | 5 attempts, exponential backoff from 5 s | `api/src/services/queue.ts:42-45` |
| E-mail job | 4 attempts, exponential backoff from 10 s | `api/src/services/queue.ts:120-123` |
| Worker entry | `api/src/worker.ts` → `node dist/worker.js` | `compose.api.yml:37` |
| Worker health | own port 3101, `{"status","database","redis","worker"}` | `compose.api.yml:57` |
| Worker image | **the same build context as the API** — a change under `api/src` that is not deployed with `build api worker` leaves the worker on the old code | `compose.api.yml:35` |

The API never provisions synchronously. An order creates an instance row and enqueues a job; the worker reconciles interrupted instances every minute and takes over a lock older than 30 minutes (`api/src/services/provisioning.ts`).

---

## 5. The path to the panel and to the node

### 5.1 Two identities, never mixed

| Identity | Prefix | Header | Used for | Source |
|---|---|---|---|---|
| Application key | `ptla_` | `Authorization: Bearer <PTERODACTYL_APP_KEY>` | creating the panel account, creating the server, the build, the startup command, the egg, the image, the environment | `api/src/services/pterodactyl/application.ts:69` |
| Client key of a customer | `ptlc_` | `Authorization: Bearer <the key of that customer>` | power, console, files, backups, databases, schedules, addresses | `api/src/services/pterodactyl/client.ts:53`, `:162` |

The client adapter **refuses** to send anything that is not a `ptlc_` key to a client endpoint (`api/src/services/pterodactyl/client.ts:86`, `:151`). The application key is never used on a client endpoint.

### 5.2 How a customer gets a `ptlc_` key

```
api  ──HMAC-SHA256 request──▶  panel (VM 100)  ──creates the key──▶  panel
     POST /api/blipmade/keymint                          │
     {external_id, timestamp, nonce, signature}          ▼
                                            pterodactyl client API
                                                     │
                                            ┌────────▼────────┐
                                            │ PanelCredential  │  (encrypted, in PostgreSQL)
                                            │ .tokenEnc        │
                                            └────────┬────────┘
                                                     │
api  ──Authorization: Bearer ptlc_… ──▶ panel ──▶ node (VM 101)
```

| Element | Value | Source |
|---|---|---|
| The endpoint on the panel | `POST /api/blipmade/keymint`, throttle `30,1` | `panel-bridge/BlipmadeBridgeServiceProvider.php:31-33` |
| The signature | `HMAC-SHA256` over `timestamp . '.' . nonce . '.' . external_id`, keyed with the shared secret | API: `api/src/services/panel/credentials.ts:50`; panel: `panel-bridge/BlipmadeKeyMintController.php:74` |
| The comparison | constant time (`hash_equals` / `timingSafeEqual`) | `BlipmadeKeyMintController.php:75`; `credentials.ts:1` |
| Clock window | 60 s (`MAX_CLOCK_SKEW_SECONDS`) | `BlipmadeKeyMintController.php:38`, `:80` |
| Nonce | single use, remembered 120 s (`NONCE_TTL_SECONDS`), atomic `Cache::add` | `BlipmadeKeyMintController.php:35`, `:86` |
| The secret | at least 32 characters, else the endpoint answers `503 disabled` | `BlipmadeKeyMintController.php:43` |
| The address allow-list | `BLIPMADE_KEYMINT_ALLOWED_IPS`; an empty list means `503 disabled` | `panel-bridge/config/blipmade_bridge.php:23` |
| Storage of the key | `PanelCredential.tokenEnc`, encrypted with a key derived from `SESSION_SECRET` | `api/src/services/panel/credentials.ts`, `api/src/lib/secrets.ts` |

**The bridge is installed on the panel.** Proved without touching the panel, with a `GET` on a `POST`-only route:

```
$ ssh -i /root/.ssh/blipmade_vm103 debian@10.77.0.13 'curl -sk -o /dev/null -w "keymint GET -> HTTP %{http_code}\n" https://panel.blipmade.com/api/blipmade/keymint; curl -sk -o /dev/null -w "absent path -> HTTP %{http_code}\n" https://panel.blipmade.com/api/blipmade/definitely-not-a-route'
keymint GET -> HTTP 405
absent path -> HTTP 404
```

`405` on a path that answers `404` for anything else means the route is registered. And it is in use: the live database holds **3 rows in `PanelCredential`**, so keys have already been minted through it.

### 5.3 The console relay

```
browser ──WebSocket──▶ web (upgrade proxied) ──WebSocket──▶ api ──WebSocket──▶ panel ──▶ node
                        web/server.mjs:226-271              instances.ts:214
```

* The browser opens `/api/instances/:id/console/stream` with its **session cookie** — no panel token is in the browser (`api/src/routes/instances.ts:205`, `:214`).
* The web container proxies the upgrade and replaces the forwarding headers (`web/server.mjs:226-271`), so the API only ever sees an address the server established itself.
* `GET /api/instances/:id/console` returns the WebSocket URL and nothing else (`api/src/routes/instances.ts:187-205`).
* The WebSocket limit is 1 MiB (`api/src/app.ts:76-78`).

### 5.4 The node

`PANEL_NODE_ADDRESSES=node1.blipmade.com:8080=10.77.0.11:8080` — the operator names the address that works, because the name the panel knows (`node1.blipmade.com`) resolves publicly to `193.34.214.87` and the platform has to be able to reach the node (`api/src/env.ts:49-54`, `api/src/services/panel/nodes.ts:11-26`).

From VM 103, a read-only TCP probe of the node:

```
8080  OPEN     (Wings)
30000 OPEN     (HTTP 200)
30001 closed
30002 closed
30003 closed
```

`30000` answering HTTP 200 is the claim of `docs/PRODUCTION_READINESS.md` and it **holds**. Port `30001` — the allocation port of the test server, and the target of the Caddy rule for `test.apps.blipmade.com` — is **closed**; see §6.

---

## 6. Trust boundaries

| # | Boundary | What crosses it | Authentication actually used | Where |
|---|---|---|---|---|
| **B1** | Browser → Cloudflare | TLS session | TLS 1.x, managed by Cloudflare | outside the repository |
| **B2** | Cloudflare → Caddy (VM 102) | HTTP | **none** — Caddy trusts every source; the edge is the TLS terminator | `/etc/caddy/Caddyfile` |
| **B3** | Caddy → web container | HTTP + `X-Forwarded-For`/`-Proto` | **none at the protocol level**; the trust is by *source address* (`10.77.0.12` in `TRUSTED_PROXY_IPS`) | `compose.web.yml:16`, `web/server.mjs:69-97` |
| **B4** | web container → API | HTTP on the Compose network `172.18.0.0/16` | **session cookie** `bm_session` (`httpOnly`, `sameSite=lax`) + **double-submit CSRF** `bm_csrf` / `x-csrf-token` on every unsafe method; the API additionally trusts the peer because `172.16.0.0/12` is inside the default `TRUSTED_PROXIES` | `api/src/plugins/auth.ts:9`, `:74-79`; `api/src/plugins/csrf.ts:7`, `:28-49`; `api/src/app.ts:47`, `:118-120` |
| **B5** | Browser → API (internal, staff) | same cookie, plus a staff permission | cookie + `requirePermission(…)` (22 permissions) | `api/src/lib/permissions.ts:2-24`, `:144` |
| **B6** | API → PostgreSQL | TCP + `DATABASE_URL` | **password** in the connection string, over the Compose network, not TLS | `compose.yml:2-14`; the container listens on `127.0.0.1:5432` |
| **B7** | API ↔ Redis | TCP + `REDIS_URL` | **none** — the Redis container has no password; it is only reachable on loopback and from the Compose network | `compose.yml:21-28` |
| **B8** | API → panel (application API) | HTTPS to `10.77.0.10:443` via `extra_hosts` | **bearer token** — `PTERODACTYL_APP_KEY` (`ptla_…`) | `compose.api.yml:11-12`; `api/src/services/pterodactyl/application.ts:69` |
| **B9** | API → panel (bridge / key mint) | HTTPS to the same host | **HMAC-SHA256 signature** over `timestamp.nonce.external_id` + 60 s clock window + single-use nonce + source-address allow-list | `api/src/services/panel/credentials.ts:50`; `BlipmadeKeyMintController.php:74-87` |
| **B10** | API → panel (client API) | HTTPS to the same host | **bearer token** — the `ptlc_` key of that one customer, encrypted at rest in `PanelCredential.tokenEnc` | `api/src/services/pterodactyl/client.ts:162` |
| **B11** | Panel → node (Wings) | HTTPS, port 8080 | **the panel's own token** (out of scope of this repository) | the panel's internals — **not verifiable**, VM 100 is not reachable |
| **B12** | API → worker | HTTP to `http://worker:3101` | **none** — the Compose network is the boundary | `api/src/env.ts:98` |
| **B13** | Worker → API (`/api/internal/prune-sessions`) | HTTP | **bearer token** — `INTERNAL_API_TOKEN` / `BLIPMADE_INTERNAL_API_TOKEN` | `api/src/routes/auth.ts:338-342` |
| **B14** | API → Caddy Admin API | HTTP | **bearer token** — `CADDY_ADMIN_TOKEN`; **the admin API has never been called, both variables are empty** | `api/src/services/gateway.ts`; `.env` state in `00-project-inventory.md` §11.1 |
| **B15** | API → SMTP relay | SMTP | the password inside `SMTP_URL`; **the variable is empty**, the mail goes to a file | `api/src/lib/mailer.ts`; `.env` state above |
| **B16** | API → Stripe | HTTPS | the signature of the webhook (`STRIPE_WEBHOOK_SECRET`); **every key is empty**, the payments are off | `api/src/routes/webhooks.ts`; `.env` state above |

### 6.1 The one boundary that is not where it looks

`/api/internal/whoami` (`api/src/routes/auth.ts:345-348`) is registered next to the genuinely internal routes but **requires no token** — it only reads the session cookie and returns the user or `null`. It is reachable from the public internet, and it returns nothing that the holder of the cookie does not already know. `GET /api/internal/not-a-real-route` (`:355-357`) is a deliberate 404 probe.

---

## 7. `docs/PANEL_BRIDGE.md` and `docs/HEADLESS_PANEL.md` against the code

The two documents describe the bridge and the headless integration. Both were read in full and compared with the code in `panel-bridge/` and `api/src/services/panel/`.

### 7.1 What the code confirms

| Claim in the document | Code | Result |
|---|---|---|
| The route is `POST /api/blipmade/keymint` | `BlipmadeBridgeServiceProvider.php:31` | **holds** |
| The throttle is 30 requests a minute | `BlipmadeBridgeServiceProvider.php:32` (`throttle:30,1`) | **holds** |
| The signature is HMAC-SHA256 over `timestamp . nonce . external_id` | API: `credentials.ts:50`; panel: `BlipmadeKeyMintController.php:74` | **holds**, character for character |
| The window is 60 seconds | `BlipmadeKeyMintController.php:38`, `:80` | **holds** |
| The nonce is used once and remembered 120 s | `BlipmadeKeyMintController.php:35`, `:86` | **holds** |
| The secret must be at least 32 characters, else `503` | `BlipmadeKeyMintController.php:43` | **holds** |
| An empty address list means `503` | `config/blipmade_bridge.php:23` | **holds** |
| The route does not sit behind the middleware of the panel | `BlipmadeBridgeServiceProvider.php:29-34` (no `middleware()` group is applied) and `routes-snippet.php:9` (`withoutMiddleware([VerifyCsrfToken])`) | **holds** |
| The key is stored encrypted and never reaches the browser | `api/src/services/panel/credentials.ts` + `api/src/lib/secrets.ts`; `PanelCredential` has 3 live rows | **holds** |
| The bridge has two layouts: a provider, or a snippet appended to `routes/api.php` | `panel-bridge/install.sh:92-99` tests for `routes/api.php` first and for `app/Providers/RouteServiceProvider.php` second | **holds** |

### 7.2 Where the code and the documents disagree

| # | The document says | The code does | Consequence |
|---|---|---|---|
| **A** | `docs/HEADLESS_PANEL.md:149-157` — "What is still missing": the key of a customer, and the start of the container during the provisioning, are both blocked by "the panel cannot issue a client key by itself". | The bridge **is installed** (§5.2, proved with the 405/404 probe) and **has been used** — 3 rows in `PanelCredential`. The provisioning `started` step already uses the customer key: `withCustomerKey(instance.userId, (token) => pteroClient.sendPower(token, server.uuid, 'start'))` (`api/src/services/provisioning.ts:566`). | The document describes a state that was left behind. An operator reading it would think the customer operations are dead, and would not think to look at `PanelCredential`. |
| **B** | `docs/HEADLESS_PANEL.md:38` and `docs/PANEL_BRIDGE.md:78-81` — "the identifier is sixteen characters and starts with `ptlc_`, the secret is thirty-two, so a whole key is **forty-eight characters** long". The example at `PANEL_BRIDGE.md:75` is `ptlc_0123456789abcdef0123456789abcdef0123456789abcd`, which is **51** characters. *(That string is the placeholder from the documentation, not a live key.)* | The code never checks the length of a key beyond `length >= 40` (`api/src/services/pterodactyl/client.ts`, `isClientKey`). The arithmetic in the document ignores the `ptlc_` prefix: `5 + 16 + 32 = 53`, not 48. | No functional impact (the code accepts anything from 40 characters), but the documented length is wrong **and contradicts the example in the same document**. A new engineer who reproduces a 48-character key by hand will produce something the panel never issues. |
| **C** | `docs/PANEL_BRIDGE.md:121` — "The bridge is installed **on the panel host** (VM 100), as root." | The route answers `405` on the panel, so it **is** installed. The document reads as a procedure, not as a statement of fact, so the disagreement is only that the document never says it is already done. | An operator may re-run `install.sh` on a panel that already has the bridge. The installer is written to be idempotent (`routes-snippet.php:2-3` carries the marker), but the provider path and the snippet path are not the same file, so a re-run could install **both**. |
| **D** | `docs/PANEL_BRIDGE.md:111-115` — "`PTERODACTYL_URL` and `PTERODACTYL_APP_KEY` are needed as well". | Correct, and both are set. But the document never mentions that the **panel is reached on port 443**, and the audit could only reach `10.77.0.10:443`; `10.77.0.10:8080` does not answer. | A reader who assumes `http://10.77.0.10:8080` will fail to diagnose the panel. |
| **E** | `docs/HEADLESS_PANEL.md:26-27` — "The password of the panel account is random and is not kept." | The code no longer stores a panel password for the customer. It stores the **client key** of the customer, encrypted (`PanelCredential.tokenEnc`). The concept of "the password of the panel account" no longer exists in the schema. | Outdated vocabulary. The rotation procedure in `docs/RUNBOOK.md:468-473` still speaks of "the panel password of every customer account is encrypted with a key that is derived from `SESSION_SECRET`" — it is the **client key** that is encrypted now. |

---

## 8. The pieces of the flow that are not where the documentation says

1. **The Caddy rule for `test.apps.blipmade.com` points at a closed port.** `/etc/caddy/Caddyfile` on VM 102 has `test.apps.blipmade.com → reverse_proxy 10.77.0.11:30001`, and a TCP probe from VM 103 shows `30001` **closed** while `30000` and `8080` are open. The rule is a leftover: the file `Caddyfile.before-blipmade` (same mtime, 2026-10-23 01:23) contains only that block, so it predates the `blipmade.com` block that was added afterwards.
2. **Caddy is version 2.6.2** (`caddy version` on VM 102), released in 2022 and long superseded. It is not part of this repository, so it cannot be fixed from here.
3. **The API never receives a `X-Forwarded-For` it can trust from the internet.** The `web` container strips it (`web/server.mjs:87-97`) and re-adds the value it computed itself. The API's `trustProxy` is a belt-and-braces second layer (`api/src/app.ts:47`).
4. **`TRUSTED_PROXY_IPS` and `TRUSTED_PROXIES` are two different variables** for two different processes (`compose.web.yml:16` vs `api/src/env.ts:95`). The production file sets only the first one; the API falls back to its default, which happens to include the Compose network `172.18.0.0/16`.
5. **Redis has no authentication** and is shared by three things: the provisioning queue, the e-mail queue and the rate limiter (`api/src/app.ts:62-67`).
6. **The worker and the API share one image but not one process.** A code change under `api/src` that is deployed with `build api` alone leaves the worker on the old code (`compose.api.yml:35`).
