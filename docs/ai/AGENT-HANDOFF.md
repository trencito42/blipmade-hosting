# Agent handoff

Updated: 2026-11-03 after the owner approved the production deploy of `580bbc0`.

## Source and production

- Repository `/root/work`, branch `main`, GitHub `main` and production VM103 are on `580bbc0` (`Add an admin draft for catalogue families, variants, presets and add-ons`).
- This deploy was explicitly requested. Pre-deploy backup: `/var/backups/blipmade/pre-deploy-580bbc04-202611031358.sql.gz`. Migration `20261103160000_catalog_structure` finished. `CatalogFamily`, `CatalogVariant`, `CatalogPreset` and `CatalogAddonDefinition` exist. API and web came up healthy, the worker was replaced, and public smoke checks returned 200 for `/api/health`, `/`, `/apps`, `/docs`, `/app` and the icon font.
- The earlier backup `/var/backups/blipmade/pre-deploy-34e850d3-202611031338.sql.gz` remains from the previous deploy.
- Nothing else was waiting outside `main`. The only commit on `audit/admin-master-spec-20261103` is a progress note already present on `main` as `cd5b838`. The old launch-hardening branch was not merged.
- The public catalogue still does not read the new tables. Do not deploy again without a fresh explicit owner approval. Never print or store secrets.

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
- Web TypeScript passes; unit 499 total / 497 pass / 0 fail / 2 skip; production build and 172-page prerender pass.
- `admin-staff-edit.spec.ts`: 2/2 pass. `admin-list-preferences.spec.ts`: 2/2 pass, including 390px and local column persistence.
- Known unrelated baseline: 13 public/auth/mobile E2E failures. Admin audit specs still need their seed.

## Next work

1. Run `api/tests/catalog-structure.test.ts` on an approved disposable stack, then record the result in `TEST-STATUS.md`. The migration is `20261103160000_catalog_structure`.
2. Continue #20 only as additive drafts: seed no live products, do not flip `visible` or `deployable`, and do not teach `GET /catalog/products` or `POST /catalog/quote` to read families until the owner approves storefront projection.
3. After that approval, the next #20 slice is a read-only family projection with the readiness gate. Then #22 may consume the same family, variant, preset version and add-on version contract. Do not start #22, #19 or #18 before that.
4. #21 still needs finance/legal and Stripe reconciliation. #23 still needs Cloudflare credentials, zone decisions and a separate nameserver approval.
5. Before context/usage ends: refresh this file and `IMPLEMENTATION-STATUS.md`/`TEST-STATUS.md`, commit, publish, and deploy only if explicitly approved for that new checkpoint.

## Commands

- Web: `cd web && PATH=/opt/node22/bin:$PATH npx tsc --noEmit && npm test && npm run build`
- Targeted E2E: `cd web && PATH=/opt/node22/bin:$PATH npx playwright test <spec> --workers=4 --reporter=list`
- API: `cd api && PATH=/opt/node22/bin:$PATH npm run typecheck`
- Publish approved main checkpoint: `bash scripts/publish.sh`
- Approved deploy only: `ssh -i /root/.ssh/blipmade_vm103 debian@10.77.0.13 'cd /opt/blipmade && bash scripts/deploy.sh'`
