# 17 — Backup and recovery

**Pass:** 2026-11-06 revalidation. Empty `/var/lib/vz/dump` is not “no backups”.

## What exists (VERIFIED)

| Layer | Evidence | Restore proven this pass? |
|---|---|---|
| Nightly platform archive VM103 | `/var/backups/blipmade/blipmade-scheduled-20261106T022044Z.tar.gz` 2.5 MB; receipt `result=success` | UNVERIFIED restore |
| SHA256 next to archive | present | not compared |
| Off-site encrypted DB/uploads | receipt `verified:true`, `keptCopies:14`, alias `blipmade-offsite` | Hash-after-upload, not a watched restore |
| Pre-deploy SQL | including `8b07cd2d` ~06:00Z | UNVERIFIED |
| systemd | `blipmade-backup.timer`; offsite platform/destination/retention timers | VERIFIED exist |
| Restore drill receipt | `restore-drill.json` **2026-11-02** | Stale |
| VPS weekly vzdump off-site | `blipmade-offsite-vps.timer`; journal 2026-11-02 14:53Z VM **1002** OK; `verified` ~459985802 B `.vma.zst.age`; `done/vm-1001` and `vm-1002` | Decrypt+qmrestore UNVERIFIED |
| Game node | daily customer/database off-site timers ran 2026-11-06 | Contents UNVERIFIED |
| Hypervisor `local` dump dir | 0 files (stage then delete) | n/a |
| PBS | client 4.2.8; **no datastore** | unused |
| Mailcow | helper `backup_and_restore.sh`; **no** `blipmade-offsite-*` unit (BM-021) | missing |
| VM100–105 qcow2 | live only on RAID 0 `local` | missing |
| `.env` / age identity | excluded / off-host by design | restore needs out-of-band keys |

## RAID 0 impact (BM-001)

Two Samsung MZ7L3960 960 GB, `md1` RAID 0, ext4 `/`. All qcow2 on `pvesm local`. One SSD: hypervisor + panel + Wings volumes + mail + platform + VPS running disks gone. Off-site VPS age files and DB tarball survive **if** identity and Storage Box still exist.

## Reconstructability

- VM configs: `/etc/pve/qemu-server/*.conf` on this host only unless copied in the platform archive (platform archive is VM103 files, not PVE configs). **PVE configs UNVERIFIED off-host.**
- Panel DB: on VM100 MariaDB; not in VM103 nightly unless separately dumped. UNVERIFIED.
- Wings `/var/lib/pterodactyl`: game-node daily job claimed; not listed remotely this pass.
- Mail: no Blipmade off-site unit.

## RPO/RTO

- Platform DB RPO ~24h + last pre-deploy dump.  
- VPS RPO ~weekly (timer).  
- Mail/control-plane VM disks: unbounded.  
- RTO: no timed restore this pass. Age identity lost → off-site unreadable.

## Scenario matrix

| Scenario | Outcome |
|---|---|
| Accidental row delete | SQL dump to scratch. No WAL PITR seen. |
| DB corruption | Nightly dump exists. Drill stale. |
| Failed migration | Pre-deploy dumps on VM103. |
| Destroyed Wings node | File-level job claimed; VM qcow2 not dumped. |
| Failed VPS 1002 | Theoretical restore from age file. UNVERIFIED. |
| Lost dedicated host | DB+uploads+VPS weekly+game-node files **if** remote listing is real. Panel/mail/PVE configs at risk. |
| Lost `SESSION_SECRET` | v1 boxes unreadable (BM-003). |
| Lost age identity | Off-site archives unreadable. |

## Split-brain

API named volume `blipmade_backup_data` is **not** where host `backup.sh` writes (H5). Receipts live under host status dir.

## Proposed validations (not executed)

1. `restore-drill.sh` into scratch DB.  
2. Decrypt newest VPS 1002 object off-host; `qmrestore` to spare VMID.  
3. Confirm PVE configs in some off-site path.  
4. Schedule Mailcow off-site.
