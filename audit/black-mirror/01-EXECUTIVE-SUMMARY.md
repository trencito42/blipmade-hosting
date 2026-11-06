# 01 — Executive summary (FINAL for this pass)

**Date:** 2026-11-06. Production SHA **`8b07cd2d`**. Working tree `952b7492` + dirty Deploy Studio is **not** production.  
**P0:** 3 (BM-001, BM-002, BM-015). **P1:** 12. Launch: **NO-GO**.

## 1. Launch tomorrow?

**No.** Live Stripe checkout is on (`PAYMENTS_ENABLED=true`, health `stripe:live`) while 59 SKUs are `orderable`, VAT/Stripe Tax is off, the host is RAID 0, mail has no off-site copy, VPS VMs do not start on boot, and python generic egg 16 still uses a Wings placeholder. No Stripe Dashboard proof that money already moved — the **path is open**.

## 2. Ten most important verified problems

1. RAID 0, two 960 GB SSDs, all qcow2 on `local` (BM-001).  
2. Live payments + 59 orderable SKUs (BM-002, BM-015).  
3. Quotes/invoices collect no Stripe Tax; platform VAT skipped when payments on (BM-012).  
4. `DATA_ENCRYPTION_SECRET` unset; v1 boxes use `SESSION_SECRET` (BM-003).  
5. Mail sold (`MAIL_SALES_ENABLED=true`) with no Blipmade off-site job (BM-018, BM-021).  
6. VPS `onboot` missing in Proxmox and in `configureVm` (BM-009).  
7. Panel VM `onboot` missing (BM-008).  
8. Live egg 16 python generic `done="change this part"`; git eggs would re-break Node (BM-004).  
9. VM103 disk 85% (BM-005).  
10. VPS gate ignores host RAM/disk; default 150 slots (BM-016).

## 3. Architectural mistakes

- Dual catalogue (`Product` vs `CatalogFamily`) and five buy paths.  
- Control plane + CI on one 80G VM.  
- Backup agents exist for VPS and game-node files, not for mail or the control-plane VM disk.  
- Session secret is the data-at-rest key.

## 4. What is actually strong

- Checkout refused when the payments flag is off (flag is on).  
- Webhook ledger + unique `(provider, eventId)` + worker retry.  
- Session cookie HttpOnly + Secure in production; CSRF double-submit; OAuth `state`; PKCE on Google/Discord/Apple.  
- Instance 404 for foreign IDs; viewer path whitelist.  
- ZIP inspect-time `..` checks.  
- Compose: no privileged, no docker.sock, memory limits.  
- VPS weekly off-site vzdump **verified** 2026-11-02 for VM 1002 (~460 MB).  
- VM103 nightly DB dump + off-site receipt `verified:true` today.  
- Game node daily customer/database off-site timers ran today.  
- Catalogue honestly marks CS2/FiveM/Hytale COMING_SOON with reasons.  
- Staff invite/grant/remove APIs exist with step-up.

## 5. Dangerous while looking healthy

- HTTP 200 health with `stripe:live`.  
- `/apps` “49 things you can deploy right now” vs API 59.  
- Docker healthy ≠ egg/runtime healthy.  
- Off-site `verified:true` is hash-after-upload, not a restore you watched.  
- 59 DEPLOYABLE cards.

## 6. Unnecessarily complex

Admin nav ~30 entries; Products **and** Catalogue families; Deploy + FamilyDeploy + product wizard + VPS checkout + email checkout. Dirty Deploy Studio in git is extra risk of a third UI.

## 7. Missing for a hosting business

Off-host copies of panel/Wings/mail/platform disks; boot persistence; VAT decision; proven SKU list; capacity gate for VPS; operator path that does not need SSH.

## 8. Before first paying customer

Owner: `PAYMENTS_ENABLED=false` and/or `MAIL_SALES_ENABLED=false` until DR and tax are real. Fix `onboot`. Disk prune. Set `DATA_ENCRYPTION_SECRET`. Fix egg 16. Shrink orderable to SKUs you have watched start. Do not invent legal VAT text.

## 9. Can wait

Smart Connect, Cloudflare for SaaS, CRM campaigns, GitHub PKCE, public health field trim, guest-claim 401 (not a bug).

## 10. CTO 30 days

Week 1: money flags, disk, encryption key, egg 16, `onboot`.  
Week 2: mail off-site, infra VM dumps, tax written decision.  
Week 3: VPS isolation + capacity; freeze one catalogue.  
Week 4: restore drill of VPS 1002 and DB; then maybe one live SKU.

## Scoreboard

| | |
|---|---|
| P0 | BM-001, BM-002, BM-015 |
| P1 | BM-003–005, BM-006 (reclassified), BM-008–012, BM-016, BM-018, BM-021 |
| P2 | BM-007, BM-013, BM-014, BM-019, BM-020 |
| P3 | BM-017 |
| Not a defect | BM-022 guest 401 |

**Scoring:** no numeric quality score. Verdict is NO-GO on launch blockers, not a 1–100 scale.
