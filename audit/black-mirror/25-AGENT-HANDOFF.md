# 25 — Agent handoff

**Updated:** 2026-11-06T07:15Z (remediation Phase 1)  
**Inspected tree:** `/root/work` @ `8b07cd2d` plus Phase 1 code (unpublished until publish.sh)  
**Production:** VM103 `/opt/blipmade` @ `8b07cd2d`; `.env` flags changed 07:11Z; code SHA unchanged.

## This pass frozen

Executive summary **FINAL NO-GO**. Coverage matrix filled. Master findings BM-001–BM-022 preserved. Domain files 02–19, 21–24 rewritten to match revalidation (VPS off-site exists; BM-006 P1; live egg 16; 59 SKUs).

## Completed

- RAID 0 topology; empty dump dir explained; VPS weekly age receipt 2026-11-02 VM1002.  
- Stripe live **config** vs no proof of charges. VAT skip when payments on.  
- Encryption v1 `SESSION_SECRET` / v2 unset. Rotation impact documented.  
- Wings MariaDB 3306 from VM103; PVE 8006 from vmbr1; VPS no onboot in `configureVm`; panel no onboot.  
- Checkout code path order → Stripe → webhook → enqueue. Not executed.  
- Authz: owned instance 404; guest claim 401 expected. Live IDOR blocked.  
- Admin nav 30+; staff APIs exist; no click-through.  
- Public `/apps` 49 vs API 59.  
- CI file read; Actions run unverified.  
- Product/UX opinions in 06/12/13/19.

## Do not redo

Do not renumber BM-IDs. Do not treat guest 401 as a bug. Do not claim `/var/lib/vz/dump` empty means no VPS backups. Do not attribute dirty Deploy Studio to production.

## Still BLOCKED / next agent only if owner authorizes

1. Stripe Dashboard (read-only) — confirm zero vs nonzero charges.  
2. Authenticated staging `/app` + `/admin` click (no cookie dump).  
3. Off-site `ls` + decrypt drill of VM1002.  
4. `gh` CI for `8b07cd2d`.  
5. Two-user IDOR.  
6. Mailcow `sudo docker ps` + IMAP.  
7. External curl Wings 8080 / panel 443.

## Last useful evidence

- Health still `stripe:live` (keys remain). Process `PAYMENTS_ENABLED=false`, `MAIL_SALES_ENABLED=false`.  
- Catalog 56 orderable (email closed). Paid SKUs still DEPLOYABLE until catalog code is deployed.  
- Stripe: 2 paid charges, 9 active subscriptions, 0 open Checkout.  
- Egg 16 still placeholder. `DATA_ENCRYPTION_SECRET` still unset. `configureVm` still no onboot.

## Next

Publish Phase 1 code, then owner says `deploy`. Then Phase 2 DR inventory (no RAID rebuild). Do not cancel the 9 subscriptions without the owner.

## Do not

Rotate `SESSION_SECRET`. Do not `qm stop` customer VPS. Do not migrate RAID 0. Do not print secrets. Do not create orders. Deploy only when the owner says deploy.
