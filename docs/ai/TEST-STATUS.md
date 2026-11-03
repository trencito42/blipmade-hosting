# Test status

Commands (run in `/root/work/web`, `export PATH=/opt/node22/bin:$PATH`):
- Types: `npx tsc --noEmit`
- Unit: `npm test` (node --test, 498 tests)
- Build: `npm run build` (needed before Playwright; `node server.mjs` serves `dist`)
- E2E batch: `PLAYWRIGHT_JSON_OUTPUT_NAME=/root/e2e-logs/X.json npx playwright test <specs> --workers=4 --reporter=list,json > /root/e2e-logs/X.log 2>&1; echo EXIT=$?`
- 327 tests in 46 files; with `workers: 1` a full run exceeds 10 min (cause of earlier 590s timeout, not a hang). Use `--workers=4`, sequential batches, never overlap. Audit specs (`admin-audit*`, `app-audit*`) need seed file `admin-audit-seed.json` (AUDIT_SEED); they abort the whole run when missing.
- Lint: no lint script in `web/package.json`.

## Last results (2026-11-03)
| Run | Total | Pass | Fail | Skip | Timeout | Notes |
|---|---|---|---|---|---|---|
| tsc | – | clean | – | – | – | |
| Unit | 498 | 496 | 0 | 2 | – | |
| Batch A (editor-shell 161, large-lists 7, tooltips 6) | 174 | 167 | 7 | 0 | 0 | 7 fails = `/app/domains/new` swallowed by new `/app/domains/:id` route. Real regression. Fixed (route order). |
| Rerun (domains/new shell ×7, domain-change 5, domain-editor 2) | 14 | 14 | 0 | 0 | 0 | |
| Full suite earlier (before tooltip/pager work) | 134 | 122 | 13 | – | – | 13 known failures: `auth.spec` (2 "Log in" buttons), `public.spec` (home price assertions), `mobile.spec`; code not touched by this work; unconfirmed on pre-work baseline |

## Not run since last implementation changes
Rest of suite (about 43 spec files). Admin audit specs (need seed). API tests (need `TEST_DATABASE_URL`). No test is VERIFIED yet.

## Known gaps
- Stubs only: no real API, no real payment, no WebAuthn authenticator.
- Admin area not audited after shared DataTable/Panel changes.
- 200% zoom, software keyboard, real device not tested.
