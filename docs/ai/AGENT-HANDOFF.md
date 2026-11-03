# Agent handoff

Updated: 2026-11-03 (handoff to the next agent, MiniMax, requested by the user).

## State
- Branch `audit/admin-master-spec-20261103`, working copy `/root/work`, clean tree at last update. GitHub audit branch = latest commit (`git log -1`). `main` published with user approval; production deploy NOT requested.
- Production (VM103 `/opt/blipmade`) = `main` @ 3158b3c. Newer commits are NOT deployed. Deploy only on explicit user approval: `ssh -i /root/.ssh/blipmade_vm103 debian@10.77.0.13 'cd /opt/blipmade && bash scripts/deploy.sh'` (from hypervisor).
- App 3.0: implemented (see IMPLEMENTATION-STATUS.md). Admin 3.0: only `/admin/products/:id/edit` done; 34 admin routes remain.

## Rules from the user (keep)
- Terse replies (Caveman). Minimal code (YAGNI).
- Finish App before Admin (done). Then Admin. Full E2E only at the end, in sequential bounded batches.
- No merge/deploy without explicit user approval. Commit + push often; update these docs at each checkpoint.
- Never print/store secrets. Kill processes by PID, never `pkill -f` with a pattern matching your own command line.

## How to work
- Edit in `/root/work/web`. `export PATH=/opt/node22/bin:$PATH`. Check: `npx tsc --noEmit`, `npm test` (497 pass), `npm run build` (needed before Playwright; server serves `dist`).
- E2E: `PLAYWRIGHT_JSON_OUTPUT_NAME=/root/e2e-logs/X.json npx playwright test <specs> --workers=4 --reporter=list,json > /root/e2e-logs/X.log 2>&1; echo EXIT=$?`. Spec stubs must include `/announcements` → `{announcements: []}` or pages crash.
- Push: `git push -f relay HEAD:refs/heads/incoming` then `ssh -i /root/.ssh/blipmade_vm103 debian@10.77.0.13 'cd ~/relay && git push origin incoming:audit/admin-master-spec-20261103'`. `bash scripts/publish.sh` publishes `main` (needs clean tree, only with user approval).
- Patterns: see DECISIONS.md. Editor route example: `web/src/app/DomainChange.tsx`; admin: `web/src/admin/ProductEdit.tsx`. Route order matters (`web/src/routes.tsx`): specific before `:id`.

## Next concrete actions
1. Admin 3.0 (spec `audit/admin-master-2026-11-03/EDITOR-ROUTE-BLUEPRINT.md`, `PREMIUM-COMPONENTS.md`): move overlay/inline editors to routes — Promotions, SupportBots, SupportAutomations first, then orders, VPS resources, pricing, staff, notifications, content, settings. Then Customer 360 tabs, Activity Explorer. Admin is not in quiet mode.
2. UI audit of admin routes; app routes with large data.
3. Final: build, full Playwright batches incl. audit specs (need `admin-audit-seed.json`), fix regressions, update TEST-STATUS.md.
4. Issues #18–#23: proposals only; see MASTER-ROADMAP.md / OPERATOR-ACTIONS.md. Do not start without product-owner go.

## Known failures
13 pre-existing e2e failures (auth/public/mobile specs), proven on 3158b3c. Not caused by this work.

## Blockers
OPERATOR-ACTIONS.md (rotate MiniMax key, support email placeholder, deploy approval, issues #21/#23 prerequisites).

Continuation prompt for another agent (Admin functions with recommended defaults, then issues #18-#23): `docs/ai/CONTINUE-PROMPT.md`.
