# Agent handoff

Updated: 2026-11-03 after the staff access lifecycle was added locally. It is not deployed.

## Source and production

- Repository `/root/work`, branch `main`. Production VM103 is still `067f7fd` (`Let a prepared catalogue family continue through the existing checkout`). Do not deploy the staff work without a new explicit approval.
- Earlier production backups remain: `/var/backups/blipmade/pre-deploy-067f7fde-202611031416.sql.gz`, `/var/backups/blipmade/pre-deploy-2dfffa39-202611031401.sql.gz`, `/var/backups/blipmade/pre-deploy-580bbc04-202611031358.sql.gz`.
- The staff change adds migration `20261103170000_staff_invitations`. It is not applied on production.
- Nothing else was waiting outside `main`. The old launch-hardening branch was not merged. Never print or store secrets.

## Staff access lifecycle

- An administrator can add an existing customer as staff or admin, email a 72-hour single-use invitation, change role, and remove staff access. The customer account, orders and notes stay. Removal and an administrator demotion delete that person's sessions and revoke API keys. Password, passkeys and two-factor stay so the customer can still sign in.
- The last unsuspended administrator cannot be demoted or removed. Grants, invitations, cancellation, removal and role changes require an administrator, a fresh step-up, the existing CSRF cookie and the existing write or mail rate limits. Audit events do not store the invitation token or the step-up secret.
- Pages: `/admin/staff/add`, `/admin/staff/invite`, `/admin/staff/:id/remove`, and public `/staff-invite`. The existing rights editor stays.

## Issue #20, first slice

- Additive tables and admin API for families, variants, immutable preset versions and three add-on kinds. Creating a mapping does not write `Product` or `ProductOption`.
- Admin list, family detail and dedicated editors. Public catalogue, quote and checkout are unchanged.
- API runtime tests are written and not run. Web typecheck, unit, build and the new stubbed E2E passed. See `TEST-STATUS.md`.

## Completed earlier in this continuation

- Task C: all 56 commits of `audit/launch-hardening-2026-10-30` classified in `LAUNCH-HARDENING-REVIEW.md`; missing security/billing/streaming changes were ported by hand. The old branch was never merged.
- Task A staff step-up: password/TOTP confirmation, session-bound 10-minute expiry, backend enforcement, audits, migration, API tests and `StaffEdit` confirmation UI.
- Task A Saved Views: per-operator `AdminSavedView`, strict four-list scopes, bounded query JSON, owner-scoped delete, API tests, and premium controls on Customers/Orders/Services/Tickets.
- Task A Column Picker: same four tables, guarded browser storage, required-column recovery, desktop table only, responsive controls.
- Rich-text email editor remains intentionally out of scope; only subject/heading/preheader/note stay editable.

## Evidence and limits

- API typecheck passes. New API tests are written but could not run locally because `TEST_DATABASE_URL`, `DATABASE_URL`, `REDIS_URL`, and `SESSION_SECRET` are unavailable. Do not label API work VERIFIED from the production deploy.
- Web TypeScript passes; unit 501 total / 499 pass / 0 fail / 2 skip; production build and 172-page prerender pass.
- `admin-staff-lifecycle.spec.ts`: 5/5 pass, including 390px. `admin-staff-edit.spec.ts`: 2/2 pass. `admin-list-preferences.spec.ts`: 2/2 pass.
- Known unrelated baseline: 13 public/auth/mobile E2E failures. Admin audit specs still need their seed.

## Next work

1. Run `api/tests/catalog-structure.test.ts` and `api/tests/admin-staff-lifecycle.test.ts` on an approved disposable stack. Neither file has run.
2. The family chooser is deployed at `067f7fd` and appears only after an operator marks a family prepared. Do not seed or reflag live products without a separate yes. The staff lifecycle is local only; deploy it only with a new explicit approval. The new migration has not been applied in production.
3. #22 can read `config.catalog`. Still to build: post-purchase add-on install, repurpose, and saved profiles. Do not invent an installer that the panel cannot perform.
4. #19 Minecraft tools already exist for Paper, Folia and Forge. Other game workspaces wait on real panel capabilities.
5. #18 research is in `docs/ai/SMART-DEPLOY-RESEARCH.md`. No importer yet.
6. #21 now quotes the days left in the paid period and stops a third applied resize inside 30 days. A decrease records a credit and sends it to Stripe only when that customer already has a Stripe id. No live charge was run. #23 still cannot write DNS: the owner must put a zone-scoped token and zone id in the server environment. The www suggestion was removed because the certificate covers only the claimed hostname. Nameserver migration still needs a separate yes.

## Commands

- Web: `cd web && PATH=/opt/node22/bin:$PATH npx tsc --noEmit && npm test && npm run build`
- Targeted E2E: `cd web && PATH=/opt/node22/bin:$PATH npx playwright test <spec> --workers=4 --reporter=list`
- API: `cd api && PATH=/opt/node22/bin:$PATH npm run typecheck`
- Publish approved main checkpoint: `bash scripts/publish.sh`
- Approved deploy only: `ssh -i /root/.ssh/blipmade_vm103 debian@10.77.0.13 'cd /opt/blipmade && bash scripts/deploy.sh'`
