# Blipmade Hosting: AI handoff

Written 2026-11-05 from the repository (`main` at the commit named below), the GitHub issues (#18 to #27) and the work of this session. Read this first, then `docs/AI-OPERATING-RULES.md`, `docs/KNOWN-ISSUES.md`, `docs/IMPLEMENTATION-ROADMAP.md`.

Status words used everywhere: **VERIFIED** (a test or a run that I saw pass), **UNVERIFIED** (code exists, nothing proves it), **PARTIAL**, **NOT STARTED**, **BLOCKED**. Code existing is never "finished".

Older notes (`docs/ai/*.md`, `docs/IMPLEMENTATION-18-23-STATUS.md`, `docs/IMPLEMENTATION_STATUS.md`, `docs/RECOVERY-HANDOFF.md`) are dated 2026-11-03/04 and name old production commits (`c9e0ae3`, `067f7fd`). They are history. Where they disagree with this file, this file wins. `docs/HANDOFF_NEXT_AI.md` was removed in favour of this set.

## 1. What Blipmade is

A hosting platform that sells game servers (Minecraft, CS2, Rust, FiveM, Valheim, Factorio and about 60 more eggs), Discord bots and apps (Node.js, Python, PHP, Git/ZIP deploy), databases/caches, VPS (Proxmox) and hosted mail (Mailcow). The customer buys through a guided **Deploy** flow, then manages the service in a customer app; staff use an Admin console. The product principle: hide raw infrastructure (eggs, nodes, ports) behind families, variants, presets and add-ons; never promise what a protocol or a client cannot do.

## 2. Architecture

| Layer | What | Where |
|---|---|---|
| Web | React + Vite + Tailwind, prerendered public site, customer app (`/app`), admin (`/admin`) | `web/src` (`app/`, `admin/`, `lib/`), tests: `web/e2e` (Playwright, stub based), `web/tests` and `npm test` (node --test) |
| API | Fastify + Prisma + PostgreSQL + Redis, Zod validation | `api/src/routes` (HTTP), `api/src/services` (logic), `api/prisma/schema.prisma`, tests `api/tests` (vitest, needs a database) |
| Worker | queues, reconcile timers, retries | `api/src/worker.ts` |
| Game panel | Pterodactyl (panel on the game node VM101, Wings) | `api/src/services/pterodactyl`, `api/src/services/panel` |
| VPS | Proxmox | `api/src/services/proxmox.ts`, `vps.ts`, `vps-plan.ts` |
| Mail | Mailcow (VM104) | `api/src/services/mailcow.ts`, `mail*.ts` |
| Payments | Stripe (Checkout, subscriptions, balance credit) | `api/src/services/stripe.ts`, `billing.ts`, `upgrades.ts`, `pricing.ts` |
| DNS/domains | Cloudflare (platform zone and customer-connected zone), Caddy gateway for HTTPS custom hostnames | `cloudflare-dns.ts`, `customer-cloudflare.ts`, `dns-approval.ts`, `domain-routing.ts`, `domain-activation.ts`, `gateway.ts`, routes `domains.ts` |
| Support | tickets, live chat, AI assist, Discord staff bridge | `api/src/services/support*`, `discord/` |
| Catalogue | families, variants, presets, add-ons, eggs manifest | `api/src/services/catalog-*.ts`, `readiness-gate.ts`, `repurpose-gate.ts`, `pterodactyl-eggs/manifest`, `docs/CATALOGUE.md` |

Infrastructure (names from the operator notes, not independently re-probed in this pass): Proxmox hypervisor; VM102 Caddy/edge; VM103 platform (API, worker, web, Postgres, Redis; also the CI/test bench and the GitHub relay); VM101 game node (Pterodactyl/Wings); VM104 Mailcow. Game ports are 30000-39999 behind DNAT on a shared public IPv4. Details of IPs and firewall scripts are in the operator memory, not in this repo.

### Workflow
- GitHub `main` is the production truth. The working copy is `/root/work`.
- Publish: `bash scripts/publish.sh` (relay through VM103). It refuses an uncommitted tree.
- Deploy: separate command on VM103 `cd /opt/blipmade && bash scripts/deploy.sh`. It refuses a dirty or non-fast-forward tree, refuses while servers are provisioning, takes a pg_dump to `/var/backups/blipmade/pre-deploy-<sha>-<time>.sql.gz`, tags `before-<sha>` images, builds, applies additive migrations, restarts, runs smoke checks and prints the rollback command. **Never chain publish and deploy. Deploy only when the owner says so in chat.**
- Tests: API tests need Postgres and Redis. They run on VM103 bench: `~/testbed/api` synced with rsync, `set -a; . ~/ci.env; set +a; npx vitest run <files>`. `ci.env` points backup/ops directories at `/var/tmp`; never run vitest without it (fake receipts once raised a false critical alert). Two vitest runs must never share a database at the same time. Node 22 is at `/opt/node22/bin` on the host; the bench has its own node.
- CI (`.github/workflows`): `tsc` for api (prod and test configs), web `tsc`, `vite build`, `scripts/validate-docs.mjs`, gitleaks.

## 3. Deployment state (the facts that matter)

- **Production runs `d5d9430f5`** (deployed 2026-11-05 about 14:13 UTC by `scripts/deploy.sh`). Evidence: the script's output (smoke checks `/api/health`, `/`, `/apps`, `/docs`, `/app`, font all 200), `blipmade-api-1` and `-web-1` healthy, worker just started (`health: starting` when last read), table `GameConnect` exists and is empty. VERIFIED at that moment only; I did not re-check later.
- `main` HEAD at the time of writing: this handoff commit on top of `d5d9430f5`. Nothing else is committed-but-undeployed except the documentation of this handoff.
- Rollback: images `blipmade-{api,web,worker}:before-d5d9430f5`, database dump `/var/backups/blipmade/pre-deploy-d5d9430f5-202611051413.sql.gz` on VM103. The rollback command is printed at the end of `deploy.sh`.
- Migrations applied by that deploy (all additive): `20261105090000_preset_plugins`, `20261105120000_game_connect` (adds `InstanceDomain.srvService` and table `GameConnect`). No pending migration.
- Feature flags in production: `GAME_CONNECT_ENABLED` is **not set, so Smart Connect is off**. `.env` was not touched. Whether `PAYMENTS_ENABLED` and live Stripe are on in production is **not verified by me**; the owner said Stripe may be live. Do not assume.
- The draft-preset seed script was **not run** in production.

### Commits of this session (newest first, all on main, all deployed as of `d5d9430f5`)
| Commit | What |
|---|---|
| d5d9430f | `ensureDraftPluginPresets` + `api/scripts/seed-draft-presets.ts` (dry-run default): 3 unpublished Minecraft plugin presets |
| 77927586 | old handoff note (superseded) |
| ba781a1a | order-time install skips a plugin with no build for the game version (records `orderInstall.skipped` + an instance event) |
| 33200f3d | Smart Connect (#24): registry, A+SRV sync/verify/cleanup, routes, worker reconcile, instance card, docs `SMART_CONNECT.md`, flag off |
| c9edb1a6 | Domains: proxied record is not "unchanged"; manager/viewer/stranger cannot write owner's DNS |
| 5001bc28 | Minecraft: import a world from ZIP after a backup |
| 3b5c39c8, 9f3f7eb9, 76dccba6 | resource change: quota shown first, quote frozen 15 min and refused when stale, no credit for an unpaid period, edge/concurrency tests |
| e1b7c7ff, 8d02a00f | Cloudflare connect route tests, stricter token, SRV records; Repurpose preview + confirm by name |
| fdb9219e, 37c3d727, 8244a8fc, b81d89e4 | Minecraft Geyser/Floodgate steps, lag check, world manager, plugin manager |
| 80bbeab6 | saved profile "Apply this size" opens the resource editor |
| ffca92c7, 7fcd7845, 7ef6bde4 | Deploy search lands on the asked thing; wizard version never sent as a product variable |
| 24197674 | presets carry plugins and sizing, applied server-side |
| 19ab93ca | one shared context menu |

## 4. Status by area

### Customer app and admin (3.0)
- Shared shell, editors (`PageEditorShell`), context menus, lists with cursor pages, quiet-mode tooltips, saved views, announcements: **IMPLEMENTED**; verified only by the e2e suite with stubs (29 related specs passed this session), not by a human walk-through of production.
- Admin: products/prices/add-ons editor, catalogue structure, staff lifecycle and roles, operator tools, ops health, status page, support consoles, email tools, CMS blocks: **IMPLEMENTED**, last broad browser audit was 2026-11-03 (`scripts/admin-audit.sh`). Not re-audited after this session's changes.

### Deploy checkout, catalogue (#20)
- VERIFIED by tests: families/variants/presets/add-on definitions in the DB; preset versions immutable once published; presets carry `plugins` (Modrinth slugs, max 15) and recommended RAM/CPU/disk; server adds plugins of the published version to the order for the chosen game version; search resolves "forge"/"survival"; readiness gate (`readiness-gate.ts`) on main; Minecraft wizard lists real versions (PaperMC fill v3, Forge promotions); the wizard version reaches the order as install version, never as a variable.
- Order-time installer `applyCatalogOrderInstall` (`catalog-install-apply.ts`): plugins only for `minecraft-paper`, modpack only for `minecraft-forge`. A plugin without a build is skipped (2 tests).
- Draft presets: `paper-starter` (luckperms, worldedit), `paper-protected` (+worldguard), `paper-skyblock` (bentobox, luckperms). Slugs were checked on Modrinth during this session. **Not published, not in production DB.** EssentialsX excluded: its latest build supports only up to 26.1.2.
- PARTIAL/NOT STARTED: curated published presets (Blank, Survival SMP, SkyBlock, Modpack are a product decision); Discord bot family with Node.js and Python variants and Blank/Git/ZIP presets (Discord starter presets moderation/welcome/tickets exist in `ensureStarterPresets`, install plan in `catalog-install.ts`; not proven on a live server); CS2/CS 1.6/FiveM/Rust/Terraria modes (starter presets exist for some; not proven live).
- UNVERIFIED: no preset install has been proven end to end on a real Pterodactyl server in this pass.

### Smart Deploy / import (#18)
IMPLEMENTED per `docs/IMPLEMENTATION-18-23-STATUS.md` (inspect, stored import, runtime build/start commands for Node, Next, Vite, FastAPI, Laravel, PostgreSQL/Redis confirmation, MariaDB credential handling). **UNVERIFIED end to end**: the daily81 import was never built on a disposable node. Go/Rust imports have no start command. Code: `import-*.ts`, `git-deploy.ts`, `web/src/app/ImportProject.tsx`. The issue is still labelled "future, research first"; do not extend it without the owner.

### Game-aware workspaces (#19)
- Minecraft Java (Paper/Folia/Forge) **IMPLEMENTED**: Plugin Manager, World Manager (backup, new world after backup with server stopped, ZIP import needing `level.dat`), lag check, Geyser/Floodgate steps, properties, players, Modrinth plugin/modpack install. Route `api/src/routes/minecraft.ts`, service `minecraft.ts`, UI `web/src/app/instance/MinecraftTab.tsx`. UNVERIFIED on a live server per access role (staging acceptance not done).
- Other games: Game tab writes egg variables or config files for Bedrock, Rust, FiveM, CS 1.6, CS2, Valheim; no plugin installer. UNVERIFIED live.
- NOT STARTED: capability-driven navigation simplification, Advanced mode, adapters for non-Minecraft games.

### Resize, proration, credit (#21)
- Code: `upgrades.ts`, `pricing.ts`, `billing.ts`, routes under `/instances/:id/resources/*` (`quote`, `status`, `PUT`), UI `web/src/app/instance/EditResources.tsx`. Rules implemented: 2 applied changes per rolling 30 days (slot reserved transactionally), upgrade charges only the unused part of the paid period with renewal anchor unchanged, downgrade becomes Stripe customer balance credit with an idempotency key and a local ledger row, no credit for a period that was not paid, disk reduction refused when files plus 64 MB do not fit, quote fingerprint frozen 15 min.
- **VERIFIED in Stripe TEST mode only** (isolated, bench DB, fake panel, real hosted Checkout with the test card, signed webhooks): monthly and yearly upgrade/downgrade, webhook replay idempotent (one panel call, one payment), credit written once, renewal invoice consumes the credit, a rejected panel call refunds automatically. Details are in the comments of issue #21.
- **NOT verified / BLOCKED**: VAT/Stripe Tax (not configured), finance and legal sign-off (owner), the on-page wording is a marked draft, no live-mode test (and must not be done without the owner). **#21 stays open and must not be activated in production by an AI.**

### Post-purchase (#22)
PARTIAL: Repurpose with preview (same rules as the switch: same family, same price card, minimum size, egg change), confirmation by naming the target, backup stream verification, restore/revert states; saved profiles store size only and open the resource editor. NOT STARTED: add-on center (discover/installed/updates), profile activation that reapplies an installation manifest, one-click add-ons outside Minecraft (each needs an install recipe), live panel restore proof. Must consume #20 records (see section 6).

### Domains 2.0 (#23, closed for MVP)
VERIFIED by 68 tests (fake Cloudflare): separate activation states (route, DNS ownership, certificate, app health); no `www` suggestion without a verified claim; proxied record handling; Cloudflare connection limited to one active zone with a scoped token, sealed storage, disconnect; preview then approved idempotent writes (A, AAAA, CNAME, TXT, SRV), conflicts left alone, nameservers never touched; manager/viewer/stranger cannot write DNS. NOT verified: certificate rotation, real game connectivity, any real customer zone. Follow-ups #25 (Cloudflare for SaaS, blocked on plan/billing and a staging account), #26 (registrar guides, optional mail DNS, not started), #27 (registrar/marketplace, only on demand).

### Smart Connect (#24, open)
IMPLEMENTED, flag off, deployed dark. See `docs/SMART_CONNECT.md` and section 7 of the roadmap. Registry in `api/src/services/game-connect.ts` (`GAME_PROFILES`): Minecraft Java on, Factorio on/experimental (`_factorio._udp`, desktop only), FiveM present but OFF. Routes `GET /instances/:id/connect`, `POST /instances/:id/connect/sync`; worker reconciles every 5 minutes; card `web/src/app/instance/Connect.tsx`. VERIFIED only with a fake Cloudflare and mocked panel: 14 API + 3 e2e tests. Never run with a real Cloudflare zone or a real game client.

### Billing, accounts, security (earlier rounds, not re-audited here)
Orders/subscriptions/invoices/credit pages, promotions with abuse controls, OAuth sign-ins, 2FA/passkeys, staff step-up, API keys, account export, audit log, rate limits: IMPLEMENTED in earlier rounds. Backups: nightly DB dump plus off-site agent (Storage Box) and restore drills (`docs/BACKUP-DISASTER-RECOVERY.md`); the age private key is not on the host so encrypted copies cannot be drilled by an AI; customer game backups are opt-in per customer. Monitoring: `docs/MONITORING.md`, `ops-health.ts`, Discord/webhook alerts. Support: tickets, chat widget, AI assist, SLA, inbound email, Discord staff bridge (`docs/support/*`, `docs/discord/*`).

## 5. Environment variable names (values never in this repo)
Core: `NODE_ENV PORT HOST DATABASE_URL REDIS_URL SESSION_SECRET DATA_ENCRYPTION_SECRET APP_ORIGIN APP_PUBLIC_URL PUBLIC_WEB_URL COOKIE_SECURE TRUSTED_PROXIES WORKER_URL LOG_LEVEL SENTRY_DSN`. Panel: `PTERODACTYL_URL PTERODACTYL_APP_KEY PANEL_KEYMINT_URL PANEL_KEYMINT_SECRET PANEL_NODE_ADDRESSES PTERODACTYL_DOWNLOAD_HOSTS`. Payments: `STRIPE_SECRET_KEY STRIPE_PUBLISHABLE_KEY STRIPE_WEBHOOK_SECRET STRIPE_TAX_ENABLED PAYMENTS_ENABLED`. Game/DNS: `GAME_PUBLIC_HOST GAME_CONNECT_ENABLED GAME_JOIN_DOMAIN GAME_PUBLIC_ADDRESS DOMAIN_BASE CLOUDFLARE_API_TOKEN CLOUDFLARE_ZONE_ID CLOUDFLARE_ZONE_NAME CADDY_ADMIN_URL CADDY_ADMIN_TOKEN CADDY_APP_SERVER`. VPS: `VPS_PROXMOX_URL VPS_PROXMOX_TOKEN VPS_PROXMOX_FINGERPRINT ... VPS_*`. Mail: `MAILCOW_API_URL MAILCOW_API_KEY MAILCOW_API_CERT_SHA256 MAIL_*`, `SMTP_URL`. Auth: `OAUTH_*`, `GITHUB_APP_*`, `TURNSTILE_*`. Discord: `DISCORD_BOT_TOKEN DISCORD_GUILD_ID DISCORD_APPLICATION_ID DISCORD_PUBLIC_KEY`. Ops: `OPS_*`, `BACKUP_DIR`, `ATTACHMENT_DIR`, `BACKUP_REPORT_TOKEN`, `SUPPORT_INBOUND_TOKEN`, `INTERNAL_API_TOKEN`, `ADMIN_ENROLLMENT_KEY`, `STAFF_SECURITY_OFF`, `METRICS_ENABLED`. The full list is `api/src/env.ts`. Production's `/opt/blipmade/.env` is root-owned; append with `sudo tee -a`. Settings editable in the admin are registered in `api/src/services/setting-registry.ts`; an unregistered key cannot be written.

## 6. How #19 to #24 fit together (do not duplicate)
- **#20 owns the catalogue**: `CatalogFamily` > `CatalogVariant` (one validated Product/egg) > `CatalogPreset` + immutable `CatalogPresetVersion` (plugins, sizes) > `CatalogAddonDefinition` (versioned, compatibility). Admin routes `admin-catalog-structure.ts`; projection `catalog-projection.ts`; seeds/drafts `catalog-drafts.ts`.
- **#22 consumes the same IDs** after purchase (Repurpose, profiles, add-on center). It must not create a second template or add-on registry. `repurpose-gate.ts` and `readiness-gate.ts` are the shared judges.
- **#19** is the instance workspace that shows what #20/#22 installed; Minecraft is done, other games per capability.
- **#21** is a different operation from Repurpose: it changes size and price on the same service; both go through quote and fulfilment (`upgrades.ts`).
- **#23** is the DNS/HTTPS engine; **#24** reuses it for game hostnames (same Cloudflare service, same `InstanceDomain` table with `srvService`) and adds `GameConnect` for platform-owned `label.play.<domain>` names. Custom domains for games go through #23, never a second path.
- **#18** is the import path into the same checkout (`import` query, stored source, order handoff).
- **#25 to #27** are deferred roadmap items, listed in `docs/IMPLEMENTATION-ROADMAP.md` (P5).

## 7. Things I could not verify
- Production state after 14:15 UTC on 2026-11-05 (worker health after start, error logs beyond 3 minutes). Production was not deployed in the CI-fix pass, so the last deploy evidence is still `d5d9430f5`.
- Whether production Stripe is live and `PAYMENTS_ENABLED` is on.
- Any claim about a real game client, a real Cloudflare zone, or a real panel install.
- The credentials disclosed in chat (see `KNOWN-ISSUES.md`, K-01).

## 8. CI fix, 2026-11-05 evening

GitHub `main` is `f26ba9c1`. Actions run [42067609717](https://github.com/trencito42/blipmade-hosting/actions/runs/42067609717) is success on every job. That commit contains `39e5c01c` (Git and ZIP presets return no file plan, so `applyCatalogInstall` does not restart the server) and the test fixes in `KNOWN-ISSUES.md`. An earlier push of `39e5c01c` was rejected by GitHub with `fatal error in commit_refs`; a later fast-forward of the same history succeeded. Main was not force-pushed.

Do not deploy until the owner asks. Draft catalog products stay unpublished. The next catalogue work is issue #20: a Discord Bot Blank preset must start from the written plan, and Git/ZIP must go through the import path rather than the file installer. Live panel proof is still missing.
