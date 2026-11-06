# 03 — Infrastructure and system administration

**Evidence:** hypervisor 2026-11-06T05:58Z–06:06Z. All commands read-only.

## Dedicated host

| Check | Result | Status |
|---|---|---|
| CPU | 2× Xeon E5-2698 v4, 80 threads, load ~2 | VERIFIED |
| RAM | 251 GiB, ~160 GiB used, ~91 GiB available, swap 30 GiB almost unused | VERIFIED |
| Disk | `/` 1.7T on **md1 RAID 0** (`sda3+sdb3`), `/boot` RAID 0, swap RAID 0 | VERIFIED |
| SMART | both disks PASSED | VERIFIED |
| NTP | synchronized, UTC | VERIFIED |
| SSH | port 22 public, `PermitRootLogin without-password`, pubkey yes, password no | VERIFIED |
| Users | root only (uid 0) plus nobody/ceph | VERIFIED |
| PVE firewall | `Status: disabled/running` | VERIFIED |
| pveproxy | `*:8006` | VERIFIED |
| Kernel | running 7.0.14-25, package 7.0.14-26 present — reboot pending | VERIFIED |
| Uptime | 15 days | VERIFIED |
| Docker on host | none (Docker lives in VMs) | VERIFIED |

**BM-001 (P0):** RAID 0 is the only local datastore (`pvesm status` shows `local` dir only). One disk failure loses the hypervisor, all VM disks, and local backups. Documented in `docs/BACKUP-DISASTER-RECOVERY.md` and `scripts/backup.sh`. Off-site DB copy does not restore Pterodactyl volumes, Mailcow, or VPS disks.

**BM-006 (P1, reclassified):** `/var/lib/vz/dump` has **0** files by design (staging then delete). `vzdump.cron` empty. **VPS weekly off-site** exists: journal 2026-11-02 VM 1002 `verified` ~460 MB `.vma.zst.age`. VM100–105 qcow2 still have no hypervisor dump. PBS client unused.

Overcommit: VM RAM assigned ≈ 4+131+2+8+12+4+1+2 = 164 GiB vs 251 GiB host. CPU 2+20+2+4+4+2+1+2 = 37 of 80. Headroom exists **until** game node fills 131 GiB. Storage: VM disks 40+900+20+80+120+40+20+30 ≈ 1.25T qcow2 on 1.7T filesystem at 32% host `/`. Thin qcow2 can still surprise on fill.

Unexpected host services: postfix on :25 loopback, postgres+redis on host loopback (not the platform DB), Cursor/code-server, many SSH tunnels. Not customer-facing; they enlarge the host attack surface. UNVERIFIED purpose of host postgres/redis.

## Virtual machines

### VM100 panel (named `debian13-test`)

- Debian 13, 4G/2c/40G, disk 5% used, no `onboot` in qm config (**BM-008**).
- nginx 80/443 on `10.77.0.10`, php8.3-fpm, mariadb 127.0.0.1:3306, redis 127.0.0.1:6379, `/var/www/pterodactyl` present.
- Public DNAT `.86:80/443` → this VM. TLS and auth of the panel UI: UNVERIFIED (no local DNAT hairpin).

### VM101 games-node-01

- 125 GiB RAM shown, 9% of 886G disk, `onboot: 1`.
- Wings active `vv1.13.4`, config mode `0600`.
- 6 egg containers (nodejs_25 ×3, java_25, nginx-egg, nodejs_18).
- Listen: game ports 30000–30006 on `10.77.0.11`, **`:8080` all interfaces**, **`:2022` all interfaces**, **MariaDB `10.77.0.11:3306`** (not loopback) — **BM-010**.
- Script DNATs `.87:8080` and `:2022` to this VM. Internet reachability UNVERIFIED from hypervisor (PREROUTING not applied to local origin). If 8080 is reachable, Wings API is on the public game IP.

### VM102 proxy

- 2G/2c/20G, 7% disk, Caddy 2.11.2 active.
- `:80` and `:443` all interfaces; admin API `127.0.0.1:2019` returned HTTP 200; `:2020` all interfaces but curl to 2020 from the VM was 000.
- `/etc/caddy/Caddyfile` empty/missing at that path. Actual config source UNVERIFIED (`caddy adapt` not run).

### VM103 platform

- 8G/4c/80G, **85% disk used, 12G free** — **BM-005**.
- Docker: `blipmade-{api,web,worker,postgres,redis}` healthy; extra `bmci-pg`, `bmci-redis`, `pgtest-admin` (bench) left running for days.
- Images: 472 tagged, **~40 GB reclaimable build cache**.
- Limits: api 768m/1.5 cpu, worker 768m/1 cpu, web 384m/1 cpu, postgres 1536m/1.5, redis 384m/0.5. No privileged, no docker.sock. Caps dropped.
- Web published `10.77.0.13:3000` (entire vmbr1 can hit customer UI without Caddy).
- API published `127.0.0.1:3100` only.
- Backup timer ran 02:20Z success. Offsite receipt `verified:true`, 14 copies kept. Restore drill receipt on VM103 is dated **Nov 2** (stale vs nightly).
- Named volume inside API `/var/backups/blipmade` is essentially empty (`mail/` only). Host path holds 57 `tar.gz` plus many `pre-deploy-*.sql.gz`. Split layout, not a missing backup.

### VM104 mail

- 12G/4c/120G, 6% disk, Mailcow tree `/opt/mailcow-dockerized`.
- Ports 25/465/587/993/995/143/110/80/443/4190 on `0.0.0.0`.
- `docker ps` as the SSH user: permission denied. Container health UNVERIFIED this user.

### VM105 observability

- GlitchTip 6, postgres 18, valkey 9, all up 6 days.
- UI `10.77.0.15:8000` (vmbr1 only). Auth UNVERIFIED.

### VPS 1001/1002

- Tags encode private IP, public `.119`, SSH DNAT ports.
- **`onboot` absent** — host reboot leaves paying (or test) VPS off until manual start. **BM-009**.
- Isolation: script drops vmbr2 → 10.77.0.0/24 and vmbr2 → host INPUT. Operator note 2026-10-30: **no port isolation between VPS taps**. Two VPS on the same L2 can still talk. **BM-011 PARTIAL**.

## Network and firewall

`blipmade-network.service` oneshot runs `/usr/local/sbin/blipmade-network.sh` before `pve-guests`. vmbr2 is created there, not in `/etc/network/interfaces`. Persistence depends on that unit remaining enabled. **PARTIAL** (unit is enabled).

`POSTROUTING -j BLIPMADE-VPS-POST` appears **four times** (`iptables -t nat -S`). Duplicate jumps, not extra SNAT. P3 hygiene.

INPUT policy ACCEPT, then interface-specific drops. `BLIPMADE-HOST-INPUT` accepts vmbr1 fully, then SSH on eth0, then drops the rest of eth0. The later explicit DROP of 8006/3128/111 on eth0 is **dead** if HOST-INPUT already dropped. Management UI is reachable from platform VMs on vmbr1. External 8006: UNVERIFIED; local curl to `:8006` on the public IP returned 200 because it never traversed eth0 INPUT.

IPv6: address configured on eth0 in `interfaces`; VMs inspected have no IPv6 on guest lists. Smart Connect documents IPv4-only. Split-stack UNVERIFIED.

## Docker (VM103)

Restart `unless-stopped` on platform containers. Healthchecks use `/health/live` (API) and `/healthz` (web). Worker `/health` inside container.

Secrets: env_file `.env` into api/worker (all keys in process environment). Discord webhook file mount `ro`. Postgres password from compose env.

Orphans: bench postgres/redis and 40 GB build cache compete with 12 GB free. **BM-005**.

## Reliability (design, not chaos-tested)

| Scenario | Design evidence | Executed? |
|---|---|---|
| API restart | compose restart + healthcheck | Not executed. Occurred naturally at 05:59 deploy; health 200 ~06:03 |
| Worker restart | same | Not executed as a test |
| Redis/DB restart | depends_on healthy | Not executed |
| Host reboot | RAID0, VPS onboot missing, VM100 onboot missing, kernel pending | **Must not** reboot for this audit |
| Panel down | extra_hosts + app key | Not executed |
| Wings disconnect | — | Not executed |
| Interrupted webhook | `WebhookEvent` ledger in `webhooks.ts` | Code only |

## Patch state

Guest kernels 6.12.113+deb13. Host kernel one version behind installed. `apt` pending list not collected (would be large; UNVERIFIED full CVE patch status).
