# Implementation status

Legend: NOT_STARTED · IN_PROGRESS · BLOCKED · IMPLEMENTED (code + targeted tests pass) · VERIFIED (full E2E pass, evidence in TEST-STATUS.md). Nothing is VERIFIED until the final full E2E run passes.

## Launch-hardening branch review (Task C)

IN_PROGRESS. The branch contains 56 patches absent from `main` by patch-id. Nineteen security/operations patches are now ported by hand: exact WebSocket console origin validation (`c68b2a1`, `8408bf5`, `a378c48`), command-secret persistence coverage (`6a7cb6a`), atomic password-reset and email-verification token consumption with race tests (`b7d7918`, `945a7cc`, `dfa1a1c`, `bfaa1ce`), trusted-proxy rate-limit keys (`685be5c`, `ff778d6`, `38cdbbc`), cryptographic Pterodactyl bootstrap passwords (`702d967`, `7225311`), and independent versioned data encryption plus a typed dry-run-first migration and runbook (`0780e91`, `bbb0367`, `e212b05`, `bfa70ee`, `f45f568`, `3155ca4`). The migration was expanded for current `main` to cover TOTP and Git webhook secrets as well as the old branch's panel/instance fields. Review the remaining commits against current `main`; classify every patch as already present, port, or obsolete. Never merge the old branch. Security and billing changes remain undeployed pending owner approval; re-encryption remains explicitly unexecuted.

CI patch `793261c` is also ported: Gitleaks v3 now receives the GitHub token through its supported environment contract while comments remain disabled.

Billing/capacity review ported the missing compare-and-set guards and their regression coverage: stale Stripe failures and checkout expiry cannot demote terminal state; paid transition and promotion redemption are atomic; cancellation is idempotent; allocated CPU remains reserved until deprovisioning; free upgrades cannot revive/inject orders; refunds require provider status `succeeded`; payment replay repairs a missing invoice. The atomic invoice-number implementation from `c022b5e` was already present in `main`; its concurrent test from `4e55a90` is now restored. No payment, refund, or reconciliation was executed.

Signed Pterodactyl downloads are ported from the final old-branch design: the panel's `signed_url` envelope is resolved server-side, every HTTPS destination/redirect is checked against an exact operator allowlist, large file/backup bodies are streamed without whole-response buffering, and browser disconnect closes the upstream stream. Deployment remains blocked on the operator setting and validating `PTERODACTYL_DOWNLOAD_HOSTS`.

All 56 old-branch commits now have an explicit decision in `docs/ai/LAUNCH-HARDENING-REVIEW.md`: ported, already present, or superseded. Task C code review/porting is complete, but remains IN_PROGRESS rather than IMPLEMENTED because the required disposable-database API suite and operator staging checks have not run.

## Approved Admin follow-up (Task A)

IN_PROGRESS. Staff role/permission step-up is complete in code: session-scoped ten-minute confirmation by password or TOTP, server enforcement, audit events, migration, API coverage, and a responsive accessible Review → confirm → Save flow in `StaffEdit`. Web typecheck/unit/build and targeted E2E pass. Database API tests remain unavailable, so the feature is not marked IMPLEMENTED/VERIFIED yet.

Saved Views and Column Picker are complete in code and deployed at `34e850d` across Customers, Orders, Services and Tickets. Views are private `AdminSavedView` rows with strict scopes, bounded flat query state, duplicate-name handling and owner-scoped deletion; each list saves and reapplies its real filters and sort. Column choices use guarded `localStorage`, preserve required columns, work when storage is unavailable, and never affect the mobile cards. API typecheck, web typecheck/unit/build, targeted desktop/390px E2E and production smoke checks pass. Database API test execution remains unavailable, so Saved Views is not marked VERIFIED.

## App shell and design system
| Feature | Status | Paths |
|---|---|---|
| Editor layout (`layout: 'editor'`, back in top bar, one h1) | IMPLEMENTED | `web/src/routes.tsx`, `web/src/ui-app.tsx` AppShell, `web/src/app/components/premium.tsx` PageEditorShell |
| Custom tooltip (`data-tip`), InfoTip, quiet mode | IMPLEMENTED | `web/src/tooltip.tsx`, `ui-app.tsx` Panel/Field/buttons |
| Inventory pattern: card, clickable rows, Pager, `getAll` pages | IMPLEMENTED | `ui-app.tsx` DataTable/usePaged/Pager, `lib/api.ts` getAll |
| Top bar primary action per list page | IMPLEMENTED | `routes.tsx` contextAction |

## App routes (VIEW-MATRIX)
Phone bar: Overview, Services (apps, servers, domains, email via switch on each page), Deploy (round), Support, More (all pages). IMPLEMENTED (`web/src/nav.ts`, `ui-app.tsx` AppShell `servicePages`).
| Route | Status | Remaining |
|---|---|---|
| /app Overview + /app/activity (apps+servers merged, paged) | IMPLEMENTED | – |
| /app/deploy, /:slug | IMPLEMENTED | `?step=` flow exists (Configure/Payment/Deploy); region/plan cards via #20 |
| /app/instances (+redeem, type and node filters) | IMPLEMENTED | renewal filter, saved views (not needed) |
| /app/instances/:id workspace (sticky header, power group, primary tabs + More) | IMPLEMENTED | game-aware grouping (issue #19) |
| Instance editors (settings, startup, env, resources, git, backups, schedules, databases, network, access, reinstall) | IMPLEMENTED | access role edit via PATCH /instances/:id/access/:shareId (tested) |
| /app/domains (+new, :id, edit, delete) | IMPLEMENTED | TLS/readiness status (issue #23) |
| /app/mail, domain workspace (tabs deep-linked `?tab=`), editors, email checkout (plan choice, term, review `?step=review`) | IMPLEMENTED | domain availability check (no API) |
| /app/vps list + 6 editors + header + checkout review (`?step=review`, key never in URL) | IMPLEMENTED | list has search, sort, status chips (tested with 30) |
| /app/billing tabs (overview, subscriptions, orders, invoices, payment method, credit, history), order, subscription pages | IMPLEMENTED | history is orders+invoices merged client-side |
| /app/tickets list, new, :id (compact header, sticky reply) | IMPLEMENTED | – |
| /app/settings tabs: Profile, Security, Sessions, API keys, Notifications, Privacy & data (+ editors) | IMPLEMENTED | notification prefs have own page `/app/settings/notifications` |
| /app/notifications (grouped Today/Yesterday/Earlier) | IMPLEMENTED | – |

## Admin 3.0
IN_PROGRESS. 35 admin routes. Done (dedicated editor routes, `layout: 'editor'`, stubbed e2e via `web/e2e/admin-stub.ts`): `/admin/products/:id/edit`; promotions `/new` + `/:id/edit`; support bots `/new` + `/:id/edit`; automations `/new` + `/:id/edit`; `/admin/staff/:id/permissions/edit`; incidents `/new`, `/:id/updates/new`, `/admin/announcements/new`; knowledge `/new` + `/:id/edit`; `/admin/content/:key/edit`; `/admin/email-templates/:id/edit`; `/admin/settings/:section/edit` (company, operator groups, advanced); `/admin/pricing/rates/edit`, `/admin/pricing/products/:id/edit`; `/admin/orders/:id/refund` + `/retry`; `/admin/vps/:id/plan/change` + `/resources/edit`; `/admin/customers/:id/credit/adjust` + `/notes/new`; `/admin/mail/plans/new` + `/:id/edit`; `/admin/support/settings`; `/admin/services/:id/limits/edit`; `/admin/audit/:id` (new API `GET /admin/audit/:id`, tested); `/admin/notifications/templates/:id/preview` + `/test`; `/admin/customers/:id/account-action`; `/admin/abuse/:id/enforcement`; `/admin/products/new`; `/admin/ops/incident/declare`; `/admin/customers/:id/profile/edit` + `/security` + `/admin/customers/bulk-edit`; `/admin/pricing/addons/new` + `/:id/edit` + `/discounts/edit`; `/admin/services/import`; `/admin/orders/:id/partial-refund`. Also done: `/admin/activity` (Activity Explorer, audit filters targetId/from/to added to `GET /admin/audit`), `/admin/reports/exports` (CSV, formula-safe), `/admin/queues/:name/jobs/:id` (new API `GET /admin/queues/:name/jobs/:id`, data never shown), `/admin/infrastructure/nodes/:id` (new API `GET /admin/infrastructure/nodes/:id`; node is owned by the panel, read-only), `/admin/abuse/:id/reopen`. Remaining Admin: only items of the blueprint that need product decisions (saved views, column picker, step-up for staff roles, RTE for templates).
