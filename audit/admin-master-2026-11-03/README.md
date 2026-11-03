# Blipmade Admin 3.0 — audit & implementation specification
**Snapshot:** main `a5adf356e194ef01b46836915f0aad976e6184e1`, 2026-11-03
**Scope:** all 35 registered admin routes / 28 primary nav entries; focus on /admin, not /app.
**Method:** GitHub source review, current route and component inventory, relevant API/schema checks, and screenshots supplied by the owner. Not a live authenticated browser/CI/security acceptance audit.

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
