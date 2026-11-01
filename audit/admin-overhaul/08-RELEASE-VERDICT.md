# 08 · Release verdict

**Date:** 2026-11-01 · **Branch:** `feat/admin-overhaul` on top of `main` `5a9bf845`

## Verdict: not ready to be presented as a finished commercial control plane. The security and VPS work is in and live. The product, pricing, content and email administration that the brief asked for is not built.

### What is safe to say
- CI was red with 7 tests and is green: 1303 API tests, 376 web tests, API and web typecheck, production build.
- `settings.write` can no longer change prices, security rules, capacity or the retention records. This is tested, and it is live.
- The Proxmox token is no longer sent to an unverified server. This is live and was tried against the real hypervisor.
- A VPS can no longer be placed on, configured on or deleted from a machine that is not ours, and the slots cannot collide. Tested with a fake Proxmox and a real database; one real VPS pair (2 services) was backfilled.
- A VPS plan change now moves the price with the resources, and a free adjustment is a separate, recorded act. Tested with fakes; the real Stripe update has not been run.

### What is not true yet
- An administrator cannot yet manage products, discounts, annual prices, tax, public content or the full set of emails without a developer.
- The live backup and restore chain was not verified. Source code supports it; this work did not prove it.
- The admin screens were not looked at in a browser, and Playwright was not run.
- 10 production dependency advisories in the API (6 high) are open.

### Objectively, for paying customers
The platform that existed before this work already sold the game and app services, and that part is not worse. It is **not** ready for the VPS product to be opened to customers until: a real card payment of a VPS is tested, the Stripe subscription update of the plan change is tested on a test-mode subscription, the legal wording on backups is reviewed, and the dependency advisories are decided. Nothing here proves a restore from backup.

## Rollback
Images `blipmade-{api,worker,web}:before-overhaul-20261101T171214Z`, database dump and `.env` copy on VM 103 (see 06). The two migrations only add a table and a column, so the previous images run on the new schema.
