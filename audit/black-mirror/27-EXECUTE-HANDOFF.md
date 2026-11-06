# 27 — Execute remaining remediation handoff

Date: 2026-11-06. Owner authorized production deploy. Identity copy was owner-only.

## Release

| Item | Value |
|---|---|
| Git / production SHA at last deploy of this file | see `git -C /opt/blipmade rev-parse HEAD` |
| Prior studio fix | `a2b0e8bf0e13b53f60d33496cbd75a3a1fe4e3dc` |
| Rollback | `blipmade-{api,web,worker}:before-<shortsha>` |

## Age identity (VM103)

- `/home/debian/.blipmade-backup-bitwarden.age`: `debian:debian` `0600`. `age-keygen -y` **MATCH** vs `OFFSITE_AGE_RECIPIENT`.
- Leftover `/home/debian/.blipmade-backup.age` **untouched** (different unused identity).
- Agent `OFFSITE_AGE_IDENTITY` points at the Bitwarden file. Destination `identityMatchesRecipient=true`.
- Decrypt drill: MariaDB dump `s261_muratura-20261106T051411Z` → `decrypt-verified`, not restore. Staging empty.
- Isolated restores posted with `isolatedRestore=true`: MariaDB (12 tables in throwaway Docker), customer files (3851 files extract+delete), VPS 1001 → VMID 1199 unique MAC, never started, `qm destroy --purge`. Live 1001/1002 still running.

## INFRA

Timer `blipmade-offsite-infra.timer` next **Sun 2026-11-08 03:31:43 UTC**. `infra/` still empty. No live vzdump this pass.

## GitHub

10 issues still open. No `issues:write` token. #26 guides shipped in Domains UI (no DNS automation). #20 contract test on `/catalog/offerings`. Do not close unfinished issues.

## Flags

`PAYMENTS_ENABLED=false` `MAIL_SALES_ENABLED=false`. RAID 0 unchanged. BM-003 dual-read, `DATA_ENCRYPTION_SECRET` unset. GlitchTip token unset.
