# Blipmade Admin 3.0 — comprehensive source audit & implementation specification

**Initial architecture snapshot:** main `a5adf356e194ef01b46836915f0aad976e6184e1`.  
**Additional functional/security/visual audit snapshot:** main `48df705f110b46f7d2a7d90ef33e0cd0a289f74c` (2026-11-03).  
**Scope:** 35 registered admin routes, 28 sidebar entries, 48 API route files, 46 admin React view/shared components, 8 owner screenshots (not uploaded, for privacy).  
**Audit result:** source inventory and prioritized design/security/functional analysis completed. **No authenticated live 35-route browser audit, penetration test, CI build or staging E2E was executed. Do not claim only implementation remains until execution gates are passed.**

## Completed additional source audit
- [FUNCTIONAL-AUDIT.md](./FUNCTIONAL-AUDIT.md): view-by-view action inventory, 486 literal API route registrations, 121 admin mutation registrations, functional issues and executable staging test contract.
- [SECURITY-AUDIT.md](./SECURITY-AUDIT.md): verified defenses, priority weaknesses, false-positive corrections and required role/cross-tenant/financial tests.
- [VISUAL-AUDIT.md](./VISUAL-AUDIT.md): 35-route static visual audit, screenshot-by-screenshot findings, older-vs-current revision differences, exact responsive and accessibility acceptance plan.
- [Read-only browser evidence collector](../../web/e2e/admin-audit-readonly.spec.ts): opt-in Playwright test covering all 35 URLs at six widths (210 cases), requiring staging staff state and six seeded IDs. **Added, NOT executed**. Do not use production customer/staff data.
- [UI-SCAN-1.md](./UI-SCAN-1.md), [UI-SCAN-2.md](./UI-SCAN-2.md), [UI-SCAN-3.md](./UI-SCAN-3.md), [UI-SCAN-4.md](./UI-SCAN-4.md): raw component, call and control signatures.
- [API-SCAN-1.md](./API-SCAN-1.md), [API-SCAN-2.md](./API-SCAN-2.md), [API-SCAN-3.md](./API-SCAN-3.md), [API-SCAN-4.md](./API-SCAN-4.md): route method/path/permission hints; static false positives explicitly require review.

## Existing architecture / implementation planning

## Read in this order

1. [VIEW-MATRIX.md](./VIEW-MATRIX.md): current behavior & redesign for **every one of the 35 /admin routes**, with exact grid fields, filters, destinations and per-view notes.
2. [SYSTEM-DESIGN.md](./SYSTEM-DESIGN.md): proposed IA, reusable AdminDataGrid and special-purpose components, Customer 360, entity/route graph, reliable activity explorer, privacy boundaries and measurable UX standards.
3. [EVENT-COVERAGE.md](./EVENT-COVERAGE.md): audit/logging source inventory, current direct-audit references, gaps and structured event taxonomy.
4. [IMPLEMENTATION-QA.md](./IMPLEMENTATION-QA.md): phased full implementation with route parity, functional and responsive test cases, and zero-data-loss gates.

## Key conclusions

- **Don't rebuild working functionality**. Refactor the presentation and add missing navigable details.
- **UI foundation exists**: AppShell, command search, DataTable, CardList, ConfirmDialog, Segmented, theme/typography and Font Awesome integration.
- **Biggest UX issues**: long Customer Detail and Order Detail, VPS action-heavy cards, Mail/Ops/Notification catch-all screens, and list-level filter/pagination inconsistencies.
- **Biggest correctness issues**: partial customer MRR, unreconciled Total Spent, non-authoritative refund affordances, cross-scope order activity, and lack of a reliable unified audit timeline.
- **Main feature proposal**: an RBAC-aware Activity Explorer / Customer 360 linking account, service, order, invoice, payment, subscription, support and operational events without collecting secrets or unlimited clickstream.
- **Keep current routes intact**: all 35 routes are already registered; 7 are secondary/detail routes. New routes should be additive and old deep links should resolve.
- **Don't mislabel the new ticket/abuse implementation as old**. The provided screenshots may lag current main: re-check deployed revision before fixing.
- **PR #16 exists separately** with preliminary UI changes on an older base. Rebase/reconcile carefully; do not blanket merge it into newer main.

## What these files are NOT

Not a deployed redesign, not a successful browser end-to-end test, not an assertion that financial data are correct, and not permission for destructive actions. A comprehensive **product+architecture source audit and implementation contract** only.

## Start implementation

Use a coding agent with access to this repository and test execution. Ask it to:
1. Read these four documents entirely.
2. Generate a control/route/API permission parity matrix.
3. Baseline tests and real before screenshots.
4. Implement Gates 0–7 in `IMPLEMENTATION-QA.md` as reviewable changes, reporting tests and incomplete work clearly.
5. Keep all data/features, do not merge/deploy without authorization.

After /admin passes acceptance gates, perform an independent /app audit and implementation using the reusable design system.
