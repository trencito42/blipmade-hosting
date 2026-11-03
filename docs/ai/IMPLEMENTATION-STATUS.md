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
| Route | Status | Remaining |
|---|---|---|
| /app Overview | IN_PROGRESS | cross-product alerts, activity beyond apps |
| /app/deploy, /:slug | IMPLEMENTED | `?step=` flow exists (Configure/Payment/Deploy); region/plan cards via #20 |
| /app/instances (+redeem) | IMPLEMENTED | filters type/node, saved views |
| /app/instances/:id workspace | IMPLEMENTED | tab grouping (issue #19) |
| Instance editors (settings, startup, env, resources, git, backups, schedules, databases, network, access, reinstall) | IMPLEMENTED | access share edit blocked (no API) |
| /app/domains (+new, :id, edit, delete) | IMPLEMENTED | TLS/readiness status (issue #23) |
| /app/mail, domain workspace, editors | IN_PROGRESS | DNS tab page (DNS is inline panel) |
| /app/vps list + 6 editors | IMPLEMENTED | VPS workspace header, checkout review step |
| /app/billing tabs, order, subscription pages | IMPLEMENTED | credit/history tabs (no history API) |
| /app/tickets list, new, :id | IN_PROGRESS | conversation workspace header; sticky reply done |
| /app/settings (profile, billing address, email, password, 2FA, passkeys, API keys, closure) | IMPLEMENTED | sessions page, notification prefs stay inline |
| /app/notifications | IMPLEMENTED | grouped sections |

## Admin 3.0
IN_PROGRESS. 35 admin routes. Done: `/admin/products/:id/edit` (first dedicated admin editor, shell `layout: 'editor'`). Not done: Customer 360 tabs, Activity Explorer, other editors (orders, VPS, pricing, staff, notifications, content, settings, bots, automations, promotions still inline/overlay editors). Spec: `audit/admin-master-2026-11-03/*`. Shares tooltip/table/pager components; DataTable restyle already affects admin (unverified).

## GitHub issues
#18 NOT_STARTED · #19 NOT_STARTED · #20 NOT_STARTED · #21 NOT_STARTED (BLOCKED on finance/legal) · #22 NOT_STARTED · #23 NOT_STARTED (BLOCKED on Cloudflare credentials).
