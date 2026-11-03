# Agent handoff

Updated: 2026-11-03 after Task C and Task A deployment.

## Source and production

- Repository `/root/work`, branch `main`, clean at this checkpoint.
- GitHub `main` and production VM103 are on `34e850d` (`Add saved views and column controls to admin lists`).
- Production deploy completed successfully. Pre-deploy database backup: `/var/backups/blipmade/pre-deploy-34e850d3-202611031338.sql.gz`. API, web, worker and public smoke endpoints passed.
- Never merge or deploy again without a fresh explicit owner approval. Commit/push small checkpoints. Never print or store secrets.

## Completed this continuation

- Task C: all 56 commits of `audit/launch-hardening-2026-10-30` classified in `LAUNCH-HARDENING-REVIEW.md`; missing security/billing/streaming changes were ported by hand. The old branch was never merged.
- Task A staff step-up: password/TOTP confirmation, session-bound 10-minute expiry, backend enforcement, audits, migration, API tests and `StaffEdit` confirmation UI.
- Task A Saved Views: per-operator `AdminSavedView`, strict four-list scopes, bounded query JSON, owner-scoped delete, API tests, and premium controls on Customers/Orders/Services/Tickets.
- Task A Column Picker: same four tables, guarded browser storage, required-column recovery, desktop table only, responsive controls.
- Rich-text email editor remains intentionally out of scope; only subject/heading/preheader/note stay editable.

## Evidence and limits

- API typecheck passes. New API tests are written but could not run locally because `TEST_DATABASE_URL`, `DATABASE_URL`, `REDIS_URL`, and `SESSION_SECRET` are unavailable. Do not label API work VERIFIED from the production deploy.
- Web TypeScript passes; unit 499 total / 497 pass / 0 fail / 2 skip; production build and 172-page prerender pass.
- `admin-staff-edit.spec.ts`: 2/2 pass. `admin-list-preferences.spec.ts`: 2/2 pass, including 390px and local column persistence.
- Known unrelated baseline: 13 public/auth/mobile E2E failures. Admin audit specs still need their seed.

## Next work

1. Obtain/provision an approved disposable API test stack; run staff step-up, saved views, security, billing and download tests. Update `TEST-STATUS.md` honestly.
2. Task B starts with issue #20 catalogue families/variants/presets/add-ons, but the brief requires an explicit product-owner “go” before implementation and forbids changing the live catalogue without approval. First add the short plan to `IMPLEMENTATION-STATUS.md`, then build dedicated pages + API + tests in small commits.
3. Continue in order only: #20 → #22 → #19 → research-first #18. #21 needs finance/legal and Stripe reconciliation; #23 needs Cloudflare credentials/zone decisions and separate nameserver approval.
4. Before context/usage ends: refresh this file and `IMPLEMENTATION-STATUS.md`/`TEST-STATUS.md`, commit, publish, and deploy only if explicitly approved for that new checkpoint.

## Commands

- Web: `cd web && PATH=/opt/node22/bin:$PATH npx tsc --noEmit && npm test && npm run build`
- Targeted E2E: `cd web && PATH=/opt/node22/bin:$PATH npx playwright test <spec> --workers=4 --reporter=list`
- API: `cd api && PATH=/opt/node22/bin:$PATH npm run typecheck`
- Publish approved main checkpoint: `bash scripts/publish.sh`
- Approved deploy only: `ssh -i /root/.ssh/blipmade_vm103 debian@10.77.0.13 'cd /opt/blipmade && bash scripts/deploy.sh'`
