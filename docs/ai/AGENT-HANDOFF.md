# Agent handoff

Updated: 2026-11-03.

- Branch: `audit/admin-master-spec-20261103` (working copy `/root/work`). Remote: GitHub via relay (`~/relay` on VM103). Push: `git push -f relay HEAD:refs/heads/incoming` then on VM `cd ~/relay && git push origin incoming:audit/admin-master-spec-20261103`. Do NOT push `main`, merge, or deploy without explicit user approval (latest instruction).
- Production = `main` @ 3158b3c deployed (VM103 `/opt/blipmade`). `main` on GitHub = 90df83d (published with user approval, not deployed).
- Objective: finish App 3.0 (then Admin 3.0), incremental targeted checks, UI audit, then full E2E in controlled batches.

## Done
Editors, shell, tooltip layer, inventory pattern, paging, billing tabs/pages, domain detail, access-code page. See IMPLEMENTATION-STATUS.md.

## Uncommitted at time of writing
Commit after this file includes: Billing payment tab, DomainDetail + route order fix, Instances redeem route, Tickets sticky reply, Settings tab rename, docs/ai/*.

## Next
1. Overview cross-product alerts. 2. Instance workspace sticky header + power group. 3. VPS workspace header. 4. Deploy wizard `?step=`. 5. Mail DNS tab. 6. Admin 3.0 (spec in `audit/admin-master-2026-11-03`). 7. UI audit of every route. 8. Full E2E batches (`--workers=4`, logs in `/root/work/e2e-logs`).

## Known
- Route order in `web/src/routes.tsx` matters: specific patterns before `:id`.
- 13 pre-existing E2E failures (auth/public/mobile specs) listed in TEST-STATUS.md.
- Never `pkill -f` with a pattern that matches your own command line (kills the shell).
- Hypervisor cannot reach GitHub; VM103 can (public API works without token).

## Blockers
See OPERATOR-ACTIONS.md.
