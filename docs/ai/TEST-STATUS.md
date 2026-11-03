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

## Batches after App completion (2026-11-03, logs /root/e2e-logs)
| Batch | Tests | Pass | Fail | Notes |
|---|---|---|---|---|
| B2 targeted (vps, ticket, instance-tab-rows, list-pages, tooltips) | 21 | 21 | 0 | after fixes |
| C00 (first third of rest) | 45 | 43 | 2 | real bug: `withTip` named buttons by tip text (children destructured) → fixed in ui-app.tsx; domain test attr → `data-tip`. Rerun C00b/C00c: 16/16 pass |
| C01 (second third) | 28 | 28 | 0 | |
| C02 (last third) | 80 | 67 | 13 | 13 known auth/public/mobile failures. PROVEN pre-existing: same 13 fail on deployed commit 3158b3c (31 pass / 13 fail on auth+mobile+public specs). Causes: login screen has 2 'Log in' buttons (strict-mode selector), public home price assertions, mobile `waitForLoadState` timeout. Public-site tests, outside App/Admin 3.0 scope; not fixed. |
| Unit | 498 | 497 | 0 | 1 skip |

Root causes fixed this round: route order (`/app/domains/:id` before `/new`), InfoTip aria-label "About X" ambiguity with `getByLabel('X')`, `withTip` aria-label bug.

Later targeted runs: instance specs 38/38 (18 files), instance tabs grouping 7/7; phone-nav 3/3, notification rows+grouping 3/3, large lists 7/7, unit 497/0.

Note: `tests/admin-ticket-inbox.test.ts` asserted the literal word "hour" in a relative time computed from the real clock; it failed once the clock moved past the fixture window. Assertion widened to minute/hour/day. Test was time-dependent, not a regression.

## App-complete regression (2026-11-03, /root/e2e-logs/R*.log)
R0 207/207 pass. R1 40 run, 1 fail = real race in notifications `loadMore` (button + observer both loaded same cursor → duplicates): fixed with ref guard + dedupe by id, 3/3 stable reruns. R2 89 run: 76 pass, 13 fail = the 13 known pre-existing (auth/public/mobile, proven on 3158b3c). TOTAL App regression (48 spec files, audit specs excluded): 337 executed, 324 pass (after the notification fix), 13 fail (all pre-existing, public site/login), 0 skipped, 0 timed out. Unit 497/0. Admin audit specs and API tests not run.

## Not run
Admin audit specs (need seed `admin-audit-seed.json`). API tests (no DB). Admin UI audit. No test is VERIFIED yet.

## Task A / Task C checkpoint (2026-11-03)

- `cd api && PATH=/opt/node22/bin:$PATH npm run typecheck`: pass after the staff step-up backend and API tests were added.
- API runtime tests remain not run: `TEST_DATABASE_URL`, `DATABASE_URL`, `REDIS_URL`, and `SESSION_SECRET` are absent in this workspace. The new step-up state is therefore IN_PROGRESS, not IMPLEMENTED/VERIFIED.
- Launch-hardening review started after `cd20e9f` made Task C the first priority. The console-origin/command-privacy group was manually ported; API typecheck passes. The focused Vitest command could not start because global setup requires a disposable database, so no runtime pass is claimed.
- Trusted-proxy limiter and panel-bootstrap randomness patches: API typecheck passes. Their Vitest files also require the unavailable disposable database, so runtime coverage remains not run.
- Password-reset/email-verification concurrency patches: API typecheck passes; the new database race tests could not be run without the disposable test stack.
- Versioned credential encryption: API typecheck (including the migration script) passes. Secret-rotation Vitest and migration preflight were not run: the suite lacks its disposable database stack and the migration must only run with operator-provided keys against an approved target.
- Gitleaks workflow input was corrected to its v3 environment contract; the GitHub-hosted workflow has not yet reported a result for this commit.
- Billing/capacity hardening: API typecheck passes with webhook, cancellation, promotion-race, refund-state, invoice-replay/numbering, free-upgrade and retained-capacity tests. Runtime tests remain not run without the disposable database/Redis stack; no external Stripe call was made.
- Signed Pterodactyl downloads: API typecheck passes with stream/SSRF/redirect coverage. Runtime tests and proxy-chain large-file/interruption validation remain not run; `PTERODACTYL_DOWNLOAD_HOSTS` requires operator input before deploy.
- Task C classification: 56/56 commits have recorded decisions in `docs/ai/LAUNCH-HARDENING-REVIEW.md`. Final API typecheck passes after the remaining stale limiter assertion was repaired. Full runtime verification is still pending the disposable stack.
- Staff step-up UI: web TypeScript clean; unit 499 total / 497 pass / 0 fail / 2 skip; production build and prerender pass; `admin-staff-edit.spec.ts` 2/2 pass (desktop flow plus 390px). API runtime coverage remains not run without the disposable stack.
- Saved Views/Column Picker: API and web TypeScript clean; web unit 499 total / 497 pass / 0 fail / 2 skip; production build and 172-page prerender pass; `admin-list-preferences.spec.ts` 2/2 pass (save/reapply/browser persistence plus all four lists at 390px). API tests are written for scope, validation and cross-operator isolation but not run without the disposable database stack.
