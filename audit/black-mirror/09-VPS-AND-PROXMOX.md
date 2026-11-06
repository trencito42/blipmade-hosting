# 09 — VPS and Proxmox

## Live guests

| VMID | Name | RAM/CPU/disk | onboot | Bridge |
|---|---|---|---|---|
| 1001 | vps-1-test-vps | 1G/1c/20G | **none** | vmbr2 |
| 1002 | vps-2-urbanauto | 2G/2c/30G | **none** | vmbr2 |
| 9000–9002 | templates | — | stopped | — |

SSH DNAT `.119:22101/22102`. SNAT to `.119`. vmbr2 created by `blipmade-network.service`, not `/etc/network/interfaces`. DROP to 10.77.0.0/24. **No ebtables port isolation (BM-011).** Packet test not executed.

## Provisioner

`api/src/services/vps.ts` `configureVm` (293–304): cores, memory, ipconfig, sshkeys, agent, tags. **Not `onboot`.** Starts VM if not running. Clone from template. Disk resize with shrink-same-size catch.

Gate: `evaluateGate` VPS branch only `facts.proxmoxConfigured` (readiness-gate.ts 137–141). Default `VPS_MAX_SLOTS` 150 (BM-016). Host 251 GiB; game node already ~131 GiB assigned.

## Backup

Weekly encrypted vzdump off-site for 1001/1002 (journal 2026-11-02 VM1002 verified ~460 MB). Restore drill UNVERIFIED. Infra VMs not in this job.

## Product

Selling four VPS SKUs while guests die on host reboot is a commercial lie until `onboot` is set. L2 sharing is a tenant-boundary defect for any second customer.
