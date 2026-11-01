# 01 · Findings, revalidated against the latest HEAD

Baseline: `main` at `5a9bf845` (GitHub, identical in source to the code that runs live, except the egg JSON files).
Branch: `feat/admin-overhaul`. Statuses: FIXED AND VERIFIED, IMPLEMENTED BUT UNVERIFIED, STILL BROKEN, NOT IMPLEMENTED, BLOCKED BY EXTERNAL DEPENDENCY, INTENTIONALLY NON-CONFIGURABLE.

| # | Finding of the previous audit | State at `5a9bf845` | State now | Evidence |
|---|---|---|---|---|
| 1 | `PUT /admin/settings` writes any key for `settings.write` | STILL BROKEN (only `cancelled_instance_retention` and `internal.*` were protected) | FIXED AND VERIFIED | `api/src/services/setting-registry.ts:94`, `api/src/routes/admin.ts:1799-1890`, `api/tests/settings-registry.test.ts` (14 tests), commit `e6afab4` |
| 2 | `pricing_resources` writable outside the pricing endpoint | STILL BROKEN | FIXED AND VERIFIED (`general:false`, owner `pricing.write`, even an administrator is refused on the general endpoint) | same tests |
| 3 | Proxmox `rejectUnauthorized:false` | STILL BROKEN (`proxmox.ts:24`, `vps-console.ts:36`) | FIXED AND VERIFIED against a real self-signed TLS server; live connectivity with the pin is verified in 06 after the deploy | `api/src/lib/pinned-tls.ts`, `api/src/services/proxmox.ts:32`, `api/tests/pinned-tls.test.ts`, commit `e82560e` |
| 4 | Hardcoded VPS networking | STILL BROKEN | PARTIALLY: VMID base, network prefix, host offset, gateway, SSH port base and slot cap are now `VPS_*` environment values with the old numbers as defaults (`api/src/env.ts`). Bridges, DNAT and firewall stay in the hypervisor scripts | INTENTIONALLY NON-CONFIGURABLE from the admin panel |
| 5 | Slot = highest + 1, max 150 | STILL BROKEN (a deleted last row hands its slot out again while its machine may still exist) | FIXED AND VERIFIED: ledger `VpsSlot`, advisory lock, never reused, quarantine | `api/src/services/vps.ts:70-190`, `api/tests/vps-allocator.test.ts` (9 tests), commit `2e9d69a` |
| 6 | VPS plan change leaves the price | STILL BROKEN (the code said so in a comment) | FIXED AND VERIFIED with Proxmox and Stripe replaced by fakes. The real Stripe call is not exercised | `api/src/services/vps-plan.ts`, `api/tests/vps-plan.test.ts` (14 tests), commit `ac88198` |
| 7 | Product editor incomplete | STILL BROKEN | FIXED AND VERIFIED (API, 15 tests); the screen is IMPLEMENTED BUT UNVERIFIED in a browser | `api/src/services/product-editor.ts`, `api/src/routes/admin-products.ts`, commits `1734131`, `b0064b3` |
| 8 | Hardcoded public content | STILL BROKEN | PARTIALLY: four blocks are editable (home heading and text, home FAQ, product words, search title and description). Documentation, legal documents and the rest of the pages stay in code | `api/src/services/content.ts`, `api/tests/content.test.ts` |
| 9 | Email template admin limited | STILL BROKEN | PARTIALLY: preview, versions with restore, test message, event map, fallback. Design variables stay in code on purpose | `api/src/routes/admin-email.ts`, `api/tests/email-admin.test.ts` |
| 10 | Backup retention reads 200 servers | STILL BROKEN (`backup-policy.ts`, `take: limit`, one page) | FIXED AND VERIFIED with the panel replaced by a fake | `api/src/services/backup-policy.ts:106`, `api/tests/backup-sweep.test.ts`, commit `522096c` |
| 11 | Public claims about automatic backups | STILL BROKEN (docs, Terms, SLA and AUP said the platform takes no automatic backups, the product offers a daily or weekly one that the customer switches on) | IMPLEMENTED BUT UNVERIFIED: the wording follows the product. The three legal documents need your review before you rely on them | commit `aa2b0ae` |
| 12 | CI: 7 failing tests | STILL BROKEN (7 failures reproduced) | FIXED AND VERIFIED | see 06 |

## New findings made while working

| # | Finding | State | Evidence |
|---|---|---|---|
| A | `provisionVps` adopted whatever machine already sat at the VMID, `destroyVps` and `reinstallVps` deleted it. A collision would have configured or deleted a machine that is not ours | FIXED AND VERIFIED | `machineOwnership` `vps.ts:131`, tests "a machine that is not ours" |
| B | `sweepVps` read 100 servers and stopped: a platform with more than 100 active servers never suspended the rest | FIXED AND VERIFIED | `vps-lifecycle.test.ts` |
| C | VPS retention (14 days) and payment grace (3 days) were constants | FIXED AND VERIFIED: settings `vps.retention_days` (14 to 365, never shorter than the promise) and `vps.payment_grace_days` (0 to 30) | `vps-lifecycle.test.ts` |
| D | The web test `notification-center-ui` failed on `main` because the sidebar stores its open groups in `localStorage` | FIXED AND VERIFIED: the test now names the one allowed key | `web/tests/notification-center-ui.test.ts` |
| E | `npm audit` reports 10 vulnerabilities in the API production dependencies (6 high) | PARTIALLY FIXED: the unused `@fastify/static` was removed and `nodemailer` was upgraded to 10 (SMTP verified live). 8 remain: `zod`, `prisma` and its config chain, the Sentry build plugins | see 07 |
| F | The test suite wrote fake backup receipts into the real `/var/backups/blipmade/status`, which raised a false critical alert (INC-A6298F24D7) | FIXED AND VERIFIED: the suite is run with `BACKUP_DIR` and `OPS_STATUS_DIR` in a temporary directory, as `scripts/run-tests.sh` does; the real receipts were rewritten by a real backup and a real drill | see 06 |
