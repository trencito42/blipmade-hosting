# BLIPMADE ADMIN 3.0 — CANONICAL IMPLEMENTATION HANDOFF TO CHATGPT WORK / CODEX

**This is the final, authoritative implementation brief for /admin.**
**Repository:** trencito42/blipmade-hosting
**Continue ONLY on branch:** audit/admin-master-spec-20261103 (PR #17).
**Existing PR #16:** already merged into main; keep its good changes. Avoid recreating or overwriting them.
**Next project after /admin:** /app, deliberately out of scope now.

## Mission

Implement Blipmade Admin 3.0 as a polished, state-of-the-art hosting business control plane. The goal is a cohesive high-density, fast, responsive UI with advanced tables, rich and appropriate specialized inputs, separated create/edit routes, excellent operator workflows and trustworthy customer/service/billing/activity relationships.

It is NOT enough to make existing screens a little rounder or turn all input fields into green-bordered HTML controls. Build the proper interaction architecture, premium components, backend contracts and QA. Reuse Blipmade's existing visual system, fonts, palette, icon assets and component primitives.

### Mandatory reading order before code changes

1. audit/admin-master-2026-11-03/README.md
2. **PREMIUM-COMPONENTS.md** — latest, strongest design/interaction standards.
3. **EDITOR-ROUTE-BLUEPRINT.md** — route-by-route mapping for all 35 existing admin views, including future dedicated create/edit/action pages.
4. VIEW-MATRIX.md — current data/controls/filters, source findings for each view.
5. SYSTEM-DESIGN.md — shared design, entity graph, Customer 360 and Activity Explorer.
6. FUNCTIONAL-AUDIT.md, SECURITY-AUDIT.md, VISUAL-AUDIT.md — evidence and unanswered runtime questions.
7. EVENT-COVERAGE.md — existing audit streams and gaps.
8. IMPLEMENTATION-QA.md — phased testing and non-destructive release gates.
9. API-SCAN-*.md and UI-SCAN-*.md — source reference inventories, not proof of successful tests.

Where an older document suggests putting creation/editing in a modal, **PREMIUM-COMPONENTS.md and EDITOR-ROUTE-BLUEPRINT.md override it**. This latest requirement comes from the product owner.

## Explicit product requirements

**A. No endless scrolling.**
- No 11-card Customer Detail; use compact overview + tabs + paginated subresources.
- No full audit log or notes history on the same page as vital data.
- No long inline editor under Customers, Orders, VPS, Mail, Products, Pricing, Staff, Notifications, Content or Settings.
- No large unbounded panel, empty-state repetition or filter stack that consumes most of the first viewport.
- The operator must quickly see health, business impact, affected entity, safe next step.

**B. Full-page editors.**
- EVERY meaningful persistent create/edit/configure action routes to a dedicated, deep-linkable page, including plan editing, VPS resource adjustment, price updates, permission changes, bot workflows, notifications/templates and settings.
- Modals only for final confirmation, small transient pickers and read-only information; do not create a multi-step editor modal.
- Each edit route: correct permissions, source record, dirty state, save/discard, real validation, independent refresh, browser history, optional version conflict/diff, request outcome and audit.
- Reuse shared PageEditorShell/EditorSections/EditorFooter and contextual preview.

**C. Premium, purposeful controls.**
- NumberStepper and UnitStepper for CPU/RAM/disk/quotas, not naked number inputs.
- Slider + stepper for genuinely continuous resource choice; constrain to provider/node/plan capabilities.
- ButtonGroup with correctly merged borders and outside corners; SplitButton only for genuinely related actions.
- Advanced FilterBuilder, AsyncCombobox, searchable MultiSelect, saved view filters, date/time range and timezone controls.
- MoneyInput and PercentageInput with exact server-side financial normalization.
- RadioCards for plan/provider/region comparison, DNS typed editor, secret reveal, permission tree, rich text/code editor, product variants, audit diff.
- ActionMenu for infrequent/dangerous actions; real server role permissions; descriptive disabled reasons.
- Keyboard accessibility and clear loading/error/empty/stale states for all.

**D. Data grids with real capabilities.**
- DataGrid across Customers, Orders, Services, VPS, Mail, Products, Support, Audit, Staff, Notifications, Jobs, Reports, Incidents.
- Server-powered sort/filter/pagination and configurable columns, privacy-aware export, saved personal/team views, batch actions with explicit selection scope.
- No fake client-side filtering of only current page as if it were the full dataset.
- Distinct dense desktop and readable mobile representation.

**E. Relationships and activity.**
- Customer 360: Account/Security, Apps, VPS, Mail, Orders, Payments, Refunds, Invoices, Subscriptions, Tickets, Tags, Notes, Activity.
- All major entity views have bidirectional resource/order/customer links and true current state.
- Implement Activity Explorer with meaningful user/staff/business actions, correlation across providers and jobs, redaction/privacy, not invasive clickstream or secret capture.
- Existing audit writes can fail silently; design durable outbox or transactional integrity for critical operations, with alert and reconciliation.
- Financial metrics must be correct across currencies, billing periods, active subs, refunds and Stripe outcomes.

**F. Zero-loss migration.**
- Preserve all existing 35 registered admin routes, 28 navigation entries, APIs, data, staff roles, support bot/automation drafts, email settings, reports and audit records.
- New editor/detail routes are additive; update old buttons to point to them, preserve old deep links.
- Each migration has explicit old-action -> new-view -> endpoint -> permission -> audit -> tests parity.
- Never remove a working behavior to reduce the amount of code.
- Do not change production environment, merge main or deploy without explicit owner approval.

## Implementation sequence (do not stop at planning)

### Stage 0 — baseline and acceptance inventory
- Fetch latest main; reconcile this branch and PR #17. Verify every route/API before writing code.
- Build machine-readable 35-route + action + permission + editing-destination map. Capture current staging screenshots for each route.
- Establish TypeScript, unit, API integration, Playwright baseline; record pre-existing defects. Never claim browser success without running the browser.

### Stage 1 — premium component workbench
- Extend ui-app.tsx foundations rather than replacing design system.
- Build all essential components from PREMIUM-COMPONENTS.md (especially steppers, grouped buttons, advanced filters, menus, editor layouts, grid and saved views).
- Create an internal, data-safe component gallery with default/hover/focus/disabled/loading/error/long-text/mobile variants, real keyboard behavior and visual snapshot tests.
- Do not begin mass screen migration before the primitives are reviewed and usable.

### Stage 2 — correct core domain data and APIs
- Normalize customer MRR per active subscription/currency/period; refund-aware financial facts.
- Resource/relationship API read endpoints and dedicated editor mutation endpoints where missing.
- Define per-field/range capabilities from backend providers; frontend steps/limits cannot be invented.
- Implement role-safe audit/outbox improvements, correlation and event filtering, without leaking secrets.
- Safely migrate existing API consumers. Use additive DB migrations only with rollback plan.

### Stage 3 — customers + orders + billing
- Rebuild grid, filter, saved views and routes.
- Customer 360 structured, per-tab paged, Activity and related links; full-page account/security/credit edits.
- Orders index and order lifecycle + full-page refund/retry; accurate Stripe provider/ledger states.
- Introduce finance ledger/invoice/payment detail as backed by real data and RBAC.

### Stage 4 — hosting and catalog
- VPS inventory and dedicated individual VPS page/resource editor.
- Apps/DB instance detail and operation routes.
- Email admin overview, services, domains, mailboxes, jobs, mail plans; all serious edits on pages.
- Product catalog/editor, pricing, addons, promotions, infrastructure/capacity.
- All async provider actions are marked pending/failed/completed truthfully.

### Stage 5 — support and trust
- Unified support queue, Ticket Detail, Knowledge editor, Support Bot and Automation builders with versions/simulator.
- Abuse and Incidents with precise state machines, evidence, timeline and dedicated enforcement/update pages.
- Preserve internal-note and private-evidence boundaries.

### Stage 6 — operations, communications, staff and settings
- Job Center, repair workflows, backups and incident response; audit/activity explorer.
- Notifications, email templates, content with dedicated editors and clear publication lifecycle.
- Staff detail/permission matrix/security page and categorized searchable settings.
- Preserve all deep links and operator permissions, never invent "healthy" service status.

### Stage 7 — sign-off
- 35/35 existing routes + every new route renders direct URL and reload.
- Every original control tracked and mapped to new destination.
- Each view tested at 320, 390, 768, 1024, 1440 and 1920px, 200% zoom, keyboard, reduced motion.
- Empty/1/50/200/1,000 data fixtures, long text and rate/server/provider errors.
- Read-only/support/billing/technical/admin roles tested both UI and API; no sensitive data leaks.
- Financial Stripe sandbox, mail sandbox and provisioning fixture tests, races and retry/idempotency.
- Build, TS, unit, integration, E2E and screenshot reports with commands/outcomes.
- Produce actual before/after gallery for review and a non-destructive release/rollback plan.

## Implementation reporting and continuation rules

For each stage, commit on this single branch, note:
- routes completed / still pending;
- component APIs created and tests;
- original controls retained and migrated;
- backend changes and permissions;
- screenshots at desktop/mobile;
- tests run with exact PASS/FAIL (never invented);
- unresolved blockers and next actionable work.

**Do not declare Admin 3.0 done if a single required workflow is untested or a screen uses basic controls where specialized controls are specified without justified exception.** If the execution environment cannot finish, leave fully resumable commits and a machine-readable status table, and report accurate partial completion. No promise of background work.

## Final acceptance

A premium, cohesive, efficient control plane that can serve real hosting operators with thousands of customers/services: every major action discoverable, deeply linked, permission-controlled, correctly audited and performant, without giant vertical scrolling or hidden loss of functionality.

Only after owner approves the completed /admin implementation and staging tests, start the separate /app audit and design project.
