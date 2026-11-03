# Blipmade Admin 3.0 — Master product / engineering specification

**Date:** 2026-11-03  
**Repository:** trencito42/blipmade-hosting  
**Read snapshot:** main a5adf356e194ef01b46836915f0aad976e6184e1  
**Status:** proposed end state derived from code inspection, linked route matrix and user-supplied screenshots. **Not** an implementation or live browser certification.
**Companion:** [VIEW-MATRIX.md](./VIEW-MATRIX.md), covering every currently registered /admin route.

## 0. Executive decision

Rebuild the *experience*, not the business logic. Today Blipmade already has many serious administrative capabilities: services, customers, commerce, support bots, automations, reports, notifications, audit and privileged actions. The failures of experience arise from:
- too many unrelated panels in entity detail views;
- list controls not consistently exposing API cursor/search capabilities;
- each product family having a different visual density and action vocabulary;
- opaque cross-entity linking, especially VPS, mail, invoices and payment records;
- business KPIs calculated differently in separate contexts;
- activity journals scattered across multiple models and services;
- operational controls mixed with passive reports;
- a navigation designed around source modules rather than operator jobs.

**Success measure:** from any alert, payment, ticket, customer, VPS or instance an authorized operator should identify the customer, related paid contract, affected resource, state, last relevant action, source of failure, and safe next action without navigating through long unrelated pages.

## 1. Present platform facts and identified gaps

### Confirmed in current code
- \`web/src/nav.ts\`: 28 primary admin entries, grouped; \`web/src/routes.tsx\`: 35 admin pages, seven of them secondary/detail destinations. The menu is already collapsible, has persisted local state, and the shell already includes command palette navigation.
- \`web/src/ui-app.tsx\`: reusable Panel, StatTile, StatusPill, DataTable, CardList, Segmented, ConfirmDialog and related primitives. Extend this foundation, do **not** introduce a parallel design system.
- \`web/src/index.css\`: Hanken Grotesk / Bricolage Grotesque / JetBrains Mono; existing green/charcoal palette; Font Awesome integration.
- Customer Detail is 1,085 lines and stacks 11+ panels; Order Detail exposes order information plus up to 100 user-level audit events; Servers renders an action-heavy card per VPS; Mail, Ops, Notifications are broad multi-purpose screens.
- \`api/src/routes/admin.ts\`: customer list \`monthlyValue\` is the sum of prices for non-cancelled **instances only**. This is not platform-wide customer MRR; VPS and mail subscriptions are excluded. Customer \`totalSpent\` aggregates successful payment amounts without grouping currencies and does not directly subtract refunds.
- \`api/src/routes/admin-control.ts\`: global lookup supports customers, orders, instances, invoices, payments, app domains and VPS, but VPS search resolves to \`/admin/vps\` rather than an individual detail page. Invoice/payment lookup falls back to order or customer because dedicated financial object views are absent.
- \`web/src/admin/Support.tsx\`: unified conversation list with EventSource, presence and department controls; has-more results are announced without direct pagination in the console itself. Separate Ticket Inbox is now implemented with cursor flow; keep legacy URLs.
- \`web/src/admin/Abuse.tsx\` and nested abuse components: current main uses a newer paged inbox/detail design. Production screenshots may have been taken before this change; verify live deployment version before declaring it defective.
- \`web/src/admin/Capacity.tsx\` exists and queries \`/admin/capacity\`, but no matching page is registered in \`web/src/routes.tsx\`.
- \`api/src/lib/audit.ts\`: \`audit()\` writes \`AuditLog\` with actor/action/target/meta/IP and intentionally catches write failures, only logging the failure. Do not claim complete audit reliability.
- Additional event sources: \`Session.lastSeenAt\`, \`DeviceSignal\`, \`InstanceEvent\`, \`TicketEvent\`, \`NotificationEvent\`, \`MailDelivery\`, provider webhook events, order/payment/invoice/subscription records. They are not a single complete customer activity timeline.
- Successful sign-ins call \`recordSignIn\` in account-security service, whereas failed attempts are recorded by auth routes. Staff impersonation start/stop is already represented. Do not falsely label sign-in tracking absent.
- Support bots and automations already exist. Do not rebuild or delete their working data to accomplish navigation redesign.

### Unverified until browser/API/DB execution
Exact production rollout version, all role-specific routes, total source-to-event coverage, all server/provider failures, refund accounting against Stripe, full responsive appearance across 35 views, actual build/test pass, all saved control states. Static review can identify missing wiring, but cannot certify interactions or production correctness.

## 2. Recommended global information architecture

**Do not put all 28 links permanently expanded.** Keep the primary sidebar short, task-oriented and permission-aware; preserve each existing URL and show complex details only when relevant.

Suggested desktop groups (group labels are adjustable):

1. **Dashboard**: Overview.
2. **Customers & Billing**: Customers, Orders, Payments & Invoices (new), Promotions, Reports.
3. **Hosting**: Apps & Databases (existing Services), VPS, Email Hosting, Domains (new), Infrastructure/Capacity (one operating cluster).
4. **Catalog**: Products, Pricing, Mail Plans (secondary destination).
5. **Support & Trust**: Inbox, Knowledge, Bots & Automations (subsection), Analytics & SLA, Abuse, Incidents.
6. **Operations**: Health, Job Center, Backups (new or tab), Audit & Activity, Repair Tools (advanced).
7. **Communications**: Notifications, Template Library, Site Content.
8. **Team & Settings**: Staff, Security, Settings.

Only the current active group's children should need to appear expanded by default. More than one open group is fine if a user explicitly chooses it. Add favourites/recents in navigation and global search, but do not leave them all visible by default. Route-specific secondary tabs are local to that resource, not 20 extra sidebar links.

**Navigation contracts:**
- All existing URLs remain routable and bookmarked URLs continue to work.
- New detail URLs are added, not substituted abruptly.
- Old \`/admin/tickets?ticket=<id>\` continues to resolve the conversation.
- Deep link to a resource from global search must reach that resource's actual page.
- Back links preserve search, filters and cursor where feasible.
- Staff permissions decide navigation **and** server API access; hiding UI alone is insufficient.
- Sidebar collapsed state and favourites may persist client-side, but no sensitive data in local storage.

## 3. Global shell / interaction model

Proposed standard 1440px desktop page layout:

\`\`\`text
+------------------+------------------------------------------------------------+
| Sidebar          | Top: Breadcrumbs    Search / Cmd-K     Alerts   Operator |
| Dashboard        +------------------------------------------------------------+
| Customers        | Page header: Title & state           [Primary] [...]      |
| Orders           | Subtitle: what this screen is for                         |
| Hosting          +------------------------------------------------------------+
| Support          | [Quick filters] [Search............] [Advanced filters]   |
| Operations       | [Active filter chips] [Saved view] [Columns] [Export]     |
| Settings         +------------------------------------------------------------+
|                  | CHECKBOX | Entity | Customer | Status | ... | Updated     |
|                  | ... 25/50 rows, consistent and keyboard accessible ...      |
|                  +------------------------------------------------------------+
|                  | Page summary / selected-count | Previous  Next / Load more|
+------------------+------------------------------------------------------------+
\`\`\`

Resource detail model:

\`\`\`text
Breadcrumbs: Customers / <customer>
[Avatar] Name · identity · status [Primary safe action] [...]
[MRR] [Active services] [Payments] [Open tickets] [Last activity]
[ Overview | Services | Billing | Support | Security | Activity ]
Left main content (only active tab)     Right contextual panel (if useful)
\`\`\`

**Performance pattern:** one summary API, tab-specific paginated requests, cache/stale semantics and clearly visible last-refresh time. Do not eager-load every list of invoices, payments, tickets, devices, VPS, mail, logs just because they belong to a customer.

### Compact density guidelines (initial design targets, not mandated implementation values)
- Header bar 48–64px content height; page title 20–24px; subtitles short.
- Dense table rows 40–52px depending on input density, not 90px padded cards.
- Toolbar one row at desktop and folded filters at mobile.
- Overview shows at most 4–6 metrics; keep extra measures behind tab or drill-down.
- Empty state occupies the relevant tab/panel, not an enormous bordered box for every absent relationship.
- High-priority notices surface in the top third of a view, not below ten unrelated sections.
- Use spacing tokens; do not hardcode different dimensions in every view.

## 4. Component system: create useful special-purpose admin primitives

### 4.1 AdminDataGrid (foundation)
Extend existing \`DataTable\` and \`CardList\` with a typed controlled container (TanStack Table or equivalent may be evaluated only if justified; avoid redundant dependency). Features:
- Column schema with ID, header, cell formatter, data type, permissions, sort key, optional custom cell.
- Column visibility and ordering, sensible defaults per view, pinning only when it actually improves workflows.
- Safe fixed header/scroll area and responsive mobile rows using same data and filter state.
- Server-side search, sort, cursor and count; no fake client-side sorting over only 50 server rows.
- Row selection + bulk action toolbar, including correct "current page vs all matching" semantics; explicit server selection token for all matching if ever supported.
- Popover column chooser; date, money, status and relationship cell renderers.
- Keyboard and focus handling. A simple semantic table is preferred unless interactive grid complexity justifies full WAI-ARIA grid keyboard model.
- Empty / loading / retry / permission / stale-data states; predictable pagination when filters change.
- Saved views per staff member or team, permissioned by visibility; URL shareable query state.
- Export of same filtered dataset with access enforcement, cap/asynchronous export for huge results and audit of sensitive exports.
- API standard envelope: \`items\`, \`pagination{nextCursor,hasMore}\`, \`total?\`, \`appliedFilters\`, \`sort\`, \`generatedAt\`; adapt legacy endpoint responses rather than replacing all at once.

### 4.2 FilterBuilder
- Quick filters appropriate to each domain plus advanced composable filters.
- Operators: equals / contains / in / not-in / greater/less than / between / exists; typed per-column validation.
- Text, select, multi-select, date, money, numeric range, status and service relation.
- Selected filters visible as removable chips; Reset and Save view.
- Debounced search, cancel previous requests, server determines authoritative results.
- Filter state in URL for sharable, recoverable views, avoid secrets/PII in query params.

### 4.3 ResourceHeader + DetailTabs
- Breadcrumbs, resource status, reference ID with copy, 1–2 safe primary actions, privileged More menu.
- State-driven action gating from server capabilities, not guessing from a label.
- Tabs organized around tasks, with per-tab empty/error/loading and counts.
- Deep-link active tab via URL or query; browser Back/Forward; unsaved draft protection.
- Critical warnings visible regardless of active tab; tab data lazy-loaded.
- All cross-entity chips clickable. No raw unlinked IDs or provider strings when a destination exists.

### 4.4 Timeline / ActivityExplorer / DiffViewer
- Activity list grouped by time and correlation, compact by default.
- A row answers WHO, WHAT, ON WHICH RESOURCE, WHEN, OUTCOME and HOW VERIFIED.
- Changes display safe before/after diffs, source and operator reason; secrets redacted.
- Fold many logins or health heartbeats into a bounded group while retaining filterable full history.
- Correlation panel: request -> job -> provider event -> state transition -> email/outbox -> customer result.
- Permissioned export and tamper/audit-gap notices.

### 4.5 Focused operational primitives
- \`MoneySummary\` (currency, gross/refund/net, period, source).
- \`StatusTransitionMenu\` (backend-allowed transitions only).
- \`DangerActionDialog\` (specific target, exact consequences, reason, explicit authorization/step-up where appropriate).
- \`BillingChain\` (Order -> Payment -> Invoice -> Subscription -> Resource).
- \`DeploymentTimeline\` (queued, provider call, instantiated, healthy, rollback/error).
- \`ServiceHealth\` (observed/last sampled, not simulated).
- \`ResourceUsage\` (CPU/RAM/disk/quota; units + time).
- \`LinkedEntityList\` (customer, service, ticket, domain, incident).
- \`AsyncExport\` (limits, progress, access logs).
- \`SettingsSection\` (ownership, validation, change review).
- \`QueueRunInspector\` (job params scrubbed, attempts, retry, dead-letter).
- \`CaseWorkflow\` (abuse/incident status, evidence, assignment and allowed actions).

## 5. Cross-domain entity graph and navigation

Canonical logical chain, based on existing Prisma relations and APIs:

\`\`\`text
User / Customer
  |-- Session / Passkey / 2FA / DeviceSignal
  |-- AuditLog (actor or target)
  |-- Orders -> OrderItems -> Subscriptions
  |       |         |               |-- Instance (Pterodactyl)
  |       |         |               |-- VpsService (Proxmox)
  |       |         |               |-- MailService (Mailcow)
  |       |         |                        +-- MailDomain -> Mailboxes / Aliases
  |       |         +-- delivery/provision resources
  |       +-- Payment -> provider identifiers / refunds
  |       +-- Invoice -> provider identifiers
  |       +-- notifications / webhooks / risk / promotions
  |-- Tickets -> TicketMessages / TicketEvents / Attachments
  |-- Notifications / NotificationEvent / MailDelivery
  |-- Notes / tags / risk
  +-- Domains (instance domains and mail domains are different sources)
\`\`\`

**Customer 360** must expose all service families, not just app instances. **Orders** must expose each line's delivered resource and related subscription. **Invoices/payments** deserve direct detail (or dedicated immutable ledger view). **Global search** must route VPS directly to new VPS detail, rather than only \`/admin/vps\`.

A relationship must have:
- an authoritative source key, never inferred by matching emails;
- ownership/tenant binding;
- consistent permission policy;
- direct route and breadcrumb to parent;
- relation count and pagination;
- "not linked" state distinct from "not loaded".

## 6. Activity Explorer: know meaningful customer and staff actions end-to-end

### 6.1 Goal and boundary
Operators need to reconstruct account and service history: signup, verified, logged in, ordered, paid, provisioned, started/stopped/reinstalled, changed network/DNS/config, created backups, opened tickets, received notifications, cancelled/refunded. This is **not** permission to secretly record every cursor movement, keystroke, private message content or password.

Do not log raw file contents, secret values, console commands or email/message bodies by default. Audit sensitive administrative *access* without exfiltrating the accessed values. Apply purpose limitation, retention, controlled access and required privacy disclosures under applicable law.

### 6.2 Existing journals and integration
Current \`AuditLog\` contains: \`actorId\`, \`actorEmail\`, \`action\`, \`targetType\`, \`targetId\`, \`meta\`, \`ip\`, \`createdAt\`.
Other sources: Session lastSeen, DeviceSignal, InstanceEvent, TicketEvent, NotificationEvent, MailDelivery, webhook events, billing state and provider activity. Do not pretend these are all complete or equally reliable.

\`audit()\` deliberately swallows DB errors. For operational actions, an occasional audit gap is recoverable only if it is detectable. For financial, account-permission, suspension, refunds, secret access, impersonation and destructive controls, design reliable event delivery with transactional outbox or same-DB transaction (depending on synchronous invariants); monitor delivery and dead letters. Avoid creating duplicate side effects when audit delivery retries.

### 6.3 Proposed normalized activity envelope
An event records, as available and appropriate:

\`\`\`text
eventId, eventVersion, occurredAtUtc, receivedAtUtc
action (namespaced), category, outcome(success|failed|pending|denied)
actorType(customer|staff|system|api|provider), actorId, onBehalfOfId?
customerId/subjectUserId, tenantId if multi-tenant, impersonatorId?
resourceType, resourceId, parentResourceType/id
orderId?, subscriptionId?, serviceId?, ticketId?
requestId, correlationId/traceId, jobId?, providerEventId?
sourceSystem, actorSessionFingerprint? (not raw session token)
ipAddress? (restricted), userAgentClass? (not full fingerprint unless justified)
reason?, safeMetadata (schema-validated allowlist), safeChangedFields
retentionClass, sensitivity, createdAt, integrityMarker?
\`\`\`

Use proper DB indexes such as (customerId, occurredAt desc, id), (resourceType, resourceId, occurredAt desc), (actorId, occurredAt desc), (correlationId). Queries must be scoped, paginated and RBAC checked. An activity projection may be populated from old journals with \`sourceRecordId\` deduplication and clear source provenance. Never rewrite old events to fit the new taxonomy.

### 6.4 Event taxonomy required and truth conditions
| Category | Representative events | Required links | Privacy/reliability notes |
|---|---|---|---|
| Authentication | register, login success/fail, 2FA, passkey, reset, session revoke, impersonation | actor, account, session | log outcome, never password/code/token |
| Orders & money | order create/checkout, payment success/failure, invoice, refund, cancellation, subscription renew/expire | customer, order, payment, subscription | provider vs app state; amount/currency; idempotency |
| Apps & databases | deploy, failed provision, power, reinstall, file mutation, DB create/delete, backups, allocations, startup/environment change | customer, instance, job | filenames may be sensitive; secrets scrubbed |
| VPS | VM created, power, reinstall, resource override, snapshots, SSH key update, mount ISO, destroy | customer, VPS, node, order | do not store private key/console output |
| Mail & domains | service created, domain verified, mailbox/alias created/deleted, DNS checks, delivery failure | customer, mail service/domain | do not log email bodies or passwords |
| Support | conversation created/replied, internal note, assignment, SLA, bot transfer, automation execution | ticket, customer, related service | private notes must remain staff-only |
| Staff/admin | role/permission change, impersonation, suspend, reset 2FA, force action, settings change, manual refund | actor, subject, resource, reason | high-integrity and step-up controls |
| Infrastructure | queue retry, reconcile, sync, backup/restore drill, incident, webhook replay | job, node, incident, affected resource | provider outcomes, correlation and monitoring |

### 6.5 UI workflow
**Global Activity Explorer** (\`/admin/activity\`, proposed) is a searchable, server-paginated table with:
- filters: customer, actor, actor type, resource type/ID, action, outcome, date/time, source, channel, correlation, IP when authorized;
- view presets: Sign-ins, Security, Billing, Provisioning, Infrastructure changes, Staff actions, Failed operations;
- event row showing actor, target, action, state, time, source; detail drawer with safe metadata, related links, timeline chain;
- privacy roles: Support can see necessary support events, Billing financial, Tech infrastructure, Security privileged IP/session access, Owner overall. No universal unmasked default.
- human-readable descriptions mapped from typed event registry; unknown event types remain visible rather than being silently discarded;
- export only with permission, maximum scope and audited access.

**Customer Activity tab** = same query engine scoped to exact customerId.  
**Resource Activity tab** = same engine scoped to resourceType/id.  
**Order Events tab** = order-scoped evidence first; account-wide events link to Customer Activity, never appear as order events.  
**Security tab** = session and identity signals with reasoned permissions.

### 6.6 Monitoring
- Audit writer error rates and pending outbox age.
- At least one synthetic event test and daily reconciliation by event count/sources.
- Alert on gaps, failed delivery and unauthorized export access.
- Audit read access to sensitive logs where justified.
- Configurable retention by category and legal obligations, with deletion and export behavior explained. Immutability and privacy laws must both be considered, not absolute indefinite retention.
- Prefer separation between **security audit** (strong integrity) and **product analytics** (aggregate, consent-aware where applicable). Do not confuse those pipelines.

## 7. Business metric correctness

Before displaying customer MRR and Net Spent as prominent numbers:
- derive subscription-level recurring revenue from ACTIVE subscriptions across apps, VPS and mail, not \`Instance.price\` only;
- account for monthly/yearly cadence, discounts, quantity, currency, cancellations, trial/free periods and how annual subscriptions are normalized;
- define MRR = monthly normalized contracted recurring amount, excluding one-off purchases; distinguish expected MRR from actually collected cash;
- display per-currency totals, or use an explicitly labelled converted amount with FX source/time; never sum EUR and USD numerically as one currency;
- derive Gross Received, Refunded and Net Received from verified provider events and internal payment/refund ledger; don't equate \`SUCCEEDED\` aggregate with lifetime net paid;
- partial refund eligibility must be server/provider authoritative; a €0 paid order may have no refundable Stripe charge;
- expose source-of-truth and last reconciliation time in the UI.

No data rewrite until accounting rules are audited against existing payments/orders/refunds/Stripe and operator has reviewed resulting reconciliation.

## 8. Permission, security and privacy design

Model permissions around resources and actions, not merely page visibility:
- Customers: read, support-sensitive read, write, sensitive account/security actions.
- Billing: orders.read/write, payments.refund, invoices.read/export, pricing.write.
- Services: read, power, reinstall, suspend, destroy, backup restore, DNS/mail write.
- Support: conversations read/reply/internal notes/assign, automations/bots admin.
- Operations: alerts read/ack, queue retry, infra sync, reconciles.
- Security: audit.read, sensitive session/IP access, impersonation, export logs.
- Settings: scope/field owner, secrets isolated, second-factor/step-up when justified.

Review actual existing \`api/src/lib/permissions.ts\` / \`api/src/plugins/auth.ts\` before introducing names; these are proposed permissions, not claims the RBAC currently has them. Restrict exports, impersonation, credentials and destructive actions. Include who-the-operator-is-acting-as persistent banner during impersonation, expiry and auditing; no invisible impersonation.

## 9. Performance, accessibility and reliability targets

Set and verify against controlled fixture datasets, not unsupported production claims:
- 100, 1k, 10k+ customer/order/service records; 100k+ activity records.
- Standard list initial render should not need to fetch all records. 25–50 rows/page as practical; selectable density and page size only when backend supports it.
- Avoid nested \`include\` for huge relations (notably Customer 360 and large reports).
- Search queries indexed where possible; slow query budgets and explain plans.
- Page load skeleton, no forced scroll jumps after loading, stable row identity.
- Accessible semantic table for ordinary lists, WAI-ARIA grid only when implementing full grid keyboard contract. Tablist focus, Escape/return focus, contrast, zoom, touch targets, screen reader announcements and reduced-motion.
- SSR/Vite existing architecture respected, no new UI framework without evidence.
- React component tests + API contract tests + Playwright 320/390/768/1024/1440/1920, 200% zoom.
- Security and permissions tested server-side for every sensitive action and filter/export endpoint.

References (benchmark standards, not an instruction to copy):
- W3C WAI-ARIA Grid APG: https://www.w3.org/WAI/ARIA/apg/patterns/grid/
- OWASP Logging Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html

## 10. Zero-loss delivery strategy

1. Inventory all 35 pages, 28 nav items, existing CRUD operations, permissions, query endpoints, settings and cross-links. Before/after parity matrix.
2. Financial correctness + audit integrity risks P0 before making new executive numbers central.
3. Build AdminDataGrid, FilterBuilder, ResourceHeader, DetailTabs, ActivityTimeline and action safety primitives; migrate one simple list first.
4. Implement Customers/Orders lists and Customer 360/Order Detail; link to complete subscription/resource family.
5. VPS/app/mail/catalog/pricing pages; restore missing destinations with correct source-based data.
6. Support console, ticket/abuse cross-route consistency; bots/automation editor route and state retention.
7. Ops/infrastructure/jobs/backup/status, communications/staff/settings and read-only views.
8. Activity Explorer and reconciled event taxonomy, gradual source adapters, secure audits and trace correlation.
9. Full E2E + security + data integrity + accessibility and performance verification, operator release/rollback.

Use small PRs or reviewable commits, additive schema changes and feature flags where necessary; preserve all data. Do not merge, deploy or execute destructive migrations without explicit approval.

## 11. Objective acceptance checklist

- 35/35 existing routes accessible and linked; no lost control or hidden functionality.
- 100% original action inventory mapped to current/new UI, with backend guards and tests.
- All large collections have real server pagination/filter/search; no misleading truncated list without navigation.
- No default detail view forces hundreds of activity rows into one page.
- Every major entity has a dedicated detail route and related entities are navigable both ways.
- Customer 360 includes apps/VPS/mail, subscriptions, invoices, payments, tickets and properly scoped activity.
- Core finance metrics reconciled, not estimated silently.
- All critical admin mutations produce reliable traceable audit events, with failures visible.
- No secrets or unnecessary personal data leak into logs, UI, URLs or exports.
- At least four staff role scenarios E2E-tested; all status/action transitions cross-checked with API.
- Visual screenshots and test runs for all routes at desktop and mobile; no unsupported claims of success.
- Old routes/bookmarks, data and history preserved, including bot drafts and notifications.

## 12. Review and integration notes

PR #16 (\`audit/admin-ux-reorg-20261103\`) is a separate existing draft implementing preliminary sidebar regrouping, customer tabs, pagers and order audit UI. This specification is derived from current main instead, which has newer commits. Before implementation, reconcile PR #16 against main and do not blindly merge obsolete changes. This document is a design/engineering plan, not a merged implementation.

**Next workstream after /admin:** audit \`/app\` with the same route inventory, data relationships, mobile UX, role boundaries and action parity. Do not mix it into the current admin redesign until admin foundation and components are stable.
