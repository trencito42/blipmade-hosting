# Implementation status

Legend: NOT_STARTED · IN_PROGRESS · BLOCKED · IMPLEMENTED (code + targeted tests pass) · VERIFIED (full E2E pass, evidence in TEST-STATUS.md). Nothing is VERIFIED until the final full E2E run passes.

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
IN_PROGRESS. 35 admin routes. Done (dedicated editor routes, `layout: 'editor'`, stubbed e2e via `web/e2e/admin-stub.ts`): `/admin/products/:id/edit`; promotions `/new` + `/:id/edit`; support bots `/new` + `/:id/edit`; automations `/new` + `/:id/edit`; `/admin/staff/:id/permissions/edit`; incidents `/new`, `/:id/updates/new`, `/admin/announcements/new`; knowledge `/new` + `/:id/edit`; `/admin/content/:key/edit`; `/admin/email-templates/:id/edit`; `/admin/settings/:section/edit` (company, operator groups, advanced); `/admin/pricing/rates/edit`, `/admin/pricing/products/:id/edit`; `/admin/orders/:id/refund` + `/retry`; `/admin/vps/:id/plan/change` + `/resources/edit`; `/admin/customers/:id/credit/adjust` + `/notes/new`; `/admin/mail/plans/new` + `/:id/edit`; `/admin/support/settings`; `/admin/services/:id/limits/edit`; `/admin/audit/:id` (new API `GET /admin/audit/:id`, tested); `/admin/notifications/templates/:id/preview` + `/test`; `/admin/customers/:id/account-action`; `/admin/abuse/:id/enforcement`; `/admin/products/new`; `/admin/ops/incident/declare`; `/admin/customers/:id/profile/edit` + `/security` + `/admin/customers/bulk-edit`; `/admin/pricing/addons/new` + `/:id/edit` + `/discounts/edit`; `/admin/services/import`; `/admin/orders/:id/partial-refund`. Not done (each needs new API or product decision, so no placeholder pages): Activity Explorer (`/admin/activity`), reports custom/exports, queue job detail pages, infrastructure node detail/edit, abuse reopen page, mail plans, infrastructure nodes/templates, tools run, notifications transports, support settings/macros, abuse enforcement, customer 360 tabs and actions, Activity Explorer, add-ons/yearly-discount editors inside Pricing, bulk actions. Spec: `audit/admin-master-2026-11-03/*`.

## GitHub issues
#18 NOT_STARTED · #19 NOT_STARTED · #20 NOT_STARTED · #21 NOT_STARTED (BLOCKED on finance/legal) · #22 NOT_STARTED · #23 NOT_STARTED (BLOCKED on Cloudflare credentials).
