# Blipmade admin: complete route-by-route UX and architecture audit
Date: 2026-11-03
Base commit: 7286e148fb6dc3a80de49be8dd9183ad1c8ab5b7
Repository: trencito42/blipmade-hosting
Status: source-code inspection plus user-provided production screenshots. No production data writes, browser E2E run, or build verification.

## 0. Scope, confidence and counting

Inspected: 1,442 tracked paths from the Git tree; web/src/nav.ts; web/src/routes.tsx; every top-level admin TSX page (42 files); the 4 nested ticket/abuse page components; relevant API routes in api/src/routes/admin.ts, admin-control.ts and admin-ops.ts; shared sidebar architecture and existing test inventory. Source inspection is not a runtime verification of every user journey.

There are 28 primary admin navigation entries, 35 registered admin routes and 7 detail/secondary routes that are correctly omitted from the main menu. Numerous additional exported UI components are embedded in those views. All 28 primary routes appear in the new grouped sidebar. No route was removed.

Priorities: P0 = potential financial/authorization correctness issue; P1 = significant usability/scalability/operational issue; P2 = refinement. Terms such as "missing" describe a missing focused admin view or workflow, not necessarily a missing backend capability.

## 1. Executive findings

1. Most admin capabilities already exist. The root issue is poor progressive disclosure and task-based hierarchy, not an insufficient number of cards.
2. Customer Detail is 1,085 lines of UI with 12 top-level panels and four large activity-related lists. It is much too long for day-to-day triage. Replace with a compact overview and lazy tab content, retaining all current tools.
3. Order Detail presents broad user-level audit events as if they were related to one order; the API currently queries targetType=order OR targetType=user for the same account, returning up to 100 results. Separate order-scoped activity from account activity in the response and UI. No events should be deleted.
4. The Customers list's monthlyValue sums non-cancelled instances only. It omits other product families, especially hosted email and VPS, and is not a defensible platform-wide customer MRR metric. The top-level overview MRR already sums subscriptions, so use a coherent reconciled definition.
5. Customer totalSpent sums SUCCEEDED payments without explicit refund subtraction and without separating currencies. Expose gross receipts, refunds and net receipts per currency; do not present a mixed-currency sum as a single amount.
6. Customers and Orders use cursor-paginated APIs but the views show a truncation notice rather than real Next/Previous/Load More navigation. Same problem should be evaluated for Services and other lists.
7. Order Detail displayed retry-delivery and full-refund buttons without checking orders.write in the view. The API has permission checks, but the UI should not offer unusable high-impact actions to read-only staff. A minimal frontend guard is included in this branch.
8. Orders uses paid/fulfilled status to offer refund actions, which can be misleading for zero-value orders or those without refundable provider transactions. Expose authoritative refund eligibility and remaining refundable amount from server.
9. The newer Ticket Inbox and Abuse Inbox implementations already improve the earlier screens. Avoid blindly repeating older audit recommendations: the source now has dedicated ticket and abuse detail pages, and Abuse has a paginated active/archive workflow.
10. Support Console is distinct from the ticket queue but has a pagination.hasMore notice without a clear mechanism to access further results. Reconcile both under one support information architecture with all URLs preserved.
11. VPS management mixes overview, power controls, free resources, commercial plan changes, billing reconciliation and destructive operations into each server card. A dedicated server detail route is necessary.
12. The standalone Capacity.tsx component has no registered admin route. Determine whether it should be restored as an Operations > Capacity view or safely integrated into Infrastructure; do not delete it.
13. The admin has several very large source modules: EmailNotifications (2,110 lines), Mail (1,589), CustomerDetail (1,085), MailProducts (1,123), Ops (977). Source file size alone is not a defect, but cohesive split-by-domain components and tab-level loading would improve maintainability.
14. There is no standalone admin inventory for all customer DNS/domain records or a consolidated financial ledger for payments, refunds and invoices. Existing workflows are distributed across other screens.
15. The admin sidebar already supports groups, remembers expansion in localStorage and has a command palette. Improve its task-oriented grouping and keep the active group visible, rather than reverting to a huge flat menu.

## 2. Proposed information architecture (no deleted routes)

- Dashboard: Dashboard.
- Customers & sales: Customers, Orders, Promotions, Reports.
- Products & pricing: Catalog, Pricing.
- Hosting services: Services, Servers, Mail, Infrastructure.
- Support desk: Support console, Support queue, Knowledge base.
- Support workflows: Support bots, Support automations, Support numbers.
- Trust & status: Abuse reports, Incidents.
- Operations: Operations, Job queues, Operator tools, Audit log.
- Communications: Email & notifications, Email wording, Site content.
- Team & settings: Staff, Settings.

This layout is implemented as a sidebar-only change in web/src/nav.ts in the audit branch. The flat ADMIN_NAV and all registered route definitions remain unchanged. The mobile Support tab now opens Support Console, while the Ticket Inbox route still exists.

For a later release, add persistent favorites/recent pages and use the existing command palette as quick navigation; do not require users to expand multiple groups. Active-route recognition, responsive behavior and staff permission filtering need browser regression tests.

## 3. Primary views: individual findings and target redesign

### Dashboard — /admin — P1
Existing: customers, instances, open tickets, today's orders, revenue, MRR, provisioning failures, shortcuts.
Finding: metrics are useful but not consistently linked to an operator's next action; the aggregate view needs reconciled business definitions.
Target: compact KPI strip; actionable panels for failed provisioning, overdue invoices, critical alerts and support SLA; recent changes only; click-through counts with filters. Avoid redundant empty cards. Add date range and "as of" time.

### Customers — /admin/customers — P0/P1
Existing: search, role and tag filters, masks, counters, bulk tag operations, created date.
Finding: monthlyValue omits subscription families; filters stack vertically; cursor pagination is not exposed through list controls; counts reflect app instances rather than all active services.
Target: one-line responsive toolbar, saved filters, sorting and pagination; verified/suspended/payment-state filters; show true MRR by currency and total active services. Preserve privacy masking and bulk tags, with selection limited clearly to the chosen scope.

### Orders — /admin/orders — P0/P1
Existing: status pills, items, customer, currency, partial/full refunds, list responsive variants.
Finding: no direct search by order number/customer/product; refund actions dominate each row; eligibility based largely on order status; no user-facing cursor navigation.
Target: search + date + product/channel + payment and fulfilment filters; cursor pagination; hide destructive actions in contextual menu; server-side refundable amount and eligibility; clear distinction between zero-value paid, refunded and partially refunded.

### Promotions — /admin/promotions — P1
Existing: campaign create/edit, active switch, usage counts, redemption controls.
Finding: create form and list share a long surface, while advanced campaign fields are easy to overwhelm an operator.
Target: list with filters and columns for activation, expiry, remaining uses, conversions; creation as focused route or wizard; deep-link to campaign; preserve existing promotion semantics and protections.

### Reports — /admin/reports — P1
Existing: MRR, subscriptions, customer trends, cancellation trends, product mix, top customers.
Finding: basic 12-month view is useful but does not form a complete financial operations screen, and should not be confused with a reconciled ledger.
Target: selectable time range, currency-aware KPIs, gross/net/refund breakdown, conversion and cohort metrics where supported, exports; define every metric and compare against validated financial sources.

### Services — /admin/services — P1
Existing: hosting instances search, status, resources, retry provision.
Finding: "Services" means app instances, while mail and VPS live elsewhere; this naming is ambiguous. Cursor backend appears to outgrow view pagination.
Target: label "Apps & databases" or show a clear cross-service scope; filtered paginated table with customer, product, node, health, last update; details route for each service. Avoid actions in bulk rows.

### Servers — /admin/vps — P1
Existing: VPS cards with IP, VMID, resources, power, reinstall, delete, plan change and free adjustments; allocation and billing panels.
Finding: per-server cards stack many high-risk actions. No registered /admin/vps/:id page.
Target: responsive VPS inventory table, health and failed-state filters, direct /admin/vps/:id detail with tabs Overview/Compute/Network/Billing/Events/Actions. Keep power and destruction operations behind correct confirmation and permissions. Keep allocations/billing checks in operational views, not repeated under every VM.

### Mail — /admin/mail — P1
Existing: Mailcow health, usage, mail services, domains, queued jobs, filters and cursor pagination.
Finding: overly broad operational surface in a 1,589-line component, mixing infrastructure health with customer inventory.
Target: compact email-system overview, separate tabbed or routed Services, Domains, Jobs and Health. Keep mail plan page /admin/mail/plans reachable with clear route. Cache stable summary while paginating detailed tables.

### Catalog — /admin/products — P1
Existing: products, availability/deployability, creation and editor, deletion, usage protection.
Finding: dense management UI, substantial inline editor/source complexity, limited navigation from product inventory.
Target: catalog table + product-specific editor page or clearly bounded side sheet; tabs General/Deployment/Resources/Pricing/Availability/History. Always explain impact on already deployed customer instances before mutable changes.

### Pricing — /admin/pricing — P1
Existing: product prices, platform rate card, add-ons, yearly discount, price change history.
Finding: price settings and histories occupy the same broad view; commercial changes require explicit preview and consistent units.
Target: compact pricing matrix, dedicated rate card, Add-ons and History tabs; price previews including tax and billing interval; exact currency/minor-unit normalization; versioned and permissioned changes.

### Support Console — /admin/support — P1
Existing: conversation views, presence, search, departments, SSE refresh fallback, guest/photo settings.
Finding: settings panels (departments, guest behavior, staff photo) live below the operating inbox; hasMore is displayed without clear navigation to the rest of the result set. It links through legacy ticket query URL.
Target: agent workspace dedicated to conversations only; pagination/load more or infinite cursor; customer context and queue selection; move presence profile to staff preferences and departments/guest policy to Support Settings. Preserve SSE fallback behavior.

### Support Queue — /admin/tickets — P1
Existing: now delegates to new TicketInbox with paged list and direct ticket detail route, not the old narrow 360px master/detail implementation.
Finding: overlaps with Support Console. Distinct lists make a unified helpdesk confusing if not defined.
Target: preserve this route as a tickets-filtered inbox or redirect/alias to unified console; do not delete its history or query deep links. Verify row keyboard nav, status filter, page cursors and unread state.

### Knowledge Base — /admin/knowledge — P1
Existing: help articles in a support configuration API, search/edit/creation.
Finding: one-page article editor and a second documentation ecosystem; source-of-truth relationships should be explicit.
Target: article index plus dedicated editor, draft/publish/version/permissions, linking to public docs with no duplicate content maintenance; article analytics and safe deletion/archival.

### Support Bots — /admin/support/bots — P1
Existing: bot list, editable flow, visual map, versions, import/export, simulator.
Finding: complex editor nested in a single route; losing browser history or a draft is a risk when navigating away.
Target: separate /admin/support/bots/:id with explicit draft/published status, unsaved changes guard, node inspector, flow simulation and history; maintain backend bot versions.

### Support Automations — /admin/support/automations — P1
Existing: rules, enable/disable, run history, dry-run, business-hours panel.
Finding: rules and business hours share one view; execution history can expand arbitrarily inside each rule.
Target: rules list, rule editor route, run-history route, schedules/business-hours settings; confirmation for irreversible actions and strong loop/idempotency visibility.

### Support Numbers — /admin/support/analytics — P2
Existing: periods, departments/channels, SLA, rating analytics.
Finding: SLA policy editing and performance analytics are separate jobs in one view.
Target: Analytics default + SLA Policies subview; definitions, percentile-based response time, handoff metrics, sample size and time-zone labels; do not count bot replies as human replies.

### Abuse Reports — /admin/abuse — P1
Existing: newer AbuseInbox with Active/Investigating/Resolved/Dismissed/All, search and 25-item pages.
Finding: previous inline-card version shown in screenshots is now out of date relative to source; use browser tests to validate new lifecycle. A dismissed report must not trigger report-linked suspension from any endpoint.
Target: keep paginated case list and dedicated detail, add saved views and investigator assignment if backend supports; ensure audit and reopen paths.

### Incidents — /admin/incidents — P1
Existing: public-status incident creation/updates and announcements in same view.
Finding: incident timeline and announcements are two separate workflows; both are high-impact public publishing operations.
Target: Status incidents list/detail with update timeline, separate Announcements subview, scheduled maintenance and archive; publish preview, explicit notification audience and rollback/close semantics.

### Operations — /admin/ops — P1
Existing: sweep health, alerting, channels, backups, incident declaration, automation diagnostics.
Finding: nearly 1,000-line operating page; too many monitors and actions without an operator task hierarchy.
Target: concise Health Overview with critical/warning cards then tabs Health checks / Alerts / Backups / On-call / Events. Sticky severity filters, refresh timestamp, accessible alert acknowledge and runbook links. Preserve all existing controls.

### Infrastructure — /admin/infrastructure — P1
Existing: Pterodactyl node/egg synchronization and capacity allocation.
Finding: Pterodactyl-only view is narrower than the actual platform (Proxmox, VPS, Mailcow, edge, Caddy, storage and backups).
Target: provider-aware Infrastructure landing page, with Nodes, Compute, Storage, Networking, Templates, Health; keep provider-specific diagnostic details under dedicated tabs, avoid overstating coverage that API cannot provide.

### Job Queues — /admin/queues — P1
Existing: queue failures, requeue/remove actions.
Finding: queue jobs and Dead Letters in Operator Tools are overlapping operational concepts; browser confirm and row-level dangerous actions need consistent treatment.
Target: unified Job Center list by state and queue, detail for attempt history, dead-letter controls with proper confirmation and audit, paging and concurrency safety.

### Operator Tools — /admin/tools — P1
Existing: dead letters, price reconciliation, email delivery.
Finding: grab bag of high-impact repair controls; duplicates the conceptual Job Queues area and belongs under specific operational categories.
Target: repair/runbook hub that links to specialized operations and shows dry-run before execution. Preserve every endpoint, but stop using a generic tool page as a catch-all.

### Audit Log — /admin/audit — P2
Existing: paginated cursor-based infinite list, filters, metadata, email masking.
Finding: fundamentally stronger list plumbing than Customers/Orders. Follow this cursor pattern for other lists.
Target: add immutable export by scope, entity-level deep links, time range and safe compact detail disclosure; avoid rendering huge JSON values in the main row.

### Email & Notifications — /admin/notifications — P1
Existing: delivery ledger, event ledger, templates, transport, trends, preferences; tabbed UI and pagination.
Finding: 2,110-line source module with many unrelated concerns; rich functionality but difficult to maintain.
Target: divide into typed subviews and lazy route/tab modules, emphasize delivery health and failed events on landing, add search and copyable correlated identifiers. Do not confuse "written to file" with delivered email.

### Email Wording — /admin/email-templates — P1
Existing: template wording, version/preview tools.
Finding: overlaps with notification template editor and operational delivery interface.
Target: single template library entry point with preview, test send, version history and active overrides; preserve both existing API workflows until safe consolidation.

### Site Content — /admin/content — P1
Existing: edit JSON content blocks, draft/publish/unpublish and preview.
Finding: raw JSON editing is flexible but error-prone for general operators.
Target: typed field editors for common blocks, advanced JSON behind disclosure, preview, change diff and publish confirmation; no changes to published content without review.

### Staff — /admin/staff — P1
Existing: staff list, role and fine-grained permissions grid with confirmation.
Finding: permission editing for every member in a shared list creates visual overload and invites mistakes.
Target: staff table + member detail with RBAC tabs (Role, Permissions, Sessions, Security, Audit). Show inherited vs explicit permissions and require proper step-up for sensitive changes.

### Settings — /admin/settings — P1
Existing: control map, structured company/tax settings, operator groups, staff security, advanced registry and ownership mapping.
Finding: already tabbed, which is better than a giant stack, but control map and advanced data structures need searchable navigation and clear ownership.
Target: categorized settings index with deep-linkable sections, searchable settings and change preview. Keep advanced, but protect it; do not show secrets or make provider-side switches writable by broad support roles.

## 4. Seven registered secondary/detail routes

1. /admin/customers/:id — P0/P1: 12-panels-tall customer record. Tabs Overview, Services, Billing, Support, Risk & Security, Account activity. The header should show status, customer identity, true MRR, service counts and actionable alerts. Lazy-load large collections. Preserve suspend, impersonation, profile, notes, tags, credits, invoices, orders, support, subscription and panel controls.
2. /admin/orders/:id — P0/P1: sticky order summary, commercial and fulfilment states, tabbed Payments/Invoices, Provisioning, Notifications, Order Activity; move user-wide events to separate Customer Activity. Refunds only when authorized and provider-eligible. Interim fix in this branch collapses audit and gates order-write buttons.
3. /admin/services/:id — P1: split service runtime, allocations, commercial chain, diagnostics, backups and audit, with safe destructive actions and links to customers/orders.
4. /admin/tickets/:id — P1: message timeline, customer context, assignment and internal notes in responsive conversation view, not large stacked lists. Preserve unread/read states, attachment privacy and legacy deep links.
5. /admin/promotions/:id — P1: overview, redemptions and history tabs, schedule and caps. Validate date-zone conversion and preview eligibility changes.
6. /admin/abuse/:id — P1: case overview, evidence, investigation, activity and linked service; status-based server-authorized actions. Closed reports must be re-opened explicitly, not edited silently.
7. /admin/mail/plans — P1: mail plan catalog/editor. Deep-link it from Email Hosting settings, standardize edit/review/commit and impact-on-existing-service presentation.

## 5. Embedded admin modules not registered as main pages

- Capacity.tsx: presently no admin route; candidate for an Operations > Capacity route with node utilization and margins, after checking data freshness and accounting rules.
- Commerce.tsx: add-ons, price history and yearly-discount panels embedded in Pricing; keep under Pricing tabs.
- ProductEditor.tsx: sophisticated product detail editor embedded from Catalog; candidate for standalone route.
- VpsOperations.tsx: allocations and billing checks embedded under Servers; move into operational tabs while retaining behavior.
- StaffSecurity.tsx: staff security embedded in Settings; link it directly from Staff detail and security controls.
- EmailTools.tsx: template preview/version and delivery coverage embedded in email tooling; avoid duplicating template libraries.
- SupportAi.tsx, ContextPanel.tsx, FlowCanvas.tsx: embedded helpdesk AI, customer context and bot flow canvas. Keep them as shared specialized components, with dedicated parent workspace and server RBAC.

## 6. Missing focused admin views, not necessarily missing capabilities

High-value additions:
- /admin/vps/:id: direct individual server control.
- /admin/finance or /admin/billing: searchable payments, invoices, refunds and adjustments ledger, with per-currency totals and reconciliation.
- /admin/domains: cross-customer inventory of verified domains, DNS/SSL status and ownership, distinct from mail-only domains.
- /admin/capacity: expose existing Capacity module if it remains accurate.
- /admin/backups: restore readiness, offsite health, restore drills and customer backup coverage (or a dedicated Operations tab).
- /admin/support/settings: departments, guest permissions, chatbot provider settings and presence configuration outside live inbox.
- /admin/security: staff authentication posture, active sessions, sensitive admin actions and audit cross-links, or a dedicated Settings subroute.

These are proposals. Their necessity and authorization boundaries must be validated against actual product and operator requirements before implementation.

## 7. Cross-view design rules

- One compact page header with title, 1-line context, one primary task and a small secondary action menu.
- Default views answer "what needs attention?" before listing every raw database record.
- Use tables for collections, detail pages for entities, and drawers/modal forms for a single focused task.
- Search/filters/sort/pagination state encoded in query parameters and restored via browser history.
- Compact desktop filter toolbar; responsive overflow/stacking for narrow screens.
- Every table with >25 records needs working pagination or measured virtual scrolling. API cursor and UI controls must agree.
- Details: primary summary + tabs; lazy-fetch tab content to reduce overhead; optional sticky contextual sidebar on large desktops.
- For empty groups, show counts and concise inline "None yet" rather than giant empty panels; preserve full histories in their tabs.
- Put dangerous and infrequent actions in a restricted "More/Actions" menu; high-impact actions require target confirmation and reason.
- Business values have defined currency, units, effective status, period, source and reconciliation rules.
- Never show raw payment tokens, private keys, customer secrets or full PII unless authorized and necessary.
- Preserve mobile keyboard and safe area, 320px width, 200% zoom, keyboard-only navigation, focus management and reduced motion.
- Use existing Blipmade components/tokens and Font Awesome abstraction, avoiding a competing component library.
- Keep dark theme contrast adequate; support visible focus, accessible tables and screen-reader status changes.
- No new hardcoded platform configuration: options come from persisted admin settings with permission checks.

## 8. Non-destructive implementation roadmap

Phase 0, safety: save complete backup and restore proof; enumerate routes, permissions, APIs, settings keys, models, existing data and test baselines; publish route/feature parity matrix.
Phase 1, correctness P0: reconcile customer MRR and spent/refunds by currency; correct refund eligibility/remaining amount; fix rights-based frontend rendering; separate order/user audit retrieval without removing logs.
Phase 2, data lists: reusable paginated list API/hooks, searches, URL state, filters, sorting; migrate Customers, Orders, Services, Servers, Promotions.
Phase 3, customer/order detail: compact summaries, tabs and focused actions; migrate every existing form, backend action and history; preserve original deep links and add redirects only where essential.
Phase 4, hosting operations: VPS detail, Mail segmentation, Infrastructure and Capacity, backups and job center.
Phase 5, customer support: unify Support Console with ticket filtered views, separate bot/automation editors, knowledge and settings, retain all existing bot versions and conversations.
Phase 6, communications/configuration: notifications, templates, content and role management.
Phase 7, polish: full responsive/accessibility review, security/authorization matrix, load and E2E regression, release in small increments with feature flags if needed.

No tables or endpoints should be deleted as part of a UI-only refactor. Do not modify stored user data to accommodate the new layout. Data migrations, if needed, must be additive with rollback and restore plan. Existing deep links, exports, customer controls and audit events must remain usable.

## 9. Minimum quality gates

For EVERY one of the 35 routes:
- Staff read-only and staff write permission behavior, with backend 403 checks.
- Desktop 1440, laptop 1024, tablet 768, mobile 390/320 and large text.
- Empty/loading/error/full data.
- Direct navigation, refresh, browser back/forward, deep links.
- No 404 or broken navigation after regrouping.
- No horizontal overflow, inaccessible action, trapped focus or lost unsaved changes.
- Filter/search/next-page persistence and no duplicated missing rows.
- Correct amount, currency, dates, labels and status.
- High-impact API concurrency/idempotency and audit trail.
- A record-by-record migration parity checklist for all old controls.
- CI typecheck, unit tests, E2E browser tests and production build.

Specific high-value E2E:
- Two users in different roles: orders.read-only cannot see or activate refund controls.
- Customer with app + VPS + email has correct combined subscription MRR.
- Paid, zero-value, partially refunded and fully refunded orders show truthful eligibility.
- Order detail only displays order events by default and retains account events through a separate scoped view.
- Customers/Orders reach beyond record 200 and maintain filters.
- Support chat/ticket deep links survive migration.
- Abuse closed case cannot suspend through report route; can be explicitly reopened.
- No server, invoice, ticket, message, note, DNS entry, bot flow, setting or audit row disappears due to UI refactor.

## 10. Changes included with this audit branch

Changed web/src/nav.ts:
- reorganized 28 existing menu entries into 10 task-oriented groups;
- moved phone support shortcut to /admin/support;
- left ADMIN_NAV and all 35 route registrations intact.

Changed web/src/admin/CustomerDetail.tsx:
- added Overview / Services / Billing / Support / Account & Security tabs;
- preserved all 11 existing domain panels, controls, deep links and backend operations;
- reduced the default customer screen from a full vertical stack to the profile summary and risk section. URL-based tab selection and browser E2E still need implementation.

Changed web/src/admin/OrderDetail.tsx:
- added orders.write frontend gating for high-impact buttons and confirmation dialog, while preserving backend authorization;
- collapsed the long audit section by default so it can still be opened with every original record intact.

Added web/tests/admin-nav-coverage.test.mjs:
- regression assertions for all 28 primary navigation entries, sidebar coverage, registered routes and support phone shortcut; not yet executed.

Not changed: database, production infrastructure, API behavior, deployed UI or customer data.

## 11. Verification status and limitations

Verified by code inspection: menu/route count, file inventory, listed UI features, documented API query shapes, monthlyValue implementation, customer gross spend aggregation, broad order audit selection, page-size mechanics, absent Capacity route, missing order detail role gating in base, current newer abuse/tickets implementations.

Not verified: live browser interactions, build/typecheck, tests, production deploy, external billing/provider behavior, permissions under every role, data accuracy against a live Stripe ledger, operational runtime and accessibility under assistive technologies. Do not label these as passed.

This audit does not certify every admin view as "perfect". It defines route-by-route remediation, a sidebar reorganization, a first-pass customer detail tab layout and a limited order detail fix; a production-grade completion claim requires all quality gates above to be executed and passed.
