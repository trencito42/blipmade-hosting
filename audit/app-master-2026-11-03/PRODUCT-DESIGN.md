# Blipmade Customer App 3.0 — Product Design, Navigation & Premium Component System

**State:** Final product architecture proposal, not implemented code. Use with VIEW-MATRIX, FUNCTIONAL-SECURITY, EDITOR-ROUTES, IMPLEMENTATION-QA. **Source:** main 3770515b4a5122fb83f27728ad1f6507e61d1bb2 on 2026-11-03.

## 1. North star
Blipmade customer area must be a delightful **self-service hosting control plane**, not a simplified copy of admin. One familiar, calm design for provisioning, operating apps/DBs/VPS/mail/domains, support and billing. It must remain approachable to beginners and powerful enough for experienced operators.

Use original Blipmade tokens, fonts, Font Awesome and shared ui-app.tsx primitives. Admin-only permissions and private staff info must not leak into customer components. Build safe shared foundations with admin where practical: Button, ButtonGroup, Input, MultiSelect, DateRangePicker, MoneySummary, DataGrid, ContextMenu, confirmation, StatusBadge, AsyncState, resource state and UnitStepper.

**Not generic 2024 UI:** avoid endless cards, native select for complex choices, disconnected button pills, repeated giant forms, fake glassmorphism, giant dashboard charts without actions and arbitrary flashy animations. Motion is restrained and useful; state is always explained.

## 2. Primary navigation and IA

Existing nine destinations remain:
- **Overview** /app: health, actions, services, activity.
- **Deploy** /app/deploy: catalog + choose/configure/buy.
- **Apps & Databases** /app/instances: instance fleet and technical workspaces.
- **Servers** /app/vps: VPS fleet / server controls.
- **Domains** /app/domains: app/custom hostname routing and TLS.
- **Email** /app/mail: mail subscription, domain/MX/aliases/mailboxes.
- **Billing** /app/billing: subscriptions, invoices, orders, payment methods.
- **Support** /app/tickets: customer conversation list and agent chat entry.
- **Settings** /app/settings: account, security, notifications, privacy.

Notifications remain available from header bell, deep-linked /app/notifications, not added as extra primary sidebar clutter. Existing /app/servers and /app/servers/:id must continue redirecting to VPS preserving ID.

**Recommended mobile bottom navigation:** Overview, Services, Deploy, Support, More. Services uses a segmented or drill-down picker for Apps and VPS, avoiding an Apps-only destination if the customer buys VPS; More exposes Email, Domains, Billing and Settings quickly. If previous bar is retained initially, test discoverability before changing it. All items must be reachable one-handed, and active route highlighted.

### App shell
- Sidebar mobile drawer/desktop collapsible group; active selection, breadcrumb, global search across **only the customer's own** resources.
- Top bar: context/status, search (Cmd+K), notification center, account menu.
- Resource/workspace subnav is specific to product type, not 15 new root sidebar items.
- If a customer has no services, use one onboarding/quick-deploy state instead of five giant empty panels.
- Onboarding checklist should reflect real state (verified email, chosen service, first deploy, 2FA optional) and be dismissible and resumable.
- User's local time zone for displayed dates, UTC storage, invoices reflect legal issue timezone when necessary.
- Clear product status: queued, provisioning, ready, degraded, suspended, cancelled, pending payment, failed, archived. Unknown/unavailable is never shown as healthy.

## 3. Page anatomy and density

### Overview
At desktop 1440x900: contextual greeting, one primary action, attention-needed banner, concise summary of Services and Billing, compact recent activity. No content-heavy hero eating one third of viewport. Show only top critical events and a "View all" link.

### Inventory
Title, one action ("Deploy", "Add domain" or "New server"), compact filter row, active filters, table/list:
- desktop 40-56px rows with status, owner/resource, plan, renewal, health and quick details;
- tablet/mobile responsive cards/rows with the most important two facts; no horizontal page overflow;
- filter/search from server when paging, sort, saved personal views where valuable. Keep this simpler than admin: defaults My services, Running, Attention needed.
- row click opens resource workspace; secondary quick actions in menu.

### Workspace/detail
Sticky resource header: service icon/name, verified status, node/region (when appropriate), IP/address (copy), plan, live state age and one action group.
Tabs: only capabilities meaningful to this resource and plan. Group complexity into Overview, Manage, Files/Console, Backups/Network/Advanced when necessary; for instance-specific features preserve existing tab deep links.
Each tab a bounded, independently loading workspace. Avoid multiple independent huge cards for absent relations. Dangerous actions in Settings/Safety section with dedicated workflow URL.

### Dedicated create/edit
Every meaningful persistent create/edit/configuration task has separate page URL, not a large modal, as the owner requested:
- intro/title and StepIndicator (when multi-stage)
- specific controls and field help; optional right-side real-time quote/impact/validation preview
- sticky bottom Save/Continue/Back/Discard, dirty guard, 409 version conflict
- validation + backend allowed limits, no hardcoded hidden constraints
- final review page for financial, destructive, reinstall, permissions, backing up/restore, service deletion
- multi-field editors may have side-nav of sections, but not a 3000px single column
- small modal permitted only for confirmation, copy/reveal secret, quick selector or tiny isolated non-persistent action
- inline terminal, code editor and ticket composer are **workspaces**, not form edits, and appropriately remain inline.

## 4. Premium, purpose-specific components (shared safely with Admin 3.0)

### A. Interactions and inputs
1. **ButtonGroup:** seamless shared border and correct first/last outer radii; examples Start / Restart / Stop, with access checks and disabled reason; don't make dangerous Stop default.
2. **SplitButton:** default safe action plus related menu, only where semantically appropriate.
3. **NumberStepper / UnitStepper:** vCPU, RAM MiB/GiB, disk, quotas, backups retention, retries (backend min/max/step), +/− buttons grouped, typeable exact values, real validation. Prevent disk shrinking unless provider allows.
4. **ResourceSliderStepper:** unified slider + typed stepper + plan capacity + price impact, with marked tiers and provider headroom.
5. **PlanCompareCards:** real server-provided plan prices/features/tier, current plan highlighted, selected state and incompatible upgrade/downgrade clearly disabled with explanation.
6. **BillingPeriodSegmented:** Monthly / Yearly where available, showing total, discount and VAT without obscuring currency.
7. **QuoteSummary:** sticky right review card on wide layouts; on mobile collapsed sticky review footer. Money exact with currency, fees and possible immediate/pro-rated impact.
8. **AsyncCombobox:** service, domain, mailbox, node/region, linked ticket; async paged results with keyboard, no raw IDs.
9. **Tag/MultiSelect:** for appropriate user-chosen tags, not disguised arbitrary account privileges.
10. **FilterBuilder lite:** search/status/type/region/health/renewal; advanced panel when necessary, chips and saved views optional.
11. **DateTime/Range Picker:** cron scheduling, renewal, invoices, backup run, with timezone label and DST awareness.
12. **CronBuilder:** human-friendly "every day 02:00" editor with cron expression preview, schedule type and timezone, advanced raw cron option; validate actual Pterodactyl support.
13. **DNSRecordInspector:** hostname, type, expected vs observed value, TTL and authoritative last check; Copy and Verify with clear propagation guidance. Domain IDN/punycode handling.
14. **DomainInput / SSHKeyField / IPAddressField:** typed validation; public key only and warnings, no private key paste or logs, supported ED25519/RSA limits from API.
15. **SecretField/OneTimePassword:** secrets hidden by default; reveal/copy is permissioned, one-time shown with explicit confirmation when saved. Never persist full values in analytics.
16. **MoneyInput:** only where customer is authorized to specify amount (topup/credit if supported); not invent manual price edits.
17. **SecurityCodeInput:** accessible 2FA OTP, paste support and screen reader labels, no auto-submit while incomplete.
18. **FileDropzone + UploadManager:** drag/click/keyboard, per-file size/quota, checksum/retry/cancel, safe path, progress and errors.
19. **CodeEditor / EnvEditor:** syntax aware, variable key/value rows, masked secrets and autocomplete; full screen for editing .env/source when requested, unsaved draft, checksum/mtime conflict.
20. **PermissionRoleCards:** share instance viewer/manager permission with clear exact capabilities and expiration if API supports it.
21. **RichTextComposer:** support ticket with attachment previews, draft and clear send confirmation, safe Markdown/HTML handling.
22. **RadioCards/ChoiceCards:** ISO, OS, billing term, email plan, image/stack, region; not giant bordered forms for 2 choices.
23. **Switch with effective state:** notifications/uptime alerts, where reversible and server backed.
24. **ContextualActionMenu:** advanced/danger actions separated with relevant consequences; keyboard and mobile.

### B. Data presentation and workspaces
25. **CustomerDataGrid:** server paging/search, column toggles on advanced lists, mobile card mode, robust empty/loading/error.
26. **ResourceHeader:** ID copy, status with freshness, essential limits, related billing/subscription and safe action group.
27. **ServiceHealthPanel:** provider observed status/last update, resource usage with units, unknown not green.
28. **StatusTimeline:** provisioning, checkout, DNS ownership and ticket state, real events not mock delays.
29. **ActivityTimeline:** customer's own scoped business/operational events, bounded grouped, no admin internal notes.
30. **FileExplorer:** tree/breadcrumb, selection, keyboard operations, context actions, upload/drop target, editor tabs, virtualized list where needed, mobile usability.
31. **ConsolePanel:** streaming, connection state, keyboard safety, command history only as permitted and never use secret logging; stop accidental command replay.
32. **DatabaseList/CredentialViewer:** DB names, hosts, users, create/reset/backup; secret disclosure with one-time secure interface.
33. **BackupList/RestoreReview:** size, created, status, retention, download; restore preview/invalidation and final confirmation, not one click.
34. **DNSHealthPanel:** copyable recommended MX/SPF/DKIM/DMARC/ownership records, observed/required, retry and last check.
35. **UsageGraphs:** real time-series, units, timestamps and empty/no telemetry/lagging warning, not decorative.
36. **SnapshotGallery:** creation and restore history, storage/size quotas, provider readiness, irreversible operations gated.
37. **BillingTimeline:** order created, checkout, paid, invoice, renewal, cancelled, suspended; server state and references.
38. **NotificationInbox:** category/unread filter, batch read, clear sensitive content boundaries, contextual destination.
39. **EmptyState:** action-driven, one concise statement and one recommended next action.
40. **AsyncState/Skeleton:** correct partial load, retry and provider downtime, never numeric 0 as failed fetch.
41. **Toast/InlineError:** actionable and precise, not fake "Saved" before server confirms.
42. **UnsavedChangesGuard:** browser back, close tab and SPA navigate appropriate warning; safe draft restore.
43. **FocusPopover/Tooltip:** keyboard and touch-safe; disabled reason visible without only hovering.
44. **AdaptiveTabs:** deep-linked, keyboard/ARIA, horizontally scroll with indicator rather than wrap into 6 lines.

## 5. Microinteractions
- Animated but restrained: 140-220ms ease for toggles/menu, 250-350ms for navigation/sheet, reduced-motion compliance.
- No layout jump on loading or tab change, skeleton matches final row/card.
- Buttons show pressed/disabled state and stable width when loading.
- Group controls have proper shared corners/borders/focus ring, not 3 independent pill buttons.
- List hover clarifies click target, row focus navigation; critical action not accessible only via hover.
- Form fields show constraints, context, and immediate precise validation; advanced controls feel native, not gimmicky.
- Interactive terminal/editor optimized for latency and focus; do not animate log entries just for style.
- 320-430px controls have minimum touch target and accessible feedback; safe-area aware sticky footers.

## 6. Consistency with /admin and reuse rules
- Shared primitive components live in a safe shared design folder; user-facing resources use a customer-friendly wrapper.
- Shared ButtonGroup/Stepper/DataGrid/DateRange/Popover only when generic and not permission-leaky.
- Never import admin-specific customer identities, actor/audit/internal notes into /app.
- Consumer data always sourced from customer-authenticated API, not admin endpoints, and object ownership validated for share/subuser access.
- Designs preserve brand tokens and Font Awesome, avoid competitor clones.

## 7. Product principles
- One page, one primary job. No unnecessary alternate pathways to the same edit flow.
- Buy/deploy is a transaction with explicit total and state, not a giant inline card.
- Infrastructure is technical, but defaults should be understandable and advanced settings disclosed on demand.
- The client can always find what failed, whether money was taken, who to contact and how to recover.
- Unavailable functions must not be fake-enabled. If backend API does not implement desired function, implement it or clearly explain unavailable.
- **All existing app behavior must remain and be verified; no data deletion, destructive migration, or production deployment in design phase.**
