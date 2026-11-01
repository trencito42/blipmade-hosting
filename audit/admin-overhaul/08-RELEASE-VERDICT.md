# 08 · Release verdict

**Date:** 2026-11-01 · **Branch:** `feat/admin-overhaul` on top of `main` `5a9bf845`

## Verdict: much closer, still not "finished". The administration the brief asked for exists for products, add-ons, prices history, email wording and four blocks of public text; the pricing engine, the rest of the content and the screen-by-screen audit are not done.

### What is safe to say
- CI was red with 7 tests and is green: 1345 API tests and 376 web tests, API and web typecheck, production build.
- The security work is live: no setting can be written by the wrong permission, the Proxmox token is only sent to the pinned certificate, VPS slots cannot collide and an unknown machine is never touched.
- An administrator can now, without a developer: edit every field of a product with a review of the change and a confirmation for risky ones, publish or retire it, create and change add-ons (including the dedicated IPv4), read the history of the price changes, change the wording of the emails with a preview, versions and a test message, edit the home heading, the home FAQ, the words of the products and the search titles with a draft and a rollback, and look at failed jobs and the VPS allocations.
- The offsite backup was restored for real once, and the copy matched the live database.

### What is not true yet
- The annual discount, the margin per product and the tax configuration are not built. No tax rule was invented.
- The new screens were never opened in a browser, and Playwright was not run.
- Customer backups and VPS backups were not verified live. A real VPS card payment and a real Stripe plan change were not tried.
- Eight advisories remain in the API dependencies (`zod`, `prisma` and its config chain, the Sentry build plugins).
- Seven backend operations have no screen (see 03).

### For paying customers
The game and app services are not worse than before and the platform is safer. The VPS product should stay closed until a real card payment of a VPS and a plan change on a Stripe test-mode subscription are tried, and until you have read the backup wording in the Terms, the SLA and the AUP. The Proxmox pool permission (07, action 1) is yours to give.

## Incident caused by this work
My first test runs wrote fake backup receipts into the real status directory and raised a false critical alert (INC-A6298F24D7). The real backups were never touched. The receipts were rewritten by a real backup and a real restore drill, 204 test mail files were removed, and the suite now runs in a temporary directory.

## Rollback
Images `blipmade-{api,worker,web}:before-round2-20261101T184355Z` (and `before-editor-...`, `before-overhaul-...` for the earlier steps), the dumps `~/pre-round2-20261101T184355Z.dump`, `~/pre-editor-20261101T174718Z.dump`, `~/pre-overhaul-20261101T171214Z.dump` on VM 103. The four migrations of this work only add tables and columns, so the previous images run on the new schema.
