# 02 — Architecture and topology

**Evidence time:** 2026-11-06T05:58Z–06:06Z  
**Confidence:** High for hypervisor and VMs; Medium for Cloudflare/DNS internals.

## Live topology (verified)

Single dedicated host, RAID 0 across two ~894 GB disks, one Proxmox node `n7030e1`.

```
Internet
  |
  |  193.34.214.20  host SSH, mail DNAT, extra /32s on eth0
  |  .86 panel  .87 games  .143 edge  .119 VPS SNAT  .120/.160 reserved
  v
[ n7030e1  Proxmox 9.2  80 vCPU  251 GiB RAM  1.7T RAID0 / ]
  |
  +-- vmbr1 10.77.0.1/24  (platform, MASQUERADE out eth0)
  |     VM100 10.77.0.10  panel nginx/php/mariadb/redis   (hostname debian13-test)
  |     VM101 10.77.0.11  Wings + game Docker             (131 GB RAM, 900 GB disk)
  |     VM102 10.77.0.12  Caddy 2.11.2
  |     VM103 10.77.0.13  API/web/worker/postgres/redis + CI postgres/redis
  |     VM104 10.77.0.14  Mailcow
  |     VM105 10.77.0.15  GlitchTip
  |
  +-- vmbr2 10.78.0.1/24  (created by systemd blipmade-network.service, not /etc/network/interfaces)
        VM1001 10.78.0.101  test VPS
        VM1002 10.78.0.102  urbanauto VPS
        templates 9000-9002 stopped
```

Game ports `30000-39999` TCP/UDP DNAT from `.87` to `10.77.0.11`.  
VPS SSH DNAT `.119:22101` → `10.78.0.101:22`, `:22102` → `.102:22`.  
Mail 25/465/587/993/4190/80/443 on `.20` → VM104.

## Application graph

```
Browser
  -> Caddy VM102 :443 (blipmade.com)
  -> web container 10.77.0.13:3000  (compose.web.yml binds LAN, not loopback)
  -> API 127.0.0.1:3100 on VM103
  -> PostgreSQL 17 + Redis 7 (loopback)
  -> worker (BullMQ, health on container :3101 only)
       -> Pterodactyl application API (panel VM100, extra_hosts panel.blipmade.com=10.77.0.10)
       -> Panel keymint bridge (PTERODACTYL_CLIENT_KEY empty; bridge reported configured)
       -> Stripe (live)
       -> Cloudflare DNS services (code)
       -> Proxmox API (VPS)
       -> Mailcow API (mail)
```

Worker health is not published on the VM host; Docker healthcheck hits `127.0.0.1:3101` inside the container. Host `curl :3101` failing is expected, not an outage.

## Code surface (inspected tree)

- Web: React customer app `web/src/app/*`, admin `web/src/admin/*`, public site under `web/src`.
- API: Fastify `api/src/app.ts` registers 50+ route modules (auth, catalog, orders, billing, instances, domains, mail, vps, tickets, support, admin*, webhooks, oauth, github, discord, health).
- Worker: `api/src/worker.ts`.
- Schema: 70+ Prisma models including dual catalogue (`Product` + `CatalogFamily/Variant/Preset*`), billing (`Order`, `Subscription`, `Invoice`, `Payment`, `MoneyAdjustment`), VPS, mail, GameConnect, ImportSource.
- Eggs: `pterodactyl-eggs/`.
- Panel bridge: `panel-bridge/`.
- CI: `.github/workflows/ci.yml`, `nightly-backup-drill.yml`.

## Duplicated or parallel concepts (code exists; behaviour not all proven)

| Concern | Implementations |
|---|---|
| Catalogue | Legacy `Product`/`ProductPrice`/`ProductOption` and #20 `CatalogFamily`/`CatalogVariant`/`CatalogPreset(Version)`/`CatalogAddon*` |
| Deploy UX | `Deploy.tsx`, `DeployCatalog.tsx`, `FamilyDeploy.tsx`, `deploy/DeployStudio.tsx` (dirty local edits) plus `/app/vps/new`, `/app/email/checkout`, `/app/import` |
| Pricing | `pricing.ts`, `order-amounts.ts`, `upgrades.ts`, `billing.ts`, Stripe |
| Credentials | `PTERODACTYL_CLIENT_KEY` (empty) vs keymint `panel/credentials.ts` |
| DNS | `cloudflare-dns.ts`, `customer-cloudflare.ts`, `game-connect.ts` (flag off) |
| Encryption | v1 `SESSION_SECRET` box vs v2 `DATA_ENCRYPTION_SECRET` (unset in prod) |

Necessary provider splits (Pterodactyl vs Proxmox vs Mailcow) are real. The dual catalogue plus three deploy UIs is accidental complexity until proven otherwise in `06-DEPLOY-AND-CATALOG.md`.

## Docs vs machines

| Doc | Machine |
|---|---|
| README “four machines”, panel on VM100 | Six infra VMs + two customer VPS. Panel is VM100 but hostname is `debian13-test`. AI-HANDOFF said panel on VM101 — wrong. |
| compose comments “4.3 GB RAM” | VM103 `memory: 8192` |
| Handoff production SHA | Live `8b07cd2d`, not `761d23b8` |
| PRODUCTION_READINESS “Stripe keys missing”, “mail to file” | Health: stripe live, mail smtp |

## Versions (safe)

- Host: Proxmox VE 9.2.0, pve-manager 9.2.24, kernel 7.0.14-25-pve (7.0.14-26 installed, not booted)
- VM OS: Debian 13 (trixie), kernel 6.12.113+deb13-cloud-amd64 (platform VMs)
- Wings 1.13.4
- Caddy 2.11.2
- PHP 8.3.36 on panel
- postgres:17-alpine, redis:7-alpine
- GlitchTip 6, postgres 18 on VM105
- Node 22 expected by `engines` (container images not hashed this pass)
