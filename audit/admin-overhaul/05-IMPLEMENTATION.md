# 05 · What was implemented

Branch `feat/admin-overhaul`, one coherent commit per change on top of `5a9bf845`.

| Commit | Change |
|---|---|
| `5d1582f` | The 7 failing tests: route order test, notification wiring (84 events, publishers that take the event as an argument, two service events reached by the uptime monitor), `offsite-agent.sh` no longer pipes into `head` under `pipefail` |
| `e6afab4` | Settings registry and the new `PUT/GET/DELETE /admin/settings` |
| `e82560e` | Pinned TLS for Proxmox (REST and terminal) |
| `2e9d69a` | Slot ledger, ownership check, reconciliation report, configurable network layout (migration `20261101180000_vps_slot_ledger`) |
| `ac88198`, `8b308f8` | VPS commercial plan change with quote, free adjustment, billing check, admin UI (migration `20261101190000_vps_resource_override`) |
| `522096c` | Backup retention sweep in pages |
| `aa2b0ae` | Public wording about automatic backups, sidebar storage test |
| `1343c22` | VPS retention and grace as settings, `sweepVps` in pages |

## Not touched, on purpose
- Stripe, Mailcow, Pterodactyl and Caddy configuration, the hypervisor scripts, credentials, the live database contents.
- `scripts/offsite-agent.sh`: only the three `head` pipes were replaced by `sed -n 1p` and a process substitution. Errors are not suppressed beyond the `|| true` that was already there.

## Not implemented (see 07)
Phase 2 (product editor), Phase 3 (discounts, annual, tax, price history, margin), Phase 5 (full admin audit), Phase 6 (CMS), Phase 7 (template versions, preview, test send), Phase 8 (live verification of backups and restores), Phase 9 (lifecycle reconciliation beyond the VPS billing check).
