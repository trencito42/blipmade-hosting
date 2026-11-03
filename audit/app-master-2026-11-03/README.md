# Blipmade Customer App 3.0 — Complete Design and Audit Master Plan

**Scope:** all 21 registered `/app` routes, 9 primary customer navigation entries, customer-facing API workflows, all main page modules and nested instance/mail components. Two original routes are legacy VPS redirects. **Source snapshot:** main `3770515b4a5122fb83f27728ad1f6507e61d1bb2` (2026-11-03).

**Status:** comprehensive current-code/UX/security source audit and complete proposed implementation architecture. **NOT a finished App 3.0 implementation, live browser assessment, penetration test or certified production release.**

**Important:** one single work branch: `audit/admin-master-spec-20261103`, PR #17. Admin 3.0 implementation and testing must be accepted before major /app code changes are merged, so shared design components do not diverge. /app is planned independently and must never expose internal staff-only data.

## New cross-cutting P1 visual QA finding (2026-11-03)

**[GLOBAL-SHELL-EDITOR-UX.md](./GLOBAL-SHELL-EDITOR-UX.md)**: product-owner screenshots revealed a global editor-shell defect, **not** a single email-page issue. Duplicate top-bar and editor `h1`, misplaced parent Back link, legal footer too high on short pages, detached viewport-fixed Save/Discard colliding with shell/mobile navigation. **Fix AppShell + PageEditorShell + route metadata globally before adding more dedicated editors**, execute short/long/mobile layout regressions, then resume the existing implementation order. This is a design-system correction, not a new project or a request to redo completed editors.

## Read in this order

1. **[VIEW-MATRIX.md](./VIEW-MATRIX.md)**: individually covers all 21 current routes; files, existing features, issues, target UX, fields/components and related destination pages.
2. **[PRODUCT-DESIGN.md](./PRODUCT-DESIGN.md)**: premium 2026 customer UI, navigation, density, microinteractions, 44 specialized controls and workspace patterns.
3. **[EDITOR-ROUTES.md](./EDITOR-ROUTES.md)**: 31 customer workflow families mapped to new full-page creation/edit/review routes, with exceptions for interactive console, files and ticket replies.
4. **[FUNCTIONAL-SECURITY.md](./FUNCTIONAL-SECURITY.md)**: functional/static findings, account/resource ownership, secrets, payment/provider safety and runtime test cases.
5. **[API-ROUTES.md](./API-ROUTES.md)**: read-only static scan of 18 relevant API modules, 219 literal route registrations (133 mutations), with source/line and auth hints. These are **not** executed tests or proven vulnerabilities.
6. **[VISUAL-AUDIT.md](./VISUAL-AUDIT.md)**: UX and responsive review of every route from source and the earlier user screenshots of /app Mail; old-vs-current caveats and visual sign-off checklist.
7. **[IMPLEMENTATION-QA.md](./IMPLEMENTATION-QA.md)**: phased rollout, route-by-route parity, ten end-to-end journeys, authorized user/share role checks and performance/accessibility gates.
8. **[IMPLEMENTATION-BRIEF.md](./IMPLEMENTATION-BRIEF.md)**: canonical ChatGPT Work/Codex task to implement **all /app UI and APIs**, using shared premium components with /admin safely.

### Prepared (not executed) browser evidence

[web/e2e/app-audit-readonly.spec.ts](../../web/e2e/app-audit-readonly.spec.ts): opt-in Playwright test with **21 routes × 6 widths = 126 read-only checks**, needing test customer storage-state, seeded detail resource IDs and an authorized staging base URL. Missing fixtures are skipped, not passed. Never use production customer data for screenshots.

## Explicit decisions

- All existing customer service capabilities remain, including Console, Files, Databases, Backups, SFTP, Git, Minecraft, Uptime, schedules, VPS snapshot/ISO/SSH/console, mail/DNS/mailboxes/aliases, billing, live chat, ticket attachments, notifications, 2FA/passkeys/API keys, account closure and export.
- Persistent significant create/edit/configuration, renew/cancel, resource change and dangerous actions have **dedicated page URLs**, not huge modals or giant forms underneath lists. Dialogs only for brief confirm/preview/one-time secret.
- Reuse the **existing** new MailOverview and MailDomainPage; they already represent recent improvements. Do not revert them based on old screenshots.
- Retain /app/servers and /app/servers/:id compatibility redirects.
- Unified customer-facing design shares safe primitives with /admin but not admin-only permissions, logs or internal notes.
- Stepper/sliders must obey actual provider capability and prices must be backend-authoritative, not hardcoded.
- All 21 original /app routes plus all applicable new editor paths must be covered in testing before saying the app is done.
- No merge/deploy, destructive migration or real payment/provider action without approval.

## Evidence limitations

Source-only issues are prioritized findings, not proof of live defects on the currently deployed revision. Real browser screenshots, role-scoped security tests, billing sandbox, DNS and provider operation tests, a11y and perf test results remain to be executed. Do not call this fully runtime verified.

## Parallel work / coordination

**Admin 3.0 specifications:** [audit/admin-master-2026-11-03/README.md](../admin-master-2026-11-03/README.md).
**Canonical branch:** audit/admin-master-spec-20261103; this directory is the complete App 3.0 sibling plan, intentionally under the same PR rather than creating more branches.

Implementation order: finalize reusable admin primitives -> build app-safe shared components -> implement and test /app in stages -> owner-approved merge/deploy only after staging acceptance.
