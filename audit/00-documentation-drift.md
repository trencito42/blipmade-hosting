# 00 — Documentation drift

**Date of the audit:** 2026-10-23.
**What was checked:** the 15 documents of `docs/`, the root `README.md` and `scripts/README.md`.
**Source of truth:** the code in `/root/blipmade-work` and the running system on VM 103 / VM 102.

### The vocabulary

| Result | Meaning |
|---|---|
| **holds** | The claim is true of the system as it is now. |
| **wrong** | The claim is false. The correction is given. |
| **outdated** | The claim was true at the time it was written and is no longer; it describes a state the platform has left behind. |
| **unverifiable** | The claim cannot be checked from this environment, and the exact reason is given. |

**Every checkable claim of `docs/PRODUCTION_READINESS.md` and `docs/IMPLEMENTATION_STATUS.md` is in §2 and §3.** Those two are the highest risk and were read line by line.

**No secret appears in this document.** Only the names of environment variables and whether they are set or empty.

---

## 1. `docs/PRODUCTION_READINESS.md` — every checkable claim

| # | Line | The claim | The source of truth | Result | Evidence |
|---|---|---|---|---|---|
| PR-01 | 3 | The target is VM 103 at `/opt/blipmade`; staging is `http://10.77.0.13:3000` | the host | **holds** | `docker compose ps` on VM 103: `blipmade-web-1 … 10.77.0.13:3000->3000/tcp` |
| PR-02 | 15 | "**119 automated tests pass**" | `bash scripts/run-tests.sh` | **wrong** | `Test Files 22 passed (22) / Tests 219 passed (219)` + web `# tests 21 / # pass 21` = **240** |
| PR-03 | 29 | "**11 files, 119 tests**" | `api/tests/` | **wrong** | 22 `*.test.ts` + 3 web test files = **25 files, 240 cases** |
| PR-04 | 16 | "Schema and migrations applied, no drift" | `prisma migrate status` | **holds** | `10 migrations found … Database schema is up to date!`; `prisma validate` → *the schema … is valid*; 10 rows in `_prisma_migrations`, all finished |
| PR-05 | 16 | "backup and restore drill pass" | the drill of 2026-10-22 | **outdated** | The drill ran on 2026-10-22 with 3 migrations; the platform now has 10. See PR-16. |
| PR-06 | 18 | The billing code is complete, only the local test gateway was exercised | `api/src/services/stripe.ts` | **holds** | `stripeTestGateway()` returns `false` in production (`stripe.ts:39-41`); 0 invoices, 0 payments live |
| PR-07 | 19 | The mail code is complete, the mail is written to a file | `GET /api/health` | **holds** | `"mail": "file"`, `mailDelivery.counts.writtenToFile = 7` |
| PR-08 | 20 | "**The node publishes its ports**" | a TCP probe of the node from VM 103 | **outdated** | `8080` open, `30000` open (HTTP 200), **`30001` closed**, `30002`/`30003` closed. The claim is also self-contradictory: the same document says at line 110-111 that the instance still has to "answer on its own port", and `README.md` §10 says the allocation ports are *not* published. The three statements cannot all be true. |
| PR-09 | 21 | "Customer power control, files, console — **Blocked** by the missing client API key" | the panel + the live database | **wrong** | The bridge answers **405** on the panel (a `GET` on the `POST`-only route) against **404** for an absent path; the live database holds **3 rows in `PanelCredential`**; the health answer says `"panelKeyBridge": "configured"`. The customer operations use a per-customer `ptlc_` key, not a shared one. |
| PR-10 | 22 | The proof of ownership of a domain is implemented; the routing is blocked by the missing Caddy admin credentials | `api/src/services/dns.ts`, `api/src/services/gateway.ts` | **holds** | `CADDY_ADMIN_URL` and `CADDY_ADMIN_TOKEN` are empty; `gateway.ts:177` returns `false`; 0 rows in `InstanceDomain` |
| PR-11 | 23 | The backup works, the off-host copy exists but has no destination | `scripts/backup-offsite.sh` | **holds** | `OFFSITE_TARGET` is not in the production `.env` at all |
| PR-12 | 27-28 | The type check is clean | the build of the deployed image | **holds** | the image was built from this source and the API answers; the CI job `api-typecheck` runs `tsc --noEmit` on both tsconfigs |
| PR-13 | 38-39 | "`/api/health` … the mail transport, Stripe and **the two Pterodactyl keys**" | `GET /api/health` | **wrong** | The answer has **no** `pterodactylClient` field. It has `pterodactyl` and `panelKeyBridge`, plus a `mailDelivery` object. Live answer: `{"status":"ok","service":"blipmade-api","version":"1.0.0","uptimeSeconds":34745,"database":true,"redis":true,"mail":"file","mailDelivery":{…},"stripe":"not_configured","pterodactyl":"configured","panelKeyBridge":"configured"}` |
| PR-14 | 40-44 | A real server was created on the node `games-node-01`, the panel reported `installed=1` and the daemon a running container | the panel | **unverifiable** | VM 100 has no shell and is not reachable by SSH. *Unblock:* add the audit public key to `/root/.ssh/authorized_keys` of the panel host and open port 22 to the audit address. The panel **is** reachable over HTTPS on `10.77.0.10:443` — that is how PR-09 was proven. |
| PR-15 | 45-48 | The restore drill compared "**26 tables, 1 user, 5 products and 3 migrations**" | the live database | **outdated** | Now **32 tables, 6 users, 5 products, 10 migrations**. The drill was run on 2026-10-22, before 7 migrations. The claim is true of that run and false of today. |
| PR-16 | 49-50 | "**30 screenshots** at 390 px and 1440 px across the public pages, the customer area and the admin area" | the repository | **outdated** | `screenshots/` holds **45 PNG** (34 at the root, 3 in `audit/`, 8 in `review/`) and `screenshots/index.json` has **30 entries** labelled `mobile`/`desktop`, not 390/1440. The admin area appears in the 30. `screenshots/` is in `.gitignore`, so the images are not in the history either. |
| PR-17 | 55-56 | "Port 30000 on the node answers with HTTP 200" | a probe from VM 103 | **holds** | `curl http://10.77.0.11:30000/` → `HTTP 200` |
| PR-18 | 62-65 | The provisioning uses the install route, waits for `installed = 1`, starts the container and verifies the application over HTTP; 404 and 403 are failures | `api/src/services/provisioning.ts` | **holds** | `provisioning.ts:556-576` (the `started` step) and `api/tests/deployment-probe.test.ts` (4 cases) |
| PR-19 | 71 | "`PTERODACTYL_CLIENT_KEY` is empty" | the production `.env` | **holds** as a fact, **wrong** as a blocker | The variable **is** empty — but **no code reads it**. It is not in the schema of `api/src/env.ts`, and `grep -rn PTERODACTYL_CLIENT_KEY api/src` returns nothing. Filling it in changes nothing. |
| PR-20 | 72-77 | "Without it the platform cannot start a container, so the provisioning flow stops at the `started` step" | `api/src/services/provisioning.ts` | **wrong** | The `started` step uses the **customer's own key**: `withCustomerKey(instance.userId, (token) => pteroClient.sendPower(token, server.uuid, 'start'))` (`provisioning.ts:566`). A shared key is never used. |
| PR-21 | 79-81 | "The panel login currently answers 500 TypeError for every account" | the panel | **unverifiable** | VM 100 is not reachable by SSH. *Unblock:* add the audit public key to `/root/.ssh/authorized_keys` of the panel host. Note: the *consequence* the document draws from it — that the customer operations are blocked — is contradicted by PR-09. |
| PR-22 | 85-87 | The Stripe keys are empty, the local test gateway exercises the path, no real card was charged | the production `.env` + `stripe.ts:39-41` | **holds** | `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY` and `STRIPE_WEBHOOK_SECRET` are empty; `NODE_ENV=production` |
| PR-23 | 91-92 | `SMTP_URL` is empty, the mail is written to a file, nothing was ever delivered | `GET /api/health` | **holds** | `"mail": "file"`; 13 rows in `MailDelivery`, 7 of them `written-to-file` |
| PR-24 | 96-100 | `CADDY_ADMIN_URL` and `CADDY_ADMIN_TOKEN` are empty; no customer hostname is routed, no certificate was issued | the production `.env` | **holds** | Both empty; 0 rows in `InstanceDomain` |
| PR-25 | 99-100 | "**The Caddy configuration on VM 102 was not touched**" | `/etc/caddy/Caddyfile` | **wrong** | The Caddyfile has mtime **2026-10-23 01:23** and contains the `blipmade.com, www.blipmade.com → reverse_proxy 10.77.0.13:3000` block. The snapshot `/etc/caddy/Caddyfile.before-blipmade` (same mtime) contains **only** the `test.apps.blipmade.com` block, so the Blipmade block was added after that snapshot was taken. The gateway was changed. |
| PR-26 | 104-106 | `OFFSITE_TARGET` is unset, so the off-host copy never happens | the production `.env` | **holds** | The variable is not in the file |
| PR-27 | 110-111 | "**Add `PTERODACTYL_CLIENT_KEY`** and run one provisioning job end to end until the instance is online and answers on its own port" | `api/src/env.ts` | **wrong** | Adding that variable has no effect: no code reads it. The blocker is the **node** (the allocation port is closed), not a key. The correct action is to open the node (guest agent + audit key) and read the Wings configuration. |
| PR-28 | 112 | Add the Stripe test keys and run a real checkout in test mode | the production `.env` | **holds** | — |
| PR-29 | 113 | Set `SMTP_URL` and finish the verification and reset flows | the production `.env` | **holds** | — |
| PR-30 | 114-115 | Set `OFFSITE_TARGET` and `OFFSITE_ENCRYPTION_KEY` | the production `.env` | **holds** | Neither is present |
| PR-31 | 116-117 | Set `CADDY_ADMIN_URL` and `CADDY_ADMIN_TOKEN` | the production `.env` | **holds** | Both empty. Note: the Caddy admin API is **not exposed** on VM 102 (the Caddyfile has no `admin` block), so the gateway has to be reconfigured too. |
| PR-32 | 118-119 | "Review the four `root_admin` panel accounts" | the panel | **unverifiable** | VM 100 is not reachable by SSH. *Unblock:* add the audit public key to `/root/.ssh/authorized_keys` of the panel host. |
| PR-33 | 120-122 | "Decide how **the panel password of a customer** is handled. It is encrypted at rest with a key derived from `SESSION_SECRET`" | `api/prisma/schema.prisma` | **wrong** | There is no panel password for a customer any more. What is encrypted is the **client key** of the customer, in `PanelCredential.tokenEnc` (`api/src/lib/secrets.ts`, `api/src/services/panel/credentials.ts`). The same error is in `RUNBOOK.md:468-473`. |
| PR-34 | 123-124 | Turn on the branch protection of `main` | the repository settings of GitHub | **unverifiable** | The audited copy has **no `.git`** and the GitHub repository is not reachable from here. *Unblock:* point the audit at the real repository, or at a clone that carries the history, and read the branch-protection settings of `main`. |
| PR-35 | 128 | "**The live domain and the Caddy gateway on VM 102** … were deliberately not changed" | DNS + the Caddyfile | **wrong** | `blipmade.com` and `www.blipmade.com` now resolve to Cloudflare and are served by the web container on VM 103 through the Caddy block on VM 102; the Caddyfile was changed on 2026-10-23 01:23 (PR-25). |
| PR-36 | 130-132 | The protected Pterodactyl server "Blipmade App Test" (id 2, allocation 74 → port 30001) is intact | the panel and the node | **unverifiable** | The panel is not reachable by SSH. From VM 103 the allocation port **30001 is closed**, so the server is not answering on its port. *Unblock:* the audit key on VM 100 for the panel side, and the guest agent + audit key on VM 101 for the node side. |
| PR-37 | 134-136 | The homepage reads its prices from the catalogue instead of a hard-coded list | the code and the live site | **holds** | `GET /api/catalog/products` returns 5 products with their prices; `web/src/app/Catalog.tsx` reads them |
| PR-38 | 140 | Passwords are hashed with scrypt | `api/src/lib/password.ts` | **holds** | scrypt, N=16384, r=8, p=1, per-user salt |
| PR-39 | 141 | The session lives in PostgreSQL and only the SHA-256 hash of the token is kept | `api/src/lib/tokens.ts:9-10`, used at `api/src/plugins/auth.ts:66`, `:105` | **holds** | `hashToken` is a SHA-256; the `Session` table holds 251 rows |
| PR-40 | 142-143 | Every state-changing route needs the double-submit CSRF token, except the credential-carrying authentication endpoints | `api/src/plugins/csrf.ts:15-22`, `:29-30` | **holds** | The exempt set is exactly the 7 credential-carrying auth routes; the webhook paths are also exempt (they carry their own signature) |
| PR-41 | 144-145 | The login, the registration, the reset of the password, the quotes and the orders are rate limited; the API only believes the forwarding headers it knows | the route files + `api/src/app.ts:47` | **holds** | login 10/15 min, register 20/15 min, reset 10/15 min, quote 120/min, order 30/10 min; `trustProxy` from `TRUSTED_PROXIES` |
| PR-42 | 146 | The money is integer minor units; the promotions are basis points | `api/src/lib/money.ts`, `api/src/services/pricing.ts` | **holds** | `normalizeAmount` rounds and floors at 0; the live prices are 149/299/449 EUR, in cents |
| PR-43 | 147-149 | The Application API key never leaves the server; the browser only ever sees the session cookie and the CSRF token | `api/src/services/pterodactyl/application.ts:69`, `api/src/plugins/auth.ts:74-79` | **holds** | — |
| PR-44 | 150-152 | A hostname is only routed after the proof with a TXT record; the containers run with `no-new-privileges` and `cap_drop: ALL`; PostgreSQL and Redis are bound to loopback | `compose.yml`, `compose.api.yml:23-26`, `compose.web.yml:24-27` | **holds** | `127.0.0.1:5432` and `127.0.0.1:6379` |
| PR-45 | 153-156 | "eight test servers, ten test panel accounts, eight test orders, eight test instances, eight test subscriptions and eight test products … were removed; the five demo catalogue products were kept" | the live database + the panel | **unverifiable** in part | The five demo products are there (5 rows in `Product`). The panel accounts and the servers are on VM 100 (**unverifiable**). The live database holds **5 orders** and **3 instances**, not zero, and **0 subscriptions**. |

---

## 2. `docs/IMPLEMENTATION_STATUS.md` — every checkable claim

| # | Line | The claim | The source of truth | Result | Evidence |
|---|---|---|---|---|---|
| IS-01 | 33-35 | The infrastructure of the customer works: the server is created, the application is started, the files and the console are read, the key of the customer is per customer and is rotated | the code + the live database | **holds** | `api/src/services/provisioning.ts`; the `started` step uses the customer key (`provisioning.ts:566`); 3 rows in `PanelCredential`; `api/tests/credential-renewal.test.ts` |
| IS-02 | 36-38 | The catalogue is the one of the API, with honest availability; the CTA goes to `/app/deploy/:slug` | `GET /api/catalog/products`, `web/src/app/DeployCatalog.tsx` | **holds** | 5 products, only `discord-bot` with `deployable: true`; the other four are labelled "Coming soon" |
| IS-03 | 37 | The deployment check is the probe of the product; 404 and 403 are failures | `api/src/services/provisioning.ts`, `api/tests/deployment-probe.test.ts` | **holds** | 4 test cases |
| IS-04 | 38 | The domain proof is a random TXT token, the reserved names are refused, a claim cannot be taken over | `api/src/services/dns.ts`, `api/tests/domains.test.ts` | **holds** | 19 test cases |
| IS-05 | 39 | The status page has nine components, each measured on its own | `GET /api/status` | **wrong** | The answer carries **10** components: `api, dashboard, cache, panel, worker, queue, nodes, allocator, provisioning, support` |
| IS-06 | 40 | The CI runs typecheck, tests, build, secret scan, dependency audit and schema drift | `.github/workflows/ci.yml` | **holds** | 6 jobs: `api-typecheck`, `web-build`, `test`, `secret-scan`, `dependency-audit`, `schema-drift` |
| IS-07 | 41 | The backups are encrypted, verified and kept in a window; the destination is missing | `scripts/backup.sh`, `scripts/backup-offsite.sh` | **holds** | `OFFSITE_TARGET` unset; the offsite cipher is `openssl enc -aes-256-cbc -pbkdf2 -iter 600000 -md sha256` (`backup-offsite.sh:59`, `:233`) |
| IS-08 | 42 | The attachments are a real upload with a size limit, a type allow-list and access rules | `api/src/routes/tickets.ts:324-330`, `api/src/lib/attachments.ts` | **holds** | `@fastify/multipart`, 1 file, 5 MB; 0 live rows |
| IS-09 | 47 | "**The operations of a customer work** — the key of the customer is issued by the bridge, the power control, the files, the console, the backups and the databases all go through the client API of the panel" | the code + the live database | **holds** | The bridge answers **405** on the panel; 3 rows in `PanelCredential`; `api/tests/instance-operations.test.ts` (9 cases) and `api/tests/panel-client-contracts.test.ts` (12 cases) |
| IS-10 | 47 | "The panel reports the token format, but the key of the customer is not issued yet" | the live database | **wrong** | It is issued: 3 rows in `PanelCredential` |
| IS-11 | 51 | The platform has been changed 34 times since the first version | `git log` on VM 103 | **unverifiable** | The audited copy has no `.git`; the deployment has a history but the audit was not given a commit range. *Unblock:* point the audit at the real repository and give the range. |
| IS-12 | 55 | "Allocations 74 and 75 were assigned to the servers 10 and 11" | the panel | **unverifiable** | VM 100 is not reachable by SSH. *Unblock:* the audit key on the panel host. |
| IS-13 | 57 | "**16 routes of the instance answer 404 for the other customer**" | `api/tests/instance-operations.test.ts:348-366` | **holds** | The isolation test lists exactly **16** routes and expects `404` for every one |
| IS-14 | 69 | "The tests are green: **153 of 153** pass on VM 103" | `bash scripts/run-tests.sh` | **wrong** | **219** API tests + **21** web tests = **240**, all passing |
| IS-15 | 115 | "**25 models**" | `api/prisma/schema.prisma` | **wrong** | **31** models (`grep -cE "^model "`) |
| IS-16 | 115 | "The migrations `20261022192556_init`, `20261022200855_product_startup_command` and `20261022211200_pterodactyl_panel_credentials` are applied" | `_prisma_migrations` | **outdated** | Those three exist and are applied, but there are **10** migrations and 10 finished rows. The sentence reads as a complete list and is not one. |
| IS-17 | 116 | "scrypt (N=16384, r=8, p=1)" | `api/src/lib/password.ts` | **holds** | — |
| IS-18 | 118 | "Every state-changing route needs the double-submit CSRF token, except the credential-carrying authentication endpoints" | `api/src/plugins/csrf.ts:15-22` | **holds** | The 7 exempted routes; the webhook paths carry their own signature |
| IS-19 | 119 | "Login 10/15 min, register 20/15 min, reset 10/15 min, quote 120/min, order 30/10 min" | the route files | **holds** | `auth.ts:132`, `:167`, `:263`; `catalog.ts:129`; `orders.ts:65` |
| IS-20 | 120 | "**20 granular staff permissions**" | `api/src/lib/permissions.ts:2-24` | **wrong** | **22** permissions |
| IS-21 | 121 | "Every query of a customer is scoped to that customer; the staff area needs a permission" | `api/tests/isolation.test.ts` | **holds** | 9 test cases |
| IS-22 | 122 | The price formula | `api/src/services/pricing.ts:48-51` | **holds** | `base + ramPerGb×ΔRAM + cpuPerUnit×ΔCPU + diskPerGb×Δdisk + options` |
| IS-23 | 129 | "**The panel password of a customer account is encrypted with AES-256-GCM** with a key derived from `SESSION_SECRET`" | `api/src/lib/secrets.ts` | **wrong** | There is no panel password for a customer any more. The **client key** is what is encrypted, in `PanelCredential.tokenEnc`. The same error is in `PRODUCTION_READINESS.md:120-122` and `RUNBOOK.md:468-473`. |
| IS-24 | 133-136 | The secret is never in the code, the panel key and the secret of the bridge come from the environment, the TLS check cannot be switched off | `api/src/env.ts` | **holds** | — |
| IS-25 | 144 | "The routes are in `src/router.tsx`" | the file | **holds** | `web/src/router.tsx` and `web/src/routes.tsx` both exist |
| IS-26 | 145 | "The client is in `src/lib/api.ts`" | the file | **holds** | `web/src/lib/api.ts` |
| IS-27 | 147 | "**main bundle 316.71 kB (94.78 kB gzip)**; every route chunk ≤ 26 kB" | the deployed image | **wrong** | The main chunk is **318,678 B** (318.68 kB) and **92,758 B** gzipped (90.58 kB). Two route chunks are **larger than 26 kB**: `Docs` **79,113 B** and `InstanceDetail` **69,577 B**. The stylesheet is 64,741 B. |
| IS-28 | 163 | "**150 checks over 27 routes** at 320, 375, 390, 768, 1024 and 1440 px" | `scripts/ops/browser-responsive.mjs:35`, `:37-70` | **wrong** on the routes, **unverifiable** on the checks | The widths are right. The script has **26** route entries (25 fixed + 1 conditional), not 27. The 150 checks need a run. *Unblock:* the four account variables **and** a database the script may write to — it creates a support ticket. |
| IS-29 | 171-177 | The admin area has the infrastructure, the money, the health of the platform and the panel sync | `api/src/routes/admin.ts` | **holds** | `/admin/infrastructure`, `/admin/money`, `/admin/infrastructure/sync` all exist |
| IS-30 | 182-188 | The drill output: `tables live=26`, `users live=1`, `products live=5`, `migrations live=3` | the live database | **outdated** | Now **32 tables, 6 users, 5 products, 10 migrations**. The block is a transcript of the drill of 2026-10-22, presented as the current state. |
| IS-31 | 195 | "`api/tests` — **60 tests, all passing**" | `bash scripts/run-tests.sh` | **wrong** | **219** tests in 22 files, all passing |
| IS-32 | 197-204 | The table of the 6 test files | `api/tests/` | **outdated** | All six files exist and cover what the table says, but there are **22** test files, not 6. The description of `provisioning.test.ts` — "a missing client key is named in the error" — is also outdated: the error now names the **credential of the customer** on the panel (`api/src/services/pterodactyl/client.ts:86`). |
| IS-33 | 206-209 | The tests only ever touch a database whose name ends in `_test` | `scripts/run-tests.sh`, `api/tests/setup.ts`, `api/tests/globalSetup.ts` | **holds** | Enforced in three places |
| IS-34 | 213-223 | The seven real bugs that were found and fixed | the history | **unverifiable** | The audited copy has no `.git`. *Unblock:* the real repository. |
| IS-35 | 238-243 | The contract of the panel: the four application routes and the one client route | `api/src/services/pterodactyl/application.ts:110`, `:134`, `:159`, `:195`, `:221`; `client.ts` | **holds** for the code, **unverifiable** for the panel | The code calls `POST /api/application/servers`, `PATCH …/details`, `PATCH …/build`, `PATCH …/startup`, `POST …/reinstall` and `POST /api/client/servers/{uuid}/power` — exactly the table. The panel's own answer cannot be checked: VM 100 is not reachable by SSH. |
| IS-36 | 247-254 | "The install is driven through `POST /reinstall` … and the install takes one to three minutes" | `api/src/services/pterodactyl/application.ts:221` | **holds** for the code; the timing is **unverifiable** | — |
| IS-37 | 260-264 | "**The Pterodactyl Client API** … is implemented and the panel confirmed the token format, but `PTERODACTYL_CLIENT_KEY` is still empty, so no customer-facing call has been executed" | the live database and the panel | **wrong** | The shared key is gone — the same document says so at line 9-10 and line 285. Per-customer keys are minted (3 rows in `PanelCredential`) and the client API is used. **The document contradicts itself.** |
| IS-38 | 265-270 | "**A scan of the node shows that only `30001`, the port of the pre-existing test server, is published**" | a TCP probe from VM 103 | **wrong** | From VM 103: `30000` **open** (HTTP 200), `30001` **closed**, `30002` and `30003` closed. The document contradicts itself here too — line 298 says "Port `30000` on the node answers with HTTP 200". The probe settles it: **30000 is open, 30001 is closed.** |
| IS-39 | 271-272 | The live Stripe integration was never executed; only the local test gateway was | `stripe.ts:39-41` | **holds** | — |
| IS-40 | 273 | E-mail delivery was never exercised against a real SMTP server | `GET /api/health` | **holds** | `"mail": "file"` |
| IS-41 | 285 | "**Blocked by missing configuration**: `PANEL_KEYMINT_URL` and `PANEL_KEYMINT_SECRET`" | the production `.env` | **wrong** | **Both are set.** The bridge is installed and in use. This entry belongs to the history, not to the blocked list. |
| IS-42 | 286 | "**Blocked by missing configuration**: `PANEL_NODE_ADDRESSES`" | the production `.env` | **wrong** | It **is** set (`node1.blipmade.com:8080=10.77.0.11:8080`) |
| IS-43 | 287 | `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET` are missing | the production `.env` | **holds** | Both empty |
| IS-44 | 288 | `SMTP_URL` is missing | the production `.env` | **holds** | Empty |
| IS-45 | 289 | `CADDY_ADMIN_URL` + `CADDY_ADMIN_TOKEN` are missing | the production `.env` | **holds** | Both empty |
| IS-46 | 290 | `OFFSITE_TARGET` is missing | the production `.env` | **holds** | Not in the file |
| IS-47 | 298 | "Port `30000` on the node answers with HTTP 200" | a probe from VM 103 | **holds** | `HTTP 200` |
| IS-48 | 299 | `PATCH /servers/{id}/build` answered `500`; it is fixed | the panel | **unverifiable** | VM 100 is not reachable by SSH. The code sends the separated payload (`application.ts:159`). *Unblock:* the audit key on the panel host. |
| IS-49 | 300 | "The panel login answers `500` for every account" | the panel | **unverifiable** | VM 100 is not reachable by SSH. *Unblock:* the audit key on the panel host. |
| IS-50 | 301 | "All four panel administrators are `root_admin`" | the panel | **unverifiable** | VM 100 is not reachable by SSH. *Unblock:* the audit key on the panel host. |
| IS-51 | 307-309 | "**Add `PTERODACTYL_CLIENT_KEY`**, then run one provisioning job end to end and record the result here" | `api/src/env.ts` | **wrong** | No code reads that variable. The blocker is the node, not a key. |
| IS-52 | 315-317 | "Review the customer-domain route design with the gateway owner **before pointing `blipmade.com` at VM 103**. The live domain, the Caddy gateway and the Proxmox networking were not changed" | DNS + the Caddyfile | **wrong** | `blipmade.com` is already pointed at VM 103 (Caddy → `10.77.0.13:3000`) and the Caddyfile was changed on 2026-10-23 01:23. The networking was changed too: `panel.blipmade.com` resolves to `10.77.0.10` from VM 103 through `extra_hosts`. |
| IS-53 | 318-319 | Turn on the branch protection of `main` | the repository settings of GitHub | **unverifiable** | No `.git` here, no GitHub access. *Unblock:* the real repository. |
| IS-54 | 333 | "Catalog: twelve static products with illustrative prices → the catalogue of the API" | `GET /api/catalog/products` | **holds** (the "After" column) | 5 products from the database. The "Before" column (twelve static products) is history. |
| IS-55 | 339 | "Status page: one panel ping for everything → **nine components**" | `GET /api/status` | **wrong** | **10** components |
| IS-56 | 340 | "Secret hygiene: a password in a public script → every credential comes from the environment" | `api/src/env.ts`, `scripts/` | **holds** | No credential is hard-coded; the TLS check cannot be switched off |
| IS-57 | 342 | "CI: none → typecheck, tests, build, secret scan, dependency audit, schema drift" | `.github/workflows/ci.yml` | **holds** | 6 jobs |
| IS-58 | 343 | "Backups: local only → encrypted, verified, with a retention window; the destination is still missing" | the scripts and the `.env` | **holds** | `OFFSITE_TARGET` unset |
| IS-59 | 344 | "Attachments: a description of a file → a real upload with a size limit, a type allow-list and access rules" | `api/src/routes/tickets.ts` | **holds** | — |

---

## 3. The other documents and the `README.md`

### 3.1 `docs/API_CONTRACT.md`

| # | Line | The claim | The source of truth | Result | Evidence |
|---|---|---|---|---|---|
| AC-01 | 9 | `POST /api/auth/register` takes `{ email, password, name? }` | `api/src/routes/auth.ts:38-43` | **wrong** | The schema **requires** `firstName` and `lastName` (both `z.string().trim().min(1).max(80)`); `name` is not an accepted field. A client written from this document cannot register. |
| AC-02 | 17 | `POST /api/auth/enroll-admin` "only works while there is no admin in the database" | `api/src/routes/auth.ts:310-311` | **holds** | — |
| AC-03 | 19 | `User = { id, email, name, role, emailVerified }` | `api/src/routes/auth.ts` | **outdated** | The answer also carries `firstName`, `lastName`, `pterodactylUserId` and `permissions` |
| AC-04 | 42 | "`bm_session` (HttpOnly, SameSite=Lax, **Secure in production**)" | `api/src/plugins/auth.ts:74-79`, `:49` | **outdated** | `secure` follows the **protocol of the request** (`COOKIE_SECURE` is not set in production and is not in the production `.env`). Over TLS it is `Secure`; over the plain HTTP staging address it is not — which is the behaviour `IMPLEMENTATION_STATUS.md:218-219` lists as a fixed bug. The wording should be "Secure when the request arrived over https". |
| AC-05 | 44 | `bm_csrf` is readable by JS | `api/src/plugins/csrf.ts:45` | **holds** | `httpOnly: false` |
| AC-06 | — | The document lists **123** method+path pairs; the code has **142** | the source and the running route tree | **outdated** | **20 live routes are not documented**: `DELETE /api/admin/customers/{id}/panel/credential`, `GET /api/admin/customers/{id}/panel`, `GET /api/admin/email/delivery`, `GET /api/admin/money`, `GET /api/auth/require`, `GET /api/instances/{id}/resources/quote`, `GET /api/internal/not-a-real-route`, `GET /api/internal/whoami`, `GET /api/tickets/{id}/attachments/{attachmentId}`, `GET /api/webhooks/stripe/failed`, `PATCH /api/instances/{id}/startup`, `POST /api/admin/customers/{id}/panel/credential`, `POST /api/admin/instances/import`, `POST /api/admin/tickets/{id}/assign`, `POST /api/instances/{id}/files/archive`, `POST /api/instances/{id}/files/unarchive`, `POST /api/internal/prune-sessions`, `POST /api/tickets/{id}/attachments`, `POST /api/webhooks/stripe/replay`, `POST /api/webhooks/stripe/test` |
| AC-07 | — | `POST /api/admin/instances/{id}/import` | `api/src/routes/admin.ts` | **wrong** | The route is `POST /api/admin/instances/import` — **without** the `{id}`. The contract documents a path that does not exist. |
| AC-08 | 219 | The Stripe webhook "**always** answers `200`" | `api/src/routes/webhooks.ts:473-477` | **wrong** | A failed event answers **500**, which is what `IMPLEMENTATION_STATUS.md:330` says. The two documents contradict each other; the code agrees with the second one. |
| AC-09 | 223 | The health answer is `{ status, service, version, uptimeSeconds, database, redis }` | `GET /api/health` | **outdated** | It also carries `mail`, `mailDelivery` (an object with counters), `stripe`, `pterodactyl` and `panelKeyBridge` |
| AC-10 | 224 | The status answer is `{ components: [{ id, name, state }], updatedAt }` | `GET /api/status` | **outdated** | It also carries `overall`, and every component carries a `detail` that says what was measured |
| AC-11 | 52-61 | `GET /api/catalog/products?category=&search=` | the live route tree | **holds** | The route is there |

### 3.2 `docs/RUNBOOK.md`

| # | Line | The claim | The source of truth | Result | Evidence |
|---|---|---|---|---|---|
| RB-01 | 50-62 | The example answer of `/health` contains `pterodactylClient: "not_configured"` | `GET /api/health` | **wrong** | There is no `pterodactylClient` field any more, and no `mailDelivery`/`panelKeyBridge` in the example. The **table** at lines 65-73 lists `panelKeyBridge` and not `pterodactylClient` — the example and the table of the same section contradict each other. |
| RB-02 | 65-73 | The field table of the health answer | `GET /api/health` | **holds** | Every field of the table is in the live answer, including `panelKeyBridge` |
| RB-03 | 80-91 | The ten components of the status answer | `GET /api/status` | **holds** | 10 components, the same names |
| RB-04 | 102 | The worker answers `{"status":"ok","database":true,"redis":true,"worker":true}` | the running worker | **holds** | The live answer adds `mail` and `email`: `{"status":"ok","database":true,"redis":true,"worker":true,"mail":"file","email":{"queued":0,"delivered":0,"writtenToFile":1,"failed":0}}` |
| RB-05 | 113 | `wget -qO- http://127.0.0.1:3000/healthz` answers | the running web container | **holds** | `{"status":"ok","fonts":{"family":"Proxima Nova","installed":false,…}}` |
| RB-06 | 118-126 | The queue is `blipmade.provision`; the keys are `bull:blipmade.provision:*` | the running Redis | **holds** | `redis-cli --scan --pattern "bull:blipmade*"` → `bull:blipmade.email:meta`, `bull:blipmade.email:stalled-check`, `bull:blipmade.provision:events`, `bull:blipmade.provision:id`, `bull:blipmade.provision:meta`, `bull:blipmade.provision:stalled-check` |
| RB-07 | 129 | "The worker runs two jobs at a time, so `active` is never above 2" | `api/src/services/queue.ts:73`, `:211` | **holds** | The provisioning worker has `concurrency: 2`; the e-mail worker has `concurrency: 5` |
| RB-08 | 145 | `curl https://panel.blipmade.com/` answers | the panel | **holds** | `HTTP 200` |
| RB-09 | 151 | `PTERODACTYL_APP_KEY` is set | the production `.env` | **holds** | Set |
| RB-10 | 165-166 | "A job fails after five attempts with an exponential backoff" | `api/src/services/queue.ts:42-45` | **holds** | `attempts: 5`, `backoff: { type: 'exponential', delay: 5000 }` |
| RB-11 | 177-179 | The retry is `POST /api/admin/instances/<id>/retry` with `Authorization: Bearer <the session cookie or the internal token>` and `x-csrf-token` | `api/src/routes/admin.ts:845-848` | **wrong** | The route needs a **staff session cookie** (`requireStaff`) **and** the permission `services.write`. There is no bearer-token path for it. The `Authorization: Bearer` header in the runbook would be ignored and the request would answer **401**. The header should be the `bm_session` cookie; the CSRF header is right. |
| RB-12 | 182-183 | The retry resumes after `provisionStep` | `api/src/services/provisioning.ts` | **holds** | — |
| RB-13 | 164 | "Customers can sign in, read their instances, open tickets **and pay**" | `GET /api/health` | **wrong** | Payments are off: `POST /api/orders/:id/checkout` answers **503 `payments_unavailable`** (`api/src/routes/orders.ts:154`). |
| RB-14 | 203-205 | "The allocation ports … **are published on the node**, not by the platform" | a TCP probe from VM 103 | **wrong** | `30001` is **closed**. `README.md` §10 and `IMPLEMENTATION_STATUS.md:265-270` say the same as the probe; only this sentence of the runbook says the opposite. |
| RB-15 | 295 | The webhook without a signature answers `500 {"received":false,…}` | `api/src/routes/webhooks.ts` | **holds** | The route answers 500 when the signature does not check out |
| RB-16 | 297 | The webhook without a configuration answers `200 {"received":false,"reason":"Stripe is not configured."}` | `api/src/routes/webhooks.ts` | **holds** | — |
| RB-17 | 393-401 | The drill transcript: `tables live=26`, `users live=1`, `products live=5`, `migrations live=3` | the live database | **outdated** | 32 / 6 / 5 / 10 |
| RB-18 | 465 | "`pterodactylClient` has to be `configured`" | `GET /api/health` | **wrong** | The field does not exist. The field to watch is `panelKeyBridge` |
| RB-19 | 468-473 | "The panel password of every customer account is encrypted with a key that is derived from `SESSION_SECRET`" | `api/src/lib/secrets.ts` | **wrong** | It is the **client key** that is encrypted, in `PanelCredential.tokenEnc` |
| RB-20 | 510 | The off-site copy is opened with `openssl enc -d -aes-256-cbc -pbkdf2 -iter 600000 -md sha256` | `scripts/backup-offsite.sh:59`, `:245` | **holds** | `PBKDF2_ITER="${OFFSITE_PBKDF2_ITER:-600000}"` |

### 3.3 `docs/EMAIL.md`

| # | Line | The claim | The source of truth | Result | Evidence |
|---|---|---|---|---|---|
| EM-01 | — | The queue is `blipmade.email` | the running Redis | **holds** | `bull:blipmade.email:meta` |
| EM-02 | 371 | A message is "tried four times" | `api/src/services/queue.ts:120` | **holds** | `attempts: 4` |
| EM-03 | 290 | The worker health answer carries `mail` and `email` | the running worker | **holds** | The live answer carries both |
| EM-04 | 379 | `GET /api/admin/email/delivery` with the permission `settings.read` | `api/src/routes/admin.ts:829` | **holds** | — |
| EM-05 | 302 | The file name is `<timestamp>-<8 characters of a hash>.json` | `api/src/lib/mailer.ts:324` | **holds** | `${Date.now()}-${tokenReference(payload.key)}.json` |
| EM-06 | 390-395 | "**The state of the messages lives in the memory of the process. It is lost when the API or the worker restarts, and the API and the worker do not share it. A table of the platform would fix that: `MailDelivery` …**" | `api/prisma/schema.prisma:72`, the live database | **wrong** | The table **exists**: the model `MailDelivery` is in the schema, the table has **13 rows**, and the health answer and `GET /api/admin/email/delivery` both read from it. The section describes a proposal that was carried out. **The same document contradicts itself** — §6 and §8 already describe the persistent table. |
| EM-07 | 396-401 | The notifications of the invoices and of the services are **not wired** | the call sites | **holds** | The templates and the helpers exist; no call site in the payment or the provisioning path calls them |
| EM-08 | — | The e-mail is a real SMTP relay when `SMTP_URL` is set | `GET /api/health` | **holds** | `"mail": "file"` — the relay is off in production |

### 3.4 `docs/HEADLESS_PANEL.md` and `docs/PANEL_BRIDGE.md`

| # | Doc / line | The claim | The source of truth | Result | Evidence |
|---|---|---|---|---|---|
| HP-01 | HEADLESS_PANEL.md:38, PANEL_BRIDGE.md:78-81 | A whole key is "**forty-eight characters** long" | the example in the same document | **wrong** | The example `ptlc_0123456789abcdef0123456789abcdef0123456789abcd` is **51** characters *(the placeholder from the documentation, not a live key)*, and `ptlc_` (5) + identifier (16) + secret (32) is **53**. The code accepts any key of **40** characters or more (`api/src/services/pterodactyl/client.ts`, `isClientKey`), so nothing breaks — but the number in the text is wrong and contradicts its own example. |
| HP-02 | HEADLESS_PANEL.md:149-157 | "What is still missing": the key of a customer and the start of the container are blocked by "the panel cannot issue a client key by itself" | the panel and the live database | **wrong** | The bridge is installed (**405** on the panel against **404** for an absent path) and in use (**3** rows in `PanelCredential`). The `started` step already uses the customer key (`provisioning.ts:566`). |
| HP-03 | HEADLESS_PANEL.md:26-27 | "The password of the panel account is random and is not kept" | `api/prisma/schema.prisma` | **outdated** | There is no panel password for a customer any more; the **client key** is kept, encrypted |
| HP-04 | HEADLESS_PANEL.md:145 | The customer routes: `GET /settings`, `PATCH /settings`, `POST /settings/reinstall`, `POST /suspend` | `api/src/routes/instance-server.ts` | **holds** | All four exist |
| PB-01 | PANEL_BRIDGE.md:268 | `429` — more than 30 requests a minute | `panel-bridge/BlipmadeBridgeServiceProvider.php:32` | **holds** | `throttle:30,1` |
| PB-02 | PANEL_BRIDGE.md:121 | The bridge is "installed on the panel host (VM 100), as root" | the panel | **holds**, and the audit can now add that it **is already installed** | The route answers **405** on the panel |
| PB-03 | PANEL_BRIDGE.md — the two layouts | The installer handles the provider and the `routes/api.php` snippet | `panel-bridge/install.sh:92-99` | **holds** | The installer tests for `routes/api.php` and for `app/Providers/RouteServiceProvider.php` |
| PB-04 | `panel-bridge/README.md` | "the route is appended to `routes/api.php` of the panel" | `panel-bridge/install.sh:92-99` | **outdated** | The README describes only the legacy layout. The installer registers a **provider** when the panel is the modern layout, and the `routes-snippet.php` is the alternative. |

### 3.5 `docs/CUSTOMER_PANEL_COMPLETION.md`

| # | Line | The claim | The source of truth | Result | Evidence |
|---|---|---|---|---|---|
| CP-01 | 18 | "Tests of the API: **219 passed** (22 files)" | `bash scripts/run-tests.sh` | **holds** | `Test Files 22 passed (22) / Tests 219 passed (219)` |
| CP-02 | 19 | "Tests of the web: **13 passed**" | `npm test` in `web/` | **wrong** | **21** passed |
| CP-03 | 20 | "**134 checks** passed, 0 problems" | `scripts/ops/browser-customer-panel.mjs` | **unverifiable** | The script needs `BM_EMAIL`, `BM_PASSWORD`, `BM_ADMIN_EMAIL` and `BM_ADMIN_PASSWORD`, and **it creates a support ticket** — a write to the production database. The static count of `check(` call sites is 40. *Unblock:* four disposable accounts and a database the script may write to. |
| CP-04 | 22 | "Nothing was deleted; **two tables and two columns** were added" | the migrations | **wrong** | `20261024093000_customer_settings` adds the tables `EmailChangeRequest` and `NotificationPreference` and the column `User.deletionRequestedAt`; `20261024100000_mail_delivery` adds the table `MailDelivery`. That is **three tables and one column**. |
| CP-05 | 25 | "The typeface: Geist, because the web project of Adobe is not configured" | `web/fonts.mjs`, `GET /healthz` | **outdated** | The Adobe kit is gone entirely (no `web/fontkit.mjs`, no `ADOBE_FONTS_KIT_URL`). The typeface is served from the machine and the three licensed files are **missing**; the fallback is Geist. `MOBILE_AND_TYPOGRAPHY_FIX.md:322` says this correctly. |
| CP-06 | 44, 50 | The routes `/app/deploy/:slug` and `/admin/*` | `web/src/routes.tsx` | **holds** | — |

### 3.6 `docs/CUSTOMER_PANEL_AUDIT.md`

| # | Line | The claim | The source of truth | Result | Evidence |
|---|---|---|---|---|---|
| CA-01 | 56 | "`web/tests/auth-guard.test.ts` — 8 checks" | the file | **holds** | 8 cases |
| CA-02 | 103 | "`web/tests/fontkit.test.mjs` — 5 checks" | the repository | **wrong** | The file **does not exist**. It was removed with the Adobe kit; `MOBILE_AND_TYPOGRAPHY_FIX.md:326` says so, and `web/tests/` holds only `auth-guard.test.ts`, `fonts-server.test.mjs` and `fonts.test.mjs`. |
| CA-03 | 101 | "`docs/TYPOGRAPHY.md` has … the line to put in the `.env`" | `docs/TYPOGRAPHY.md` | **wrong** | `TYPOGRAPHY.md` says the opposite: there is no variable and no address of a third party. The files are placed on the machine. |
| CA-04 | 274 | "`api/tests/settings.test.ts` — 11 checks" | the file | **wrong** | **16** cases |
| CA-05 | 370 | "The captures are in `screenshots/panel` on the host" | the repository | **wrong** | There is no `screenshots/panel`. The repository has `screenshots/` (34 PNG), `screenshots/audit/` (3) and `screenshots/review/` (8) |
| CA-06 | 349 | "the nine routes of the customer" | `scripts/ops/browser-responsive.mjs:37-70` | **outdated** | The responsive script now walks **26** route entries (25 fixed + 1 conditional) |
| CA-07 | 307-309 | The table `MailDelivery` | the schema and the live database | **holds** | The model is there, 13 rows |

### 3.7 `docs/FRONTEND_REVIEW.md`

| # | Line | The claim | The source of truth | Result | Evidence |
|---|---|---|---|---|---|
| FR-01 | 31-32 | "**51** `font-extrabold`, **31** `font-medium` and **5** `font-normal`" | `web/src` | **wrong** | **54**, **26** and **6** (`grep -ro` over `web/src`) |
| FR-02 | 52-53 | "**87 strings in 23 files**" carry a focus ring | `web/src` | **wrong** | **103** occurrences of `focus-visible:outline-none` in **30** files; 244 occurrences of `focus-visible:ring*` in 34 files |
| FR-03 | 144 | "**119 of 119 tests pass, 11 files**" | `bash scripts/run-tests.sh` | **wrong** | **240** tests in **25** files |
| FR-04 | 145 | "**150 checks over 27 routes**" | `scripts/ops/browser-responsive.mjs:37-70` | **wrong** on the routes, **unverifiable** on the checks | **26** route entries. The widths (320, 375, 390, 768, 1024, 1440) are right. *Unblock:* the four account variables and a writable database. |
| FR-05 | 146 | "**46 links** without a dead end" | `scripts/ops/browser-checks.mjs:229-248` | **unverifiable** | The script counts the distinct links it finds at run time. *Unblock:* the same run as FR-04. |
| FR-06 | 147 | "**46 images before and 46 after**, at 390 px and 1440 px" | the repository | **wrong** | The repository holds **45 PNG** in total. `screenshots/index.json` has **30** entries (15 `mobile` + 15 `desktop`). `screenshots/` is in `.gitignore`, so no image is in the history either. |
| FR-07 | 165 | "The web login of the panel answers 500 TypeError for every account. A `ptlc_` client key cannot be issued from the browser, so the relay of the console, the power control of a customer and the key per customer **stay blocked**" | the panel + the live database | **wrong** for the consequence, **unverifiable** for the 500 itself | The 500 is on the panel (VM 100, unreachable by SSH). But the key per customer is **not** blocked: the bridge is installed and 3 keys exist. |

### 3.8 `docs/MOBILE_AND_TYPOGRAPHY_FIX.md`, `docs/TYPOGRAPHY.md`

| # | Doc / line | The claim | The source of truth | Result | Evidence |
|---|---|---|---|---|---|
| MT-01 | MOBILE_AND_TYPOGRAPHY_FIX.md:16 | `curl -s https://blipmade.com/app` returns `<html lang="en">` | the live site | **holds** | The page begins with `<!doctype html>\n<html lang="en">` |
| MT-02 | MOBILE_AND_TYPOGRAPHY_FIX.md:18 | `/warmup.html` answers 404 | the live site | **holds** | `HTTP 404` |
| MT-03 | MOBILE_AND_TYPOGRAPHY_FIX.md:19 | Nothing in the repository asks a third party for a typeface | the repository | **holds** | `grep -rn "ADOBE_FONTS\|fontkit"` finds nothing outside the documents that say the kit was removed |
| MT-04 | MOBILE_AND_TYPOGRAPHY_FIX.md:206-212 | The answer of `/healthz` | the running web container | **holds** | The live answer has `family: "Proxima Nova"`, `installed: false`, the three missing files and `fallback: "Geist Variable"` |
| MT-05 | MOBILE_AND_TYPOGRAPHY_FIX.md:222-223 | The font URL answers 404 | the live site | **holds** | `GET /fonts/proxima-nova-400.woff2` → `HTTP 404`; the Geist file of the same folder → `HTTP 200` |
| MT-06 | MOBILE_AND_TYPOGRAPHY_FIX.md:302-304 | "54 combinations of route and width, 540 checks … 66 combinations" | the browser runs | **unverifiable** | *Unblock:* a run of `browser-responsive.mjs` against a writable copy. |
| MT-07 | MOBILE_AND_TYPOGRAPHY_FIX.md:320-328 | The table of the files, with `web/fontkit.mjs` and `web/tests/fontkit.test.mjs` marked as removed | the repository | **holds** | Both files are indeed gone |
| TY-01 | TYPOGRAPHY.md §5 | The three licensed files are `proxima-nova-400/600/700.woff2` | `web/fonts.mjs`, `GET /healthz` | **holds** | The three names are exactly the ones the health answer reports as missing |
| TY-02 | TYPOGRAPHY.md | ".gitignore keeps `*.woff2` under `web/public/fonts/` out of the history" | `.gitignore` | **holds** | Four lines: `web/public/fonts/*.woff`, `*.woff2`, `*.ttf`, `*.otf` |
| TY-03 | TYPOGRAPHY.md §4 | The desktop Adobe files carry `fsType = 0x0004` and may not be embedded in a web page | the licensed files | **unverifiable** | The files are not in the repository and are not in the image. *Unblock:* the operator's licensed copy. |

### 3.9 `docs/AUDIT_REMEDIATION.md`

| # | Line | The claim | The source of truth | Result | Evidence |
|---|---|---|---|---|---|
| AR-01 | BM-AUD-010 | "**Partial: the platform still uses one global client key**" | `api/src/services/panel/credentials.ts`, the live database | **outdated** | Every customer has a key of their own, minted through the bridge (**3** rows in `PanelCredential`). The global key is not read by any code. |
| AR-02 | "What is still open" #1 | "`PTERODACTYL_CLIENT_KEY` — the platform needs a shared client key" | `api/src/env.ts` | **wrong** | The variable is not in the schema and is read by nothing. The finding was closed by a different design. |
| AR-03 | BM-AUD-012 | "**The Caddy configuration itself was not touched**" | `/etc/caddy/Caddyfile` | **wrong** | The Caddyfile has mtime 2026-10-23 01:23 and gained the `blipmade.com` block; the snapshot `Caddyfile.before-blipmade` proves the block was added after it was taken. |
| AR-04 | BM-AUD-016 | "The worker sweeps every fifteen minutes" | `api/src/worker.ts:168` | **holds** | `setInterval(sweepBilling, 15 * 60_000)` |
| AR-05 | BM-AUD-001 | "`api/tests/upgrades.test.ts` — 6 cases" | the file | **holds** | 6 |
| AR-06 | BM-AUD-006 | "`api/tests/pterodactyl-client.test.ts` — 14 cases" | the file | **holds** | 14 |
| AR-07 | BM-AUD-016 | "`api/tests/billing.test.ts` — 5 cases" | the file | **holds** | 5 |
| AR-08 | BM-AUD-005 | "The egg is `node.js generic` (id 15) and the image is `ghcr.io/ptero-eggs/yolks:nodejs_25`" | the live database + the panel | **holds** for the image and the id; **unverifiable** for the name | The `Product` row of `discord-bot` has `eggId = 15` and that image. The name of the egg lives on the panel (VM 100). *Unblock:* the audit key on the panel host. |
| AR-09 | BM-AUD-014 | The protected server (id 2) and its allocation | the panel and the node | **unverifiable** | VM 100 is not reachable by SSH; the allocation port 30001 is closed from VM 103. |

### 3.10 `README.md` and `scripts/README.md`

| # | Line | The claim | The source of truth | Result | Evidence |
|---|---|---|---|---|---|
| RD-01 | §1, §6 | The architecture: the Caddy edge on VM 102, the web on `:3000`, the API on `:3100`, the worker on `:3101`, PostgreSQL and Redis, the panel on VM 100, the node on VM 101 | the running system | **holds** | `docker compose ps`; `caddy version` → 2.6.2 on 10.77.0.12 |
| RD-02 | §5 | "The tests pass" | `bash scripts/run-tests.sh` | **holds** | 240 tests, 240 passing |
| RD-03 | §7 | The table of the environment variables | `api/src/env.ts` | **holds**, with one exception | `TRUSTED_PROXIES` is the name the **API** reads (`env.ts:95`); the production file sets `TRUSTED_PROXY_IPS`, which is the name the **web** container reads (`compose.web.yml:16`). Two different variables; the API falls back to its default. The document does not say which process each belongs to. |
| RD-04 | §7 | `DOMAIN_BASE` is the variable for the customer domains | the production `.env` | **holds**, but the document leaves out the second half of the story | The production file has `DOMAIN_BASE=` **empty** and a `DOMAIN_TARGET=193.34.214.143`. `DOMAIN_TARGET` is **not** in the schema of `api/src/env.ts`; it is read straight from `process.env` in `api/src/routes/domains.ts:208` (with the same address as a hard-coded fallback), so it works but is neither validated nor declared. A variable that looks like part of the schema and is not. |
| RD-05 | §7 | `CADDY_ADMIN_URL` and `CADDY_ADMIN_TOKEN` are empty | the production `.env` | **holds** | Both empty |
| RD-06 | §9 | The CI table: typecheck, tests, build, secret scan, dependency audit, schema drift | `.github/workflows/ci.yml` | **holds** | 6 jobs; the accept-list holds 12 advisories (`.github/workflows/ci.yml:311-322`) |
| RD-07 | §8.2 | The drill numbers `26 / 1 / 5 / 3` | the live database | **outdated** | 32 / 6 / 5 / 10 |
| RD-08 | §10 | "The panel still has four `root_admin` accounts" | the panel | **unverifiable** | VM 100 is not reachable by SSH. *Unblock:* the audit key on the panel host. |
| RD-09 | §10 | "The Caddy administrative API has never been called" | the production `.env` | **holds** | Both variables are empty; `gateway.ts:177` returns `false` |
| RD-10 | §10 | "The off-site backup is not configured" | the production `.env` | **holds** | `OFFSITE_TARGET` is absent |
| RD-11 | §10, bullet 1 | "The allocation ports are **not** published on the node" | a TCP probe from VM 103 | **holds** | `30001` closed, `30002`/`30003` closed; only `30000` answers |
| RD-12 | §10, bullet 2 | "The panel cannot issue a client key on its own … the bridge of `panel-bridge/` has to be installed on the panel; **until then the customer operations answer `503`**" | the panel and the live database | **wrong** | The bridge **is** installed (the route answers **405** on the panel) and 3 keys have been minted. The customer operations do not answer 503. |
| RD-13 | §9 | "The dependency tree carries known advisories" | `.github/workflows/ci.yml:311-322` | **holds** | 12 accepted advisories |
| SR-01 | `scripts/README.md` | The eleven runbooks, what each one changes and what it needs | `scripts/` | **holds** | 11 files at the root of `scripts/`; the dry-run defaults are real (`cleanup-panel.py` needs `--execute` **and** `--confirm`) |
| RD-14 | §7, line 259 | "`METRICS_ENABLED` — whether the metrics route is served" | `api/src/env.ts:87` and the live route tree | **wrong** | The variable is in the schema with the default `true`, but **no code reads it** and **there is no metrics route**: the 121 live paths contain no platform-level `/metrics`. The only route of that name is `GET /api/instances/{id}/metrics`, which is the usage of a Pterodactyl server, not a platform metric. The variable has no effect. |

---

## 4. The drifts that would mislead an operator or a new engineer, in order

### D1 — A dead variable is presented as the blocker of the platform. **Critical.**

`docs/PRODUCTION_READINESS.md:71-77` and `:110-111`, `docs/IMPLEMENTATION_STATUS.md:260-264` and `:307-309`, `docs/AUDIT_REMEDIATION.md` (BM-AUD-010 and "what is still open" #1) and `README.md` §10 all point at `PTERODACTYL_CLIENT_KEY` as the thing that stops the customer operations.

**The truth:** no code in `api/src/` reads that variable — it is not in the schema of `api/src/env.ts` (`grep -rn PTERODACTYL_CLIENT_KEY api/src` returns nothing). The design was replaced: every customer has **their own** `ptlc_` key, minted through the bridge of the panel, stored encrypted in `PanelCredential.tokenEnc`. The bridge **is** installed on the panel and **has been used** (3 rows in `PanelCredential`).

**The exact correction:** in the four documents, replace every mention of `PTERODACTYL_CLIENT_KEY` as a blocker with a statement of the real design — the bridge (`PANEL_KEYMINT_URL` + `PANEL_KEYMINT_SECRET`), one key per customer, stored encrypted, rotated by `POST /api/admin/customers/{id}/panel/credential`. Where the documents say "the customer operations answer `503`", replace it with the state of the live system: the operations work, and what is still missing is the **node** (the allocation port is closed).

### D2 — Two documents contradict each other about the port of the node, and both are wrong. **Critical.**

`docs/IMPLEMENTATION_STATUS.md:265-270` says only `30001` is published; `docs/IMPLEMENTATION_STATUS.md:298` and `docs/PRODUCTION_READINESS.md:20` say `30000` answers; `docs/RUNBOOK.md:203-205` says the allocation ports **are** published; `README.md` §10 says they are **not**.

**The truth, from a read-only probe of `10.77.0.11`:** `8080` open, `30000` open (HTTP 200), **`30001` closed**, `30002` and `30003` closed.

**The exact correction:** in every one of the four places, write the measured state — "`30000` answers with HTTP 200, the allocation port `30001` is closed" — and say in one sentence that the allocation port is a **node** fault, to be checked on VM 101 (guest agent + audit key), not a platform fault.

### D3 — The counts of the tests are wrong in four documents. **High.**

`PRODUCTION_READINESS.md:15` and `:29` (119 / 11 files), `IMPLEMENTATION_STATUS.md:59` (153), `:195` (60), `FRONTEND_REVIEW.md:144` (119 / 11 files), `CUSTOMER_PANEL_COMPLETION.md:19` (13 web tests).

**The truth:** `bash scripts/run-tests.sh` → **`Test Files 22 passed (22)`, `Tests 219 passed (219)`** for the API and **`# tests 21`, `# pass 21`** for the web — **240 tests in 25 files, all green**.

**The exact correction:** replace every one of those numbers with "240 tests in 25 files (219 API in 22 files, 21 web in 3 files)". The statement "the tests pass" stays true; the numbers do not.

### D4 — The health answer in the documents names a field that does not exist. **High.**

`docs/RUNBOOK.md:50-62` shows `pterodactylClient`, `docs/PRODUCTION_READINESS.md:38-39` speaks of "the two Pterodactyl keys", `docs/RUNBOOK.md:465` tells the operator to watch `pterodactylClient`, and `docs/API_CONTRACT.md:223` lists the fields.

**The truth**, from `GET /api/health`:
`status, service, version, uptimeSeconds, database, redis, mail, mailDelivery{transport, configured, counts{queued, delivered, writtenToFile, failed}}, stripe, pterodactyl, panelKeyBridge`. There is no `pterodactylClient`; the per-customer credential is reported by `panelKeyBridge`.

**The exact correction:** in the runbook's example, replace `"pterodactylClient": "not_configured"` with the real pair `"pterodactyl": "configured"` and `"panelKeyBridge": "configured"`, and add the `mailDelivery` object. In the API contract, list all eleven fields.

### D5 — "The customer operations are blocked" is stated in four documents, in two of them next to the opposite statement. **High.**

`PRODUCTION_READINESS.md:21`, `HEADLESS_PANEL.md:149-157`, `IMPLEMENTATION_STATUS.md:260-264` and `FRONTEND_REVIEW.md:165` say the client API, the power control, the files and the console are blocked. `IMPLEMENTATION_STATUS.md:47` and `:69` — **the same document** — say the operations of a customer work.

**The truth:** the bridge is installed and in use; the per-customer key is issued, rotated and used; the client adapter refuses anything that is not a `ptlc_` key.

**The exact correction:** in the four places, replace "blocked by the missing client key" with "the client API works through the per-customer key; what is still missing is the node (the allocation port) and the panel shell for the audit".

### D6 — The Caddy gateway and the live domain *were* changed, although three documents say they were not. **High.**

`PRODUCTION_READINESS.md:99-100` and `:128`, `IMPLEMENTATION_STATUS.md:315-317`, `AUDIT_REMEDIATION.md` BM-AUD-012 all say the Caddy configuration on VM 102 and the live domain were not changed.

**The truth:** `/etc/caddy/Caddyfile` has mtime **2026-10-23 01:23** and contains the `blipmade.com, www.blipmade.com → reverse_proxy 10.77.0.13:3000` block; the snapshot `/etc/caddy/Caddyfile.before-blipmade` (same mtime) contains only the `test.apps.blipmade.com` block, so the Blipmade block was added after that snapshot was taken. `blipmade.com` now resolves to Cloudflare and is served by the web container on VM 103. The Proxmox networking was changed too: `panel.blipmade.com` resolves to `10.77.0.10` from VM 103.

**The exact correction:** replace "not changed" with "changed on 2026-10-23: the Caddyfile gained the `blipmade.com` block and `panel.blipmade.com` was pointed at the panel through `extra_hosts`". And add the finding that the rule for `test.apps.blipmade.com` still points at `10.77.0.11:30001`, a port that is closed.

### D7 — The API contract misses 20 live routes and names one that does not exist. **High.**

`docs/API_CONTRACT.md` names 123 method+path pairs; the code has 142.

**The exact correction:** add the 20 routes listed in AC-06, and change `POST /api/admin/instances/{id}/import` to `POST /api/admin/instances/import`. The `/api/internal/*` routes should be marked as internal in the contract — they are reachable from the public internet today, and `GET /api/internal/whoami` needs no token.

### D8 — The webhook answers 200 in one document and 500 in the other. **Medium.**

`API_CONTRACT.md:219` says "always `200`"; `IMPLEMENTATION_STATUS.md:330` says a failure answers `500`. The code answers **500** on a failed event (`api/src/routes/webhooks.ts:473-477`).

**The exact correction:** in the API contract, write "**200** when the event is accepted, **500** when the processing fails — the event stays in the ledger and can be replayed with `POST /api/webhooks/stripe/replay`".

### D9 — The state of the e-mail is described as living in the memory of the process, in the document that already describes the table. **Medium.**

`docs/EMAIL.md:390-395` says the state of the messages lives in the memory of the process and proposes the table `MailDelivery` — while §6 and §8 of the same document already describe that table.

**The exact correction:** replace §9 item 1 with "the state lives in the table `MailDelivery`; the API and the worker share it" and keep only the two items that are still true (the notifications of the invoices and of the services are not wired; the token of the message is not stored in clear).

### D10 — The model count, the permission count and the migration list are out of date. **Medium.**

`IMPLEMENTATION_STATUS.md:115` says 25 models and lists 3 migrations; `:120` says 20 permissions. The truth is **31 models**, **10 migrations**, **22 permissions**.

**The exact correction:** update the three numbers and list the 10 migrations.

### D11 — The sizes of the bundle and the numbers of the checks are wrong. **Medium.**

`IMPLEMENTATION_STATUS.md:147` says the main bundle is 316.71 kB (94.78 kB gzip) and that every route chunk is ≤ 26 kB. The deployed image: the main chunk is **318,678 B**, gzip **92,758 B**, and **two route chunks are larger than 26 kB** (`Docs` 79,113 B, `InstanceDetail` 69,577 B). `IMPLEMENTATION_STATUS.md:163` and `FRONTEND_REVIEW.md:145` say "27 routes"; the script has **26** route entries.

**The exact correction:** write the measured sizes, name the two chunks that exceed 26 kB, and write 26 routes. The check count stays "to be measured" until a run is possible.

### D12 — The drill numbers are quoted as the current state in three documents. **Medium.**

`PRODUCTION_READINESS.md:45-48`, `IMPLEMENTATION_STATUS.md:182-188`, `README.md` §8.2 all quote `26 tables / 1 user / 5 products / 3 migrations`.

**The truth:** **32 tables, 6 users, 5 products, 10 migrations**. The transcript is of the drill of 2026-10-22, before seven migrations.

**The exact correction:** label the block as "the drill of 2026-10-22" and add the current numbers next to it.

### D13 — The drift between the inventory and the reality in the smaller documents. **Low to medium.**

* `CUSTOMER_PANEL_AUDIT.md:103` names a test file that was deleted (`web/tests/fontkit.test.mjs`).
* `CUSTOMER_PANEL_AUDIT.md:101` points at a line in `TYPOGRAPHY.md` that says there is **no** variable to put in the `.env`.
* `CUSTOMER_PANEL_AUDIT.md:274` says 11 checks in `settings.test.ts`; there are **16**.
* `CUSTOMER_PANEL_AUDIT.md:370` points at a directory `screenshots/panel` that does not exist.
* `CUSTOMER_PANEL_COMPLETION.md:22` says "two tables and two columns"; it was **three tables and one column**.
* `CUSTOMER_PANEL_COMPLETION.md:25` explains the missing typeface by an Adobe web project that no longer exists in the code.
* `API_CONTRACT.md:9` documents `{ email, password, name? }` for the registration; the code requires `firstName` and `lastName`.
* `HEADLESS_PANEL.md:38` and `PANEL_BRIDGE.md:78-81` give the length of a key as 48 characters; the arithmetic gives 53 and the example in the document is 51.
* `RUNBOOK.md:177-179` shows the retry with `Authorization: Bearer`; the route needs the staff session cookie.
* `RUNBOOK.md:164` says the customers can "pay" while the payments are off.
* `EMAIL.md:390-395` (see D9).
* `FRONTEND_REVIEW.md:31-32`, `:52-53`, `:146-147` (see D11).
* `panel-bridge/README.md` describes only the legacy layout of the panel.

**The exact correction:** in each case, replace the sentence with the measured one; the list above gives the number or the path that has to be written.

---

## 5. How many claims were checked

| | |
|---|---|
| Claims checked | **205** |
| **holds** | 114 |
| **wrong** | 53 |
| **outdated** | 19 |
| **unverifiable** | 19 |
| Documents covered | `docs/` 15 + `README.md` + `scripts/README.md` + `panel-bridge/README.md` |
| Claims in `PRODUCTION_READINESS.md` | 45 — **all** covered |
| Claims in `IMPLEMENTATION_STATUS.md` | 59 — **all** covered |

The 19 unverifiable claims are of one of two kinds: they are about **VM 100** (the panel) or **VM 101** (the node), which have no shell, or they need a **run** of a browser script that writes to the production database. The exact unblock step for each is in the table above and in `00-current-state.md` §4.
