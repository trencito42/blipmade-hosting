# 08 — Games and Pterodactyl

## Live

- Panel VM100: nginx 80/443, PHP 8.3, MariaDB (panel on 127.0.0.1). Hostname `debian13-test`. **No `onboot` (BM-008).**
- Wings VM101 v1.13.4. Earlier: 6 containers (nodejs_25×3, java_25, nginx-egg, nodejs_18). Game ports 30000–30006 listening. DNAT 30000–39999 from `.87`.
- Panel VM `onboot` missing: host reboot → Wings without panel.

## Recoverability

Wings volumes on RAID 0 qcow2. Daily customer/database off-site timers on game node ran 2026-11-06 — **not** a hypervisor dump of VM101. Panel MariaDB not in VM103 nightly. Reconstruct panel from memory: **no**.

MariaDB also on `10.77.0.11:3306` (BM-010) — Wings node, not panel loopback.

## Catalogue vs proof

Many GAMES SKUs DEPLOYABLE. CS2/FiveM/Hytale COMING_SOON. No Minecraft client join this pass. Minecraft UI code exists (`minecraft.ts`, `MinecraftTab.tsx`) — live UNVERIFIED.

Do not mark games commercially supported.
