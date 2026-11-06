# 00 — Scope and baseline

**Audit:** Operation Black Mirror  
**Auditor session start:** 2026-11-06T05:58:43Z  
**This file written:** 2026-11-06T06:08:00Z (approx.)  
**Freeze:** 2026-11-06T08:40Z — `01-EXECUTIVE-SUMMARY.md` is FINAL for this audit pass (NO-GO). Production SHA unchanged `8b07cd2d`.  
**Mode:** read-only except these report files. No deploys, no mutations, no secret values.

## Repository and commits

| Item | Value | Status |
|---|---|---|
| Working copy | `/root/work` | VERIFIED |
| Remote | `github.com/trencito42/blipmade-hosting.git` | VERIFIED |
| Inspected working tree | `952b749231f4e1dcb2bfddac22271fe94e891b3a` (`feat/deploy-studio-3`, also `refs/remotes/github/main` at session start) | VERIFIED |
| Working tree dirt | Uncommitted edits in `web/src/app/deploy/DeployStudio.tsx`, `ProductWizardShell.tsx`, `OrderReviewStep.tsx` | VERIFIED |
| Production `/opt/blipmade` | `8b07cd2d3fa75f5a713c02b9f51b926ba94b4b02` 2026-11-06 05:59:29 +0000 `fix(deploy): hide operating system on email hosting and improve summary sidebar sizing` | VERIFIED 06:04Z |
| Production dirty files | 0 | VERIFIED |

Handoff `docs/AI-HANDOFF.md` still names older production SHAs (`d5d9430f5`, later `761d23b8`). Treat that file as history for product intent, not live topology.

## Production health (VM103, 2026-11-06 ~06:03Z)

`GET http://127.0.0.1:3100/health` and public `https://blipmade.com/api/health` both 200:

- `status=ok`, `database=true`, `redis=true`
- `mail=smtp` (configured)
- **`stripe=live`**
- `pterodactyl=configured`, `panelKeyBridge=configured`

`.env` metadata only (values not copied):

| Key | State |
|---|---|
| mode | `0640`, owner root |
| `NODE_ENV` | `production` |
| `PAYMENTS_ENABLED` | `true` |
| `GAME_CONNECT_ENABLED` | UNSET |
| `STRIPE_TAX_ENABLED` | UNSET |
| `COOKIE_SECURE` | UNSET (code defaults Secure in production) |
| `STAFF_SECURITY_OFF` | UNSET |
| `STRIPE_SECRET_KEY` | SET |
| `STRIPE_WEBHOOK_SECRET` | SET |
| `PTERODACTYL_APP_KEY` | SET |
| `PTERODACTYL_CLIENT_KEY` | EMPTY |
| `DATA_ENCRYPTION_SECRET` | UNSET |
| `SESSION_SECRET` | SET |

API/web/worker were restarted during this audit (deploy of `8b07cd2d` ~05:59Z). Do not treat a 5-minute uptime as a stability proof.

## Infrastructure nodes inspected

Audit host **is** the hypervisor.

| Node | Identity | Access | Status |
|---|---|---|---|
| Hypervisor | `n7030e1`, Proxmox VE 9.2.0 / manager 9.2.24, kernel `7.0.14-25-pve` | local root | Inspected |
| VM 100 | hostname `debian13-test`, 10.77.0.10, Pterodactyl panel (nginx 80/443, PHP 8.3, MariaDB) | SSH `vm100` | Inspected |
| VM 101 | `games-node-01`, 10.77.0.11, Wings `v1.13.4`, Docker eggs | SSH `vm101` | Inspected |
| VM 102 | `blipmade-proxy`, Caddy 2.11.2, :80/:443/:2020, admin :2019 localhost | SSH `vm102` | Inspected |
| VM 103 | `blipmade-platform`, Debian 13, compose stack | SSH `vm103` | Inspected |
| VM 104 | `mail.blipmade.com`, Mailcow on disk, docker.sock denied for this SSH user | SSH `vm104` | Partial |
| VM 105 | `blipmade-observability`, GlitchTip 6 + postgres 18 + valkey 9, :8000 on 10.77.0.15 | SSH `vm105` | Inspected |
| VM 1001 | `vps-1-test-vps`, vmbr2, 1G/1c/20G, no `onboot` | qm config only | Partial |
| VM 1002 | `vps-2-urbanauto`, vmbr2, 2G/2c/30G, no `onboot` | qm config only | Partial |
| 9000–9002 | OS templates, stopped | qm config | Partial |

**Not independently verified this pass:** Cloudflare zone contents, Stripe Dashboard, real game client joins, Mailcow mailbox isolation, off-site Storage Box listing, GitHub Actions job logs (`gh` missing on hypervisor).

## Tools and limits

- Read-only shell, `qm`, `iptables -S`, SSH to VMs, `curl` to public HTTPS and loopback.
- Did not open `.env` values, key files, DB dumps, customer rows, or session cookies.
- Did not run vitest, Playwright, load tests, or any write against Stripe/panel/Proxmox.
- GitHub CLI not installed. CI status is UNVERIFIED this session (docs claim green on `f26ba9c1`).
- Public extra IPs (.86/.87/.143) do not DNAT locally originated traffic from the hypervisor (`PREROUTING` only). Internet reachability of Wings :8080 and panel :443 is UNVERIFIED from this host.

## Methodology

1. Inventory code + live topology.  
2. Trace money, auth, provision, backup.  
3. Challenge docs vs machines.  
4. Verify with read-only commands.  
5. Write findings with evidence.  
6. Disprove P0/P1 before freeze.

Prior audits under `audit/` and `docs/PRODUCTION_READINESS.md` (2026-10-23/25) are historical. Several of their “ready” claims are already contradicted by live evidence (live Stripe, empty client key, RAID 0). `/var/lib/vz/dump` empty is not “no backups”: VPS weekly off-site exists; infra VM qcow2 still do not.

## Documents reviewed

Read in this session: `AGENTS.md`, `docs/AI-HANDOFF.md`, `docs/AI-OPERATING-RULES.md`, `docs/KNOWN-ISSUES.md`, `docs/IMPLEMENTATION-ROADMAP.md`, `README.md` (partial), `docs/BACKUP-DISASTER-RECOVERY.md` (partial), `docs/PRODUCTION_READINESS.md` (partial). Skimmed Prisma model list, compose files, `api/src/app.ts`, health/auth/csrf/secrets, webhook header, import zip parser, CI workflow header.

Not yet read in full: GitHub issues #18–#28, full Prisma schema, all admin pages in a browser, egg probes, Stripe test evidence beyond code.

## Existing claims that must be revalidated (not trusted)

| ID | Claim | This session |
|---|---|---|
| K-02 | Stripe live unknown | **Overturned:** health `stripe=live`, `PAYMENTS_ENABLED=true` |
| K-13 | Egg startup markers fixed on panel 15/83/84 | Repo `pterodactyl-eggs/nodejs.json` and `python.json` still have `change this text` / `change this part`. Live eggs UNVERIFIED |
| Handoff | Production `761d23b8` / `d5d9430f5` | **Overturned:** production `8b07cd2d` |
| README | Four machines, panel on VM100, 4.3 GB RAM story in compose comments | Topology is six running infra VMs + 2 VPS. VM103 is 8 GB. Panel hostname is `debian13-test` |
| PRODUCTION_READINESS | App ready, 119 tests, Stripe keys missing, mail to file | Stale. Live SMTP + live Stripe. Test count in that doc is not current |

## Known high-severity observations (detail in later files)

See `20-MASTER-FINDINGS.md`. Interim IDs BM-001 … BM-012.
