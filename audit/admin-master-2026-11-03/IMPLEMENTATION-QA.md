# Admin 3.0 — implementation plan, acceptance gates, zero-loss checklist

**Date:** 2026-11-03  
**Baseline:** main a5adf356e194ef01b46836915f0aad976e6184e1  
**Read alongside:** [SYSTEM-DESIGN.md](./SYSTEM-DESIGN.md) + [VIEW-MATRIX.md](./VIEW-MATRIX.md).

## Work order

### Gate 0: version, inventory and preservation
- [ ] Refresh main and reconcile with draft PR #16. Do not overwrite code added since baseline (notably support enhancements).
- [ ] Enumerate 35 registered pages, 28 primary admin links, original and legacy deep links, 7 existing secondary routes, all API paths, per-field setting ownership.
- [ ] Make feature/action parity spreadsheet or JSON: route, control, endpoint, HTTP method, permission, async outcome, audit event, migrated destination, before/after test. The action table is the contractual source of completeness.
- [ ] Use sanitized seed DB and distinct staff roles; take real production snapshot with verified restore procedure before any future DB migration.
- [ ] Ensure all work occurs on review branch, not on live deployment.
- [ ] Collect real screenshots of every current admin view, desktop 1440 and mobile 390, through authorized browser session in Work/Playwright. This static source audit cannot substitute for those screenshots.
- [ ] Baseline current build/typecheck/test results and response times. Report any preexisting failures separately.

### Gate 1: foundation and high-priority correctness
- [ ] Implement trusted customer MRR across active Subscription records, normalized periods, currency boundaries and free products.
- [ ] Produce Gross paid / Refunded / Net paid from an explicit reconciled ledger, not simply sum of SUCCEEDED payments.
- [ ] Backend returns refund eligibility, amount refundable, provider ID, status, partial refund history, not only order status. Correct UI and confirmation.
- [ ] Audit critical administrative actions using reliable transactional/outbox pattern; include correlation and result. Monitor write failures. Preserve legacy AuditLog.
- [ ] Uniform server-side role and cross-tenant permission validation, account-acting banner during impersonation, reason for sensitive admin action.
- [ ] Add code-level tests for all monetary and auditing calculations.

### Gate 2: reusable admin foundations
- [ ] AdminDataGrid interface, typed columns and cell formatters (money, status, datetime, relation).
- [ ] FilterBuilder with quick filters, advanced typed operators and Reset/Save.
- [ ] Cursor pagination and URL synchronization; no client-only sorting if backend returns partial pages.
- [ ] Column preference and responsive representation per view, permission checks for exports.
- [ ] ResourceHeader / DetailTabs / ContextPanel / ActivityTimeline / DangerActionDialog.
- [ ] Component stories/fixture screenshots/keyboard tests; use existing design tokens and Font Awesome abstraction.
- [ ] Define compact density, focus and touch targets and test at 320px, 390px, 768px, 1024px, 1440px and 1920px.

### Gate 3: customers and commerce
- [ ] Customers / Orders list migration with real filters, search, sorting, cursor and column chooser.
- [ ] Customer 360 with apps, VPS, mail, orders, invoices, payments, subscriptions, tickets, notes, risk, security, activity.
- [ ] Order Detail commerce pipeline, linked resources and order-specific audit separate from account audit.
- [ ] Promotions, Reports, Pricing and product editor convergence; price version preview and commercial metrics.
- [ ] Optional new Finance ledger route for payments/refunds/invoices with permission-scoped direct links and exports.
- [ ] Verify historical records, multi-currency, zero-price, failure/refund/partial refund cases.

### Gate 4: hosting inventory and provider operations
- [ ] Services and /admin/services/:id details.
- [ ] VPS grid + /admin/vps/:id, including monitoring, power, reinstall, snapshots, network, billing with safe actions.
- [ ] Mail overview/services/domains/mailboxes/jobs/plans and provider state.
- [ ] Infrastructure and existing Capacity module after verifying utilization vs provider.
- [ ] Cross-customer Domain inventory if API and access policy support it.
- [ ] Dedicated backup/restore readiness, never promise offsite recovery without independent successful restore test.
- [ ] Provider failures represented as pending/failed states and correlated jobs, never false success toasts.

### Gate 5: support, trust and incident response
- [ ] Unified support console and ticket-inbox alias: no duplicate broken workflows.
- [ ] Human chat/presence, assignment, internal notes, attachment boundaries, inbox pagination and reconnect.
- [ ] Dedicated bot and automation editors with draft restoration and version history.
- [ ] Knowledge base, SLA analytics/policies and support settings.
- [ ] Abuse lifecycle, closed-case restriction and reopening flow, server enforced.
- [ ] Incidents and announcements separated, publication preview and audit.

### Gate 6: operations, communications, team
- [ ] Ops health/alerts/backups/webhooks; Job Center including dead letters; repair tool runbooks.
- [ ] Unified Activity Explorer and customer/resource embedded timelines.
- [ ] Notifications delivery/event/template/transport into coherent subviews without deleting event data.
- [ ] Email template versioning, content structured editor and safe publish.
- [ ] Staff user detail, permission role UI and security settings.
- [ ] Settings searchable and deep-linkable, advanced control restricted.

### Gate 7: end-to-end regression and release preparation
- [ ] 35/35 routes render with correct role and direct refresh.
- [ ] 35/35 routes tested desktop and mobile using actual browser automation.
- [ ] Before/after control parity with all original actions; no feature regressed or silently removed.
- [ ] All important list views handle data sizes 0, 1, 25, 50, >200, >1,000, concurrent changes.
- [ ] Monetary changes match server/provider truth.
- [ ] Sensitive actions respect backend permissions and audit requirements.
- [ ] UI conditions: loading, empty, provider down, forbidden, partial failure, invalid form, timeout, offline/retry.
- [ ] Keyboard/focus/reader checks and responsive no-horizontal-overflow.
- [ ] Production build, type checks, integration/unit/e2e and accessibility tests actually executed; record command and output.
- [ ] Run smoke tests on staging, back up real DB + restore drill, rollout/rollback instructions, explicit approval before merge/deploy.

## Acceptance tests grouped by user task

### A. Find any customer
Given a customer with app+VPS+mail+paid/refunded invoices:
1. Search by name/email/ID through Customers and global search.
2. Open Customer 360 directly from URL; verify name, masked email and correct rights.
3. See active service counts for all families and full subscription MRR by currency, with period normalization.
4. Jump customer -> order -> payment -> invoice -> delivered service -> back to customer.
5. Check that no private key, token, full card or plaintext secret is exposed.
6. Open Activity to see ordered correlated business actions and sign-ins where authorized.
7. Page through >50 invoices/orders/tickets instead of receiving a dead-end truncation notice.

### B. Diagnose an order
For a zero-value order, a partially-refunded order, a full refund, a failed payment and a delivery failure:
1. The list shows exact state and sensible available actions for each.
2. Refund UI uses provider-backed eligibility/remaining amount and refuses duplicates.
3. Payment and fulfilment histories are distinct.
4. Notifications/webhooks/jobs are linked to the same correlation.
5. Read-only billing role sees no operational refund control, and direct API attempt receives forbidden.
6. Order Activity shows order-scoped events; customer login spam is in Customer Activity only.

### C. Diagnose an instance/VPS
1. Search by user/resource name/VMID/IP/provider id.
2. Open resource detail directly and identify owner/plan/node/status/billing.
3. Confirm real status freshness and errors.
4. Recover relevant job/backup/incident timeline.
5. Safe actions require authorization, exact resource and confirmation; destructive calls must be idempotent.
6. Provider failure does not show success. Retry and audit are correlated.

### D. Serve a support conversation
1. Live chat creates durable conversation and appears in unified inbox.
2. Staff status and department assignment work.
3. Bot handoff, macro, ticket reply and internal note retain visibility boundaries.
4. Filtering, search, pagination and direct ticket link work.
5. SLA and human first response metrics distinguish bot from human.
6. Customer context exposes only permitted service/billing fields.

### E. Investigate a suspicious case
1. See active abuse/incident cases first, archived separately.
2. Dismissed report cannot suspend from its closed workflow.
3. Explicit reopening with reason restores allowed actions.
4. Every enforcement has actor/reason/resource/outcome.
5. Reporter identity is protected; unrelated customers cannot access evidence.

### F. Monitor and repair platform
1. Start from critical dashboard alert, navigate to exact check/node/job/resource.
2. See last healthy sample, attempt count and failure reason.
3. Dry-run a correction when supported; preview effects.
4. Execute with appropriate permission and reason, trace provider result and audit.
5. Verify no unlimited log list or unbounded synchronous response.

### G. Manage configuration safely
1. Search an existing setting and discover owning section.
2. View active value with secrets masked and controlled revealed statuses.
3. Edit with schema validation; preview diff.
4. Unauthorized role cannot change it via UI or direct API.
5. Confirm changes in audit, rollback through supported mechanism.
6. Refresh/navigation does not lose uncommitted forms without warning.

## Route-parity registry
The exact 35 currently registered routes, all of which must remain reachable:

| # | Route | Tier |
|---|---|---|
| 1 | /admin | primary |
| 2 | /admin/customers | primary |
| 3 | /admin/customers/:id | detail |
| 4 | /admin/orders | primary |
| 5 | /admin/orders/:id | detail |
| 6 | /admin/services | primary |
| 7 | /admin/services/:id | detail |
| 8 | /admin/vps | primary |
| 9 | /admin/products | primary |
| 10 | /admin/pricing | primary |
| 11 | /admin/support/analytics | primary |
| 12 | /admin/support/automations | primary |
| 13 | /admin/support/bots | primary |
| 14 | /admin/support | primary |
| 15 | /admin/tickets | primary |
| 16 | /admin/knowledge | primary |
| 17 | /admin/tickets/:id | detail |
| 18 | /admin/promotions | primary |
| 19 | /admin/promotions/:id | detail |
| 20 | /admin/infrastructure | primary |
| 21 | /admin/incidents | primary |
| 22 | /admin/reports | primary |
| 23 | /admin/queues | primary |
| 24 | /admin/abuse | primary |
| 25 | /admin/abuse/:id | detail |
| 26 | /admin/ops | primary |
| 27 | /admin/mail | primary |
| 28 | /admin/mail/plans | detail |
| 29 | /admin/audit | primary |
| 30 | /admin/staff | primary |
| 31 | /admin/settings | primary |
| 32 | /admin/email-templates | primary |
| 33 | /admin/content | primary |
| 34 | /admin/tools | primary |
| 35 | /admin/notifications | primary |

**Total = 28 primary + 7 detail.** Some are already implemented through nested components; "detail" does not mean currently missing.

## Engineering status reporting template

For each view in implementation PR:
- Current route, old/new screenshot.
- Original controls count and preserved controls count.
- New/changed UI components.
- New/changed API endpoints and permission checks.
- Type-check/unit/e2e/accessibility commands plus actual pass/fail.
- Verified data size and viewport.
- Known limitations and required operator-only configuration.
- Deploy/rollback considerations.
- Review sign-off and link to source commit.

No checkmarks without evidence. If browser execution is unavailable, label the test *not run*, not passed. If a proposal requires a separate authorization/consent decision, do not implement data collection first and ask later.

## Handoff to /app

After /admin foundations are implemented and measured:
- reuse shared primitives and event schema;
- audit customer /app navigation, forms, service pages and mobile workflows independently;
- preserve strict admin/customer boundaries; do not leak internal notes/security fields into client dashboard;
- reuse customer 360 relations for authorized customer self-service read views;
- keep /app out of the current /admin PR until admin route parity passes.
