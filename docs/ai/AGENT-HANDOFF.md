# Agent handoff

Updated: 2026-11-03.

- Branch: `audit/admin-master-spec-20261103` (working copy `/root/work`). Remote: GitHub via relay (`~/relay` on VM103). Push: `git push -f relay HEAD:refs/heads/incoming` then on VM `cd ~/relay && git push origin incoming:audit/admin-master-spec-20261103`. Do NOT push `main`, merge, or deploy without explicit user approval (latest instruction).
- Production = `main` @ 3158b3c deployed (VM103 `/opt/blipmade`). `main` on GitHub = 90df83d (published with user approval, not deployed).
- Objective: finish App 3.0 (then Admin 3.0), incremental targeted checks, UI audit, then full E2E in controlled batches.

## Done
Editors, shell, tooltip layer, inventory pattern, paging, billing tabs/pages, domain detail, access-code page, compact sticky headers (instance, VPS) with grouped power buttons, admin product editor route. See IMPLEMENTATION-STATUS.md.

## Uncommitted
None at last update (branch HEAD = latest commit; `git log -1`). Branch pushed to GitHub audit branch; `main` last published at 872e1ba (user approved "pe main ma pune l"); later commits on audit branch only. Production deploy NOT requested.

## Next (in order)
1. Admin 3.0 dedicated editors: Promotions, SupportBots, SupportAutomations (overlay editors), then orders/VPS/pricing/staff/notifications/content/settings per `audit/admin-master-2026-11-03/EDITOR-ROUTE-BLUEPRINT.md`. Pattern: new route with `layout: 'editor'`, wrapper calls `useEditorBack`, one h1, list links to route (see `web/src/admin/ProductEdit.tsx`).
2. Customer 360 tabs + Activity Explorer (admin).
3. App leftovers: mail DNS tab, VPS checkout review step, tickets conversation header.
4. UI audit of every route (screenshots at 1440/390 with large data).
5. FINAL: build, then full Playwright in sequential batches (`--workers=4`, logs /root/e2e-logs), including audit specs (need `admin-audit-seed.json`). Fix regressions. Update TEST-STATUS.md. No VERIFIED without passing results.

## Known
- Route order in `web/src/routes.tsx`: specific before `:id`.
- Unit gate: `cd web && npm test` (496 pass). Last e2e batch A: 167/174 then fixed; rest of suite not rerun since headers/admin changes. Instance/VPS header e2e selectors (open-URL link text) may need updates.
- 13 pre-existing e2e failures (auth/public/mobile specs).
- Never `pkill -f` with pattern matching own command (kills shell). Kill by PID.
- Hypervisor cannot reach GitHub; use relay on VM103.

## Blockers
See OPERATOR-ACTIONS.md.
