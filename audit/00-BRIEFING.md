# Phase Zero — the facts every investigation starts from

**Baseline commit:** `7df3973` on `main` of `trencito42/blipmade-hosting`.
**Audit date:** 2026-10-23. **Audit is READ-ONLY** except for writing files under `audit/`.

Every finding in this audit must carry one of these verification classes:

| Class | Meaning |
|---|---|
| `VERIFIED` | executed and observed on the running system |
| `CODE-INSPECTED` | read in the source; behaviour not executed |
| `DOCUMENTED-ONLY` | stated in a document, not confirmed in code or runtime |
| `INFERRED` | reasoned from other evidence; the reasoning is given |
| `UNVERIFIED` | plausible but not checked |
| `BLOCKED` | could not be checked; the exact blocker and the safe unblock step are given |
| `NOT-IMPLEMENTED` | the feature does not exist in the code |

---

## 1. Where things are

| What | Where |
|---|---|
| Mirror (source of truth) | `/root/blipmade-work` on the agent host — **no git here** |
| Git repository | `/opt/blipmade` on **VM 103** (`debian@10.77.0.13`, key `/root/.ssh/blipmade_vm103`) |
| Sync mirror → server | `cd /root/blipmade-work && /root/sync.sh` (copies + prunes; does not build) |
| Hypervisor | `n7030e1` — the agent host itself. Proxmox VE 9.2.21, `pvesh`, `qm`, `pvesm` available |
| VM 100 `debian13-test` | `10.77.0.10` — the Pterodactyl **panel**. Guest agent configured but **not running**. No SSH key available to the agent |
| VM 101 `games-node-01` | `10.77.0.11` — the Pterodactyl **Wings** node. Guest agent configured but **not running**. No SSH key available to the agent |
| VM 102 `blipmade-proxy` | `10.77.0.12` — Caddy / gateway. SSH as `debian` with `/root/.ssh/id_rsa` **works** |
| VM 103 `blipmade-platform` | `10.77.0.13` — the Blipmade platform. SSH as `debian` with `/root/.ssh/blipmade_vm103` **works** |

**Access asymmetry — this bounds the audit.** VM 103 and VM 102 are inspectable directly. VM 100 (panel) and VM 101 (Wings node) are **not** reachable by the agent: no SSH key, and the QEMU guest agent is not running in either. Statements about them are `CODE-INSPECTED` (via the `panel-bridge` and `api` sources) or `DOCUMENTED-ONLY` unless another route proves otherwise.

**Browser tooling** exists only on VM 103:
`PLAYWRIGHT_PATH=/opt/blipmade/tools/browser/node_modules/playwright-core/index.js`, Chromium at `/usr/bin/chromium`, run with `xvfb-run -a`. There is **no WebKit/Safari** anywhere in the environment.

---

## 2. The hardware (verified on the hypervisor)

```text
CPU        2 x Intel Xeon E5-2698 v4 @ 2.20 GHz (Broadwell, 2016)
           20 cores/socket, 2 threads/core -> 80 logical CPUs (40 physical cores)
           1.8 GHz base, 3.6 GHz turbo, VT-x
RAM        251 GiB total (23 GiB used, 228 GiB available at audit time)
DISKS      2 x Samsung MZ7L3960HCJR-00A07, 894.3 GB each, enterprise SSD (ROTA=0)
RAID       md0  raid0 sdb2+sda2   2.0 GB   -> /boot
           md1  raid0 sdb3+sda3   1.84 TB  -> /          (root filesystem, 42 GiB used of 1.7 TiB)
           md2  raid1 sda4+sdb4   32.1 GB  -> (not separately mounted at audit time)
STORAGE    Proxmox "local" dir storage, /var/lib/vz, qcow2, 1.8 TiB total, 2.41% used
```

**The root filesystem is a RAID 0 across both SSDs. There is no redundancy on the array that holds every VM disk and every database file.** This is a launch-gate item, not a footnote.

## 3. The virtual machines (verified via `qm config`)

| VM | Name | vCPU | RAM | Disk | Guest agent | onboot |
|---|---|---|---|---|---|---|
| 100 | `debian13-test` | 2 | 4 GiB | 40 GB | enabled, **not running** | no |
| 101 | `games-node-01` | **20** | **128 GiB** | 900 GB | enabled, **not running** | yes |
| 102 | `blipmade-proxy` | 2 | 2 GiB | 20 GB | not enabled | yes |
| 103 | `blipmade-platform` | 4 | 8 GiB | 80 GB | enabled, running | yes |

All four are on `vmbr1` = `10.77.0.1/24`. Total RAM committed to guests = 142 GiB of 251 GiB. Total vCPU committed = 28 of 80 logical.

## 4. The public addresses (verified)

```text
193.34.214.20/24   eth0 on the hypervisor   -> n7030e1.mevnode.com  (the server itself)
193.34.214.86/32   eth0 alias               -> nothing answering
193.34.214.87/32   eth0 alias               -> nothing answering
193.34.214.143/32  eth0 alias               -> nothing answering
blipmade.com       -> 2a06:98c1:3120::3     -> Cloudflare (anycast)
```

Port probes from the hypervisor and from VM 103 against all four public addresses: **only 22/tcp is open**. `443` is closed on the origin — the site is served through Cloudflare, and the origin TLS terminator (Caddy on VM 102) is reached through the private path. Game ports (25565 etc.) are **not open on any of the four addresses**.

`pveproxy` listens on `*:8006` and the Proxmox firewall ruleset is empty (`digest da39a3e…` = empty config). Port 8006 **answered from VM 103 against the public address**. Whether the provider's edge firewall blocks it from the internet is not determinable from inside; record it as a finding with that exact limit.

## 5. The software (verified by reading the running system)

```text
VM 103 containers: blipmade-api-1, blipmade-worker-1, blipmade-web-1, postgres, redis   (all healthy)
VM 102:            Caddy (gateway / TLS terminator / reverse proxy)
VM 101:            Pterodactyl Wings (the node that runs the containers of the customers)
VM 100:            Pterodactyl panel (the admin UI of Pterodactyl itself)
```

The Blipmade application is a **separate product** that talks to the Pterodactyl panel through a **bridge** (`panel-bridge/` in the repository and `api/src/lib/panel*`). The Blipmade API proxies to the panel on VM 100 over `http://10.77.0.10:8080` (see `PANEL_NODE_ADDRESSES=node1.blipmade.com:8080=10.77.0.11:8080`).

### Health at audit time

```text
GET https://blipmade.com/api/health
{"status":"ok","service":"blipmade-api","version":"1.0.0","database":true,"redis":true,
 "mail":"file","mailDelivery":{"transport":"file","configured":false,
   "counts":{"queued":0,"delivered":0,"writtenToFile":6,"failed":0}},
 "stripe":"not_configured","pterodactyl":"configured","panelKeyBridge":"configured"}

GET https://blipmade.com/healthz
{"status":"ok","fonts":{"family":"Proxima Nova","installed":false,
  "missing":["/fonts/proxima-nova-400.woff2","/fonts/proxima-nova-600.woff2","/fonts/proxima-nova-700.woff2"],
  "fallback":"Geist Variable"}}
```

**Three commercial capabilities are configured OFF at audit time and were not touched by any earlier work:**

1. `STRIPE_SECRET_KEY` empty, `PAYMENTS_ENABLED=false` → checkout answers `503 payments_unavailable` with `{"error":{"code":"payments_unavailable"}}`.
2. `SMTP_URL` empty → mail transport is `file`; messages are written to disk, `delivered:false`.
3. `ADOBE_FONTS_KIT_URL` removed; the typeface is served from `/fonts/` and the files are absent.

## 6. The data model

31 Prisma models: `User, MailDelivery, EmailChangeRequest, NotificationPreference, PanelCredential, Session, VerificationToken, StaffMember, Product, ProductPrice, ProductOption, Node, Egg, Order, OrderItem, Subscription, Invoice, Payment, Promotion, PromotionRedemption, Instance, InstanceEvent, InstanceDomain, Ticket, TicketMessage, TicketEvent, AuditLog, WebhookEvent, Setting, ProvisioningJob, Attachment`.

Data volume at audit time: **6 users, 3 instances, 5 orders, 11 tickets, 251 sessions, 0 subscriptions, 0 invoices, 0 payments, 5 products.** Two of the users are purpose-built browser test accounts created by `scripts/ops/seed-browser-account.mjs` (`browser-customer@blipmade.test`, `browser-admin@blipmade.test`); the script has a `BM_CLEANUP=1` flag.

## 7. The API surface

13 route files (`admin, auth, billing, catalog, domains, health, instance-server, instances, orders, settings, tickets, webhooks` + internal). ~95 HTTP endpoints. Ownership checks are per-instance (`instances.ts`), staff-only under `/admin/*`, and `/internal/*` is the panel bridge surface.

**Danger surface to inspect first:** `DELETE /instances/:id/file` and `DELETE /instances/:id/*` reach Pterodactyl; `DELETE /instances/:id/file` in particular destroys a server in Pterodactyl semantics. The panel bridge signs requests to the panel.

## 8. The web application

69 source files under `web/src`. React + Vite + Tailwind v4. The web server is a small Node HTTP server (`web/server.mjs`) that serves `dist/`, proxies `/api/*` to the API container on the same origin (so the session cookie stays first-party), and now also serves `/fonts/*`.

Design system: near-black `#090a09`, green accent `#6be598`, flat surfaces, rounded containers, WCAG 2.2 AA target.

Typography: proxima nova is requested from `/fonts/` and is **not installed**; Geist Variable and Geist Mono Variable are bundled and in use.

---

## 9. Hard rules for this audit

1. **Do not change the production system.** No writes to the database, no deployments, no `git push`, no DNS, no firewall changes, no Pterodactyl panel changes, no orders, no charges, no deletions of customer data. Read-only inspection only.
2. **Do not write outside `audit/`** unless the assignment says otherwise.
3. **Never put a secret in a report.** No keys, tokens, passwords, connection strings with credentials, or customer-private data. If a secret is found, report its *location and kind* and redact the value.
4. **Every claim needs evidence**: a file path and line, a command and its output, or a documented source. Say which class it is.
5. **Do not invent** numbers, uptime, customer counts, competitor prices, search volumes or legal conclusions. Where a number is needed and cannot be sourced, give the formula, the assumption and the label `INFERRED`, or mark the item `BLOCKED`.
6. **Never claim an investigation happened that did not happen.** If you could not reach something, say so and give the exact safe step that would unblock it.
7. Reports are written in **Romanian** for narrative and executive summaries; identifiers, file paths, commands, code and technical specifications stay in English.
8. If you write a CSV, it must have a header row and one row per record, with the units in the column names.

## 10. The commands that work

```bash
# the mirror is the source of truth; the server holds the git history
cd /root/blipmade-work && /root/sync.sh

# the application
ssh -i /root/.ssh/blipmade_vm103 debian@10.77.0.13 'cd /opt/blipmade && git log --oneline -5 && git status --porcelain'
ssh -i /root/.ssh/blipmade_vm103 debian@10.77.0.13 'cd /opt/blipmade && docker compose -f compose.yml -f compose.api.yml -f compose.web.yml ps'
ssh -i /root/.ssh/blipmade_vm103 debian@10.77.0.13 'curl -s https://blipmade.com/api/health'

# the gateway
ssh -i /root/.ssh/id_rsa debian@10.77.0.12 'hostname; sudo -n true 2>/dev/null && echo "sudo ok" || echo "no sudo"'

# the hypervisor
qm config 101 ; pvesm status ; cat /proc/mdstat ; pvesh get /cluster/resources --type vm --output-format json

# the database, read only
ssh -i /root/.ssh/blipmade_vm103 debian@10.77.0.13 'cd /opt/blipmade && docker compose -f compose.yml exec -T postgres psql -U blipmade -d blipmade -c "SELECT count(*) FROM \"User\";"'

# the tests
ssh -i /root/.ssh/blipmade_vm103 debian@10.77.0.13 'cd /opt/blipmade && bash scripts/run-tests.sh'

# the browser, on VM 103 only
ssh -i /root/.ssh/blipmade_vm103 debian@10.77.0.13 'cd /opt/blipmade && export BM_BASE=https://blipmade.com BM_EMAIL=qa.headless.one@example.test BM_PASSWORD="<parola contului de test — vezi secret-store-ul operatorului>" && xvfb-run -a node scripts/ops/browser-mobile-real.mjs'
```

> **Nota despre credential:** parola de mai sus nu e reprodusă în corpus. Este parola unui **cont de test generat de seed** (`scripts/ops/seed-browser-account.mjs`), pe un **domeniu rezervat** (`example.test`), fără date personale reale. **Credentialul trebuie rotit înainte ca acest corpus să părăsească echipa de audit** — rotirea nu a fost făcută în cadrul acestui audit (regulă: auditul e READ-ONLY).

**The login endpoint allows 10 attempts per 15 minutes per address.** A verification run that signs in repeatedly will hit that limit and look like a broken page. Sign in once and reuse the session (the scripts under `scripts/ops/` do this).

## 11. Where the truth about the product already lives

Read these before concluding anything; several of them are wrong and the point of this audit is to say so.

| Document | Claim to check |
|---|---|
| `docs/PRODUCTION_READINESS.md` | the launch verdict and every gate |
| `docs/IMPLEMENTATION_STATUS.md` | what is claimed to work |
| `docs/AUDIT_REMEDIATION.md` | what was fixed and what was left |
| `docs/RUNBOOK.md` | the operational procedures |
| `docs/HEADLESS_PANEL.md`, `docs/PANEL_BRIDGE.md` | how the platform talks to Pterodactyl |
| `docs/API_CONTRACT.md`, `docs/FRONTEND_CONTRACT.md` | the contracts between the parts |
| `docs/CUSTOMER_PANEL_AUDIT.md`, `docs/CUSTOMER_PANEL_COMPLETION.md` | the customer panel audit and its completion |
| `docs/MOBILE_AND_TYPOGRAPHY_FIX.md` | the most recent round (mobile clipping + typeface) |
| `README.md` | the environment variables and the run instructions |

---

## 12. The commercial baseline (verified, read-only, 2026-10-23)

This is the single most important set of facts in the briefing. Everything commercial — pricing, unit economics, launch order, marketing — is built on it.

### 12.1 The panel is stocked; the storefront is not

The Pterodactyl panel (VM 100) holds **one node** and **16 eggs** across 5 nests:

```text
node #1 "games-node-01"  scheme=https  host=node1.blipmade.com:8080
    memory=122880 MB (120 GiB)   disk=819200 MB (800 GiB)   allocations=173

nest "Minecraft"      #1   eggs 5   Vanilla, Bungeecord, Forge, Sponge, Paper
                              (ghcr.io/pterodactyl/yolks:java_25)
nest "Source Engine"  #2   eggs 6   Custom Source, CS:GO, Ark, TF2, Insurgency, Garry's Mod
nest "Voice Servers"  #3   eggs 2   Mumble, Teamspeak3
nest "Rust"           #4   eggs 1   Rust
nest "Discord Bots"   #5   eggs 2   node.js generic (#15), python generic (#16)
```

### 12.2 The Blipmade database knows none of it

```text
"Node" table: 0 rows
"Egg"  table: 0 rows
```

`POST /admin/infrastructure/sync` exists and has **never been run**. The platform's own tables for nodes and eggs are empty while the panel holds a node with 173 free allocations and 16 ready eggs.

### 12.3 What the storefront actually sells

```text
slug            eggId  deployable  baseAmount  ramPerGb  cpuPerUnit  diskPerGb
code-server     -      f           299         60        40          2
discord-bot     15     t           149         60        40          2
postgresql     -      f           449         60        40          2
uptime-kuma    -      f           149         60        40          2
wordpress      -      f           149         60        40          2
```

`baseAmount` is in **cents** and the period is `MONTHLY`. The surcharges are per GB of RAM, per CPU unit and per GB of disk.

**One of five products is deployable.** The other four carry the catalogue copy "its image is not installed on the platform yet, so it is listed but cannot be deployed" and have no egg and no docker image.

The price engine applies the surcharges **over the minimum of the product, not over zero**:

```text
price = baseAmount + ((ram - minRam)/1024) * ramPerGb + (cpu - minCpu) * cpuPerUnit + (disk - minDisk) * diskPerGb
```

so, with `baseAmount = 149` cents and the minimums `256 / 1 / 1`:

| Configuration | Price | Note |
|---|---|---|
| 256 MB, 1 vCPU, 1 GB (the product minimum) | **149 cents = €1.49/month** | the "Starting price" shown in the catalogue |
| 512 MB, 1 vCPU, 5 GB (the default configuration) | **172 cents = €1.72/month** | `149 + 15 + 0 + 8` — the price of the three live instances |
| 4 GB, 2 vCPU, 20 GB | **452 cents = €4.52/month** | `149 + 225 + 40 + 38`; **not selectable in the wizard** — the disk step goes from 3 to 19 GB, giving €4.50 (19 GB) and €4.56 (22 GB) |

All 255 configurations the deploy wizard offers were quoted live and **all 255 matched the engine formula exactly**. There is no mismatch between the catalogue, the wizard, the server-side quote and the admin screens. The pricing inconsistencies that exist are outside that matrix and are documented in `audit/05-pricing-consistency.md`.

### 12.4 The gap, stated plainly

The hardware, the panel and the node are a **game-hosting** installation: a node called `games-node-01`, 120 GiB of RAM, 800 GiB of disk, 173 allocations, and Minecraft, CS:GO, Rust, Mumble and TeamSpeak eggs ready to install.

The storefront sells **one Node.js Discord bot at about two euros a month**, plus four products that cannot be deployed. It does not offer a single game.

That inversion is the central commercial fact of this audit. Every question about pricing, unit economics, launch order and marketing has to be answered against it, not against the marketing copy.

### 12.5 How these facts were obtained (read-only, repeatable)

```bash
# the panel inventory, through the platform's own client, so the credential is never printed
# (script: read the imports from api/src/services/pterodactyl/application.ts:
#  listNodes, listNests, listEggs, listAllocations)
ssh -i /root/.ssh/blipmade_vm103 debian@10.77.0.13 'docker exec blipmade-api-1 node /app/<script>.mjs'

# the catalogue of the platform
ssh -i /root/.ssh/blipmade_vm103 debian@10.77.0.13 'cd /opt/blipmade && docker compose -f compose.yml exec -T postgres psql -U blipmade -d blipmade -c "SELECT ... FROM \"Product\" p LEFT JOIN \"ProductPrice\" pp ON pp.\"productId\"=p.id;"'
```

`POST /admin/infrastructure/sync` would populate the empty tables, but it **changes state** and was therefore not run during this audit. If a later phase needs the sync, it is a deliberate, operator-approved change, not an audit step.

