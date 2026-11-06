# 21 — P0/P1 remediation roadmap + implementation handoff

Owner-only for flags, Stripe, DNS, eggs, prune, `onboot`. Fixing agents: app code only after owner turns payments off.

## Order of work

### Day 0 — stop the bleeding (owner)

1. **DONE 2026-11-06T07:11Z:** `PAYMENTS_ENABLED=false`, api+worker recreated, 503 verified. Covers new Checkout (BM-002). 9 Stripe subscriptions still active.  
2. **DONE same change:** `MAIL_SALES_ENABLED=false` (BM-018). Email SKUs no longer orderable.  
3. Do not rotate `SESSION_SECRET` until v2 migration (BM-003).  
4. Do not `qm stop` customer VPS.

### Week 1 — P0/P1 ops (owner + infra)

5. **DONE:** `qm set 100/1001/1002 --onboot 1`.  
6. **DONE in git:** `configureVm` sets `onboot: 1` (needs deploy).  
7. **DONE:** Docker prune timer on VM103; disk 85% → 71%. Cache still ~27 GB under 72h.  
8. **DONE in git:** `nodejs.json` / `python.json` `done` markers. Live egg 16 on the panel still needs a panel write.  
9. **DONE:** VM101 MariaDB `bind-address=127.0.0.1`. Listens on loopback only.

### Week 2 — crypto and tax

10. Set `DATA_ENCRYPTION_SECRET`; run `upgradeSecretEncryption` over stored boxes; keep old `SESSION_SECRET` until decrypt of leftovers is zero (BM-003). Dual-read already in `decryptSecret`.  
11. Tax: owner/legal write the rule. Then either Stripe Tax on **or** keep quotes honest. Do not invent VAT rates in code (BM-012).

### Week 3 — DR

12. Add VM103/101/104 to off-site agent or PBS (BM-001, BM-006, BM-021).  
13. Restore drill: decrypt VM1002 age file to spare VMID; time it. Refresh `restore-drill.json`.  
14. Copy `/etc/pve/qemu-server` off-host.

### Week 4 — product freeze

15. Shrink orderable to SKUs watched start: Paper, one Node bot, one VPS.  
16. Hide `/admin/catalog/families` or freeze Product writes (BM-020).  
17. Fix `/apps` count (BM-019).  
18. VPS gate: free RAM/disk + slots (BM-016). vmbr2 port isolation (BM-011).

### Later (P2/P3)

Health JSON trim (BM-007). ZIP apply uses inspect filter (BM-013). GitHub PKCE (BM-017). Align SHAs before UI bug reports (BM-014). Guest claim: do nothing (BM-022).

## Implementation handoff (for Cursor after audit)

- **Do not** treat dirty `/root/work` Deploy Studio as production. Prod is `/opt/blipmade` `8b07cd2d`.  
- **Do not** rotate session secret as a “security win”.  
- Smallest money fix is the env flag, not a Stripe Dashboard wipe.  
- Smallest VPS boot fix is `onboot` in `configureVm` plus `qm set` on 1001/1002.  
- Smallest egg fix is JSON `done` strings, then one reinstall.  
- Tests: sandbox Stripe only; never live Checkout.  
- Regression: payments flag off must still allow $0 promotion fulfil (`orders.ts` markOrderPaid path).
